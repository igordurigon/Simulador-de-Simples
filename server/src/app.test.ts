// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarApp, garantirAdmin, type Servidor } from './app.ts'
import { conferirSenha, hashSenha } from './senha.ts'

const JSON_H = { 'content-type': 'application/json' }
const ADMIN = { email: 'admin@empresa.com', senha: 'senha-do-admin' }

let dir: string
let s: Servidor
let agora = 1_700_000_000_000

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sim-'))
  agora = 1_700_000_000_000
  s = await criarApp({ dataDir: dir, agora: () => agora })
  await garantirAdmin(s, { ADMIN_EMAIL: ADMIN.email, ADMIN_SENHA: ADMIN.senha, ADMIN_NOME: 'Ana Admin' })
})

afterEach(async () => {
  await s.app.close()
  rmSync(dir, { recursive: true, force: true })
})

type Resp = Awaited<ReturnType<Servidor['app']['inject']>>
const cookieDe = (r: Resp) => {
  const c = r.cookies.find((x) => x.name === 'sid')
  return c ? `sid=${c.value}` : ''
}
const chamar = (metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, opc: { cookie?: string; corpo?: unknown; headers?: Record<string, string> } = {}) =>
  s.app.inject({
    method: metodo, url,
    headers: { ...JSON_H, ...(opc.cookie ? { cookie: opc.cookie } : {}), ...opc.headers },
    payload: opc.corpo === undefined ? undefined : JSON.stringify(opc.corpo),
  })
const login = async (email: string, senha: string) => {
  const r = await chamar('POST', '/api/login', { corpo: { email, senha } })
  return { r, cookie: cookieDe(r) }
}
const logarAdmin = async () => (await login(ADMIN.email, ADMIN.senha)).cookie

/** Cria um usuário comum já com a senha trocada, devolvendo o cookie dele. */
async function criarUsuario(cookieAdmin: string, email = 'maria@empresa.com', perfil = 'usuario') {
  const c = await chamar('POST', '/api/usuarios', { cookie: cookieAdmin, corpo: { nome: 'Maria', email, perfil, senha: 'inicial-123' } })
  expect(c.statusCode).toBe(201)
  const { cookie } = await login(email, 'inicial-123')
  const t = await chamar('POST', '/api/eu/senha', { cookie, corpo: { senhaAtual: 'inicial-123', novaSenha: 'definitiva-456' } })
  expect(t.statusCode).toBe(200)
  return { id: c.json().usuario.id as number, cookie, email }
}

describe('senha', () => {
  it('usa scrypt com formato fixo e confere certo/errado', async () => {
    const h = await hashSenha('segredo123')
    expect(h.split('$')).toHaveLength(6)
    expect(h.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(await conferirSenha('segredo123', h)).toBe(true)
    expect(await conferirSenha('segredo124', h)).toBe(false)
  })
})

describe('login', () => {
  it('entra com credenciais corretas e define cookie httpOnly', async () => {
    const r = await chamar('POST', '/api/login', { corpo: { email: 'ADMIN@empresa.com ', senha: ADMIN.senha } })
    expect(r.statusCode).toBe(200)
    expect(r.json().usuario).toMatchObject({ email: ADMIN.email, perfil: 'admin', nome: 'Ana Admin', trocarSenha: false })
    const c = r.cookies.find((x) => x.name === 'sid')!
    expect(c.httpOnly).toBe(true)
    expect(c.sameSite).toBe('Lax')
    expect(c.secure).toBeFalsy()
    const eu = await chamar('GET', '/api/eu', { cookie: cookieDe(r) })
    expect(eu.statusCode).toBe(200)
  })

  it('marca o cookie como Secure atrás de proxy HTTPS', async () => {
    const r = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha }, headers: { 'x-forwarded-proto': 'https' } })
    expect(r.cookies.find((x) => x.name === 'sid')!.secure).toBe(true)
  })

  it('falha com mensagem genérica para senha errada e e-mail inexistente', async () => {
    const a = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: 'errada-errada' } })
    const b = await chamar('POST', '/api/login', { corpo: { email: 'ninguem@x.com', senha: 'errada-errada' } })
    expect(a.statusCode).toBe(401)
    expect(b.statusCode).toBe(401)
    expect(a.json()).toEqual({ erro: 'E-mail ou senha incorretos.' })
    expect(b.json()).toEqual(a.json())
  })

  it('bloqueia após 5 falhas e libera depois de 15 minutos', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: 'errada-errada' } })
      expect(r.statusCode).toBe(401)
    }
    const bloqueado = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha } })
    expect(bloqueado.statusCode).toBe(429)
    expect(bloqueado.json().erro).toMatch(/Tente novamente em 15 minutos/)
    // outro e-mail não é afetado
    expect((await chamar('POST', '/api/login', { corpo: { email: 'outro@x.com', senha: 'x' } })).statusCode).toBe(401)
    agora += 15 * 60 * 1000 + 1000
    const ok = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha } })
    expect(ok.statusCode).toBe(200)
  })

  it('logout invalida a sessão', async () => {
    const cookie = await logarAdmin()
    expect((await chamar('POST', '/api/logout', { cookie })).statusCode).toBe(200)
    expect((await chamar('GET', '/api/eu', { cookie })).statusCode).toBe(401)
  })

  it('a sessão expira em 12h e renova depois da metade', async () => {
    const cookie = await logarAdmin()
    agora += 7 * 3600 * 1000
    const renovou = await chamar('GET', '/api/eu', { cookie })
    expect(renovou.statusCode).toBe(200)
    expect(renovou.cookies.find((x) => x.name === 'sid')).toBeTruthy()
    agora += 7 * 3600 * 1000 // 14h desde o login, mas só 7h desde a renovação
    expect((await chamar('GET', '/api/eu', { cookie })).statusCode).toBe(200)
    agora += 13 * 3600 * 1000
    expect((await chamar('GET', '/api/eu', { cookie })).statusCode).toBe(401)
  })

  it('sem sessão a API responde 401', async () => {
    expect((await chamar('GET', '/api/eu')).statusCode).toBe(401)
    expect((await chamar('GET', '/api/usuarios')).statusCode).toBe(401)
  })
})

describe('proteção de requisições', () => {
  it('exige application/json em requisições que alteram dados', async () => {
    const r = await s.app.inject({ method: 'POST', url: '/api/login', headers: { 'content-type': 'text/plain' }, payload: 'x' })
    expect(r.statusCode).toBe(415)
    const sem = await s.app.inject({ method: 'POST', url: '/api/logout' })
    expect(sem.statusCode).toBe(415)
  })

  it('recusa Origin diferente do Host e aceita o mesmo', async () => {
    const mal = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha }, headers: { origin: 'https://atacante.com', host: 'simulador.empresa.com' } })
    expect(mal.statusCode).toBe(403)
    const bem = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha }, headers: { origin: 'https://simulador.empresa.com', host: 'simulador.empresa.com' } })
    expect(bem.statusCode).toBe(200)
  })

  it('valida entrada com mensagens em português', async () => {
    const cookie = await logarAdmin()
    const r = await chamar('POST', '/api/usuarios', { cookie, corpo: { nome: 'X', email: 'x@x.com', perfil: 'usuario', senha: 'curta' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toBe('A senha deve ter no mínimo 8 caracteres.')
    const r2 = await chamar('POST', '/api/usuarios', { cookie, corpo: { nome: 'X', email: 'invalido', perfil: 'usuario', senha: '12345678' } })
    expect(r2.json().erro).toBe('Informe um e-mail válido.')
    const r3 = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email } })
    expect(r3.json().erro).toBe('Preencha o campo senha.')
  })
})

describe('troca obrigatória de senha', () => {
  it('usuário criado pelo admin só acessa /api/eu e troca de senha até trocar', async () => {
    const cookieAdmin = await logarAdmin()
    await chamar('POST', '/api/usuarios', { cookie: cookieAdmin, corpo: { nome: 'Maria', email: 'maria@empresa.com', perfil: 'usuario', senha: 'inicial-123' } })
    const { r, cookie } = await login('maria@empresa.com', 'inicial-123')
    expect(r.json().usuario.trocarSenha).toBe(true)
    expect((await chamar('GET', '/api/eu', { cookie })).json().usuario.trocarSenha).toBe(true)
    const bloqueada = await chamar('GET', '/api/usuarios', { cookie })
    expect(bloqueada.statusCode).toBe(403)
    expect(bloqueada.json().trocarSenha).toBe(true)
    // senha atual errada, nova curta e nova igual à atual
    expect((await chamar('POST', '/api/eu/senha', { cookie, corpo: { senhaAtual: 'x', novaSenha: 'definitiva-456' } })).statusCode).toBe(400)
    expect((await chamar('POST', '/api/eu/senha', { cookie, corpo: { senhaAtual: 'inicial-123', novaSenha: 'curta' } })).statusCode).toBe(400)
    expect((await chamar('POST', '/api/eu/senha', { cookie, corpo: { senhaAtual: 'inicial-123', novaSenha: 'inicial-123' } })).statusCode).toBe(400)
    const ok = await chamar('POST', '/api/eu/senha', { cookie, corpo: { senhaAtual: 'inicial-123', novaSenha: 'definitiva-456' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().usuario.trocarSenha).toBe(false)
    expect((await login('maria@empresa.com', 'inicial-123')).r.statusCode).toBe(401)
    expect((await login('maria@empresa.com', 'definitiva-456')).r.statusCode).toBe(200)
  })

  it('redefinir a senha marca troca pendente e derruba as sessões', async () => {
    const cookieAdmin = await logarAdmin()
    const u = await criarUsuario(cookieAdmin)
    const r = await chamar('POST', `/api/usuarios/${u.id}/senha`, { cookie: cookieAdmin, corpo: { senha: 'nova-senha-1' } })
    expect(r.statusCode).toBe(200)
    expect(r.json().usuario.trocarSenha).toBe(true)
    expect((await chamar('GET', '/api/eu', { cookie: u.cookie })).statusCode).toBe(401)
    expect((await login(u.email, 'nova-senha-1')).r.json().usuario.trocarSenha).toBe(true)
  })
})

describe('administração', () => {
  it('nega as rotas de admin a usuário comum', async () => {
    const u = await criarUsuario(await logarAdmin())
    const c = u.cookie
    expect((await chamar('GET', '/api/usuarios', { cookie: c })).statusCode).toBe(403)
    expect((await chamar('POST', '/api/usuarios', { cookie: c, corpo: { nome: 'Z', email: 'z@z.com', perfil: 'admin', senha: '12345678' } })).statusCode).toBe(403)
    expect((await chamar('PATCH', `/api/usuarios/${u.id}`, { cookie: c, corpo: { perfil: 'admin' } })).statusCode).toBe(403)
    expect((await chamar('POST', `/api/usuarios/${u.id}/senha`, { cookie: c, corpo: { senha: '12345678' } })).statusCode).toBe(403)
    expect((await chamar('DELETE', `/api/usuarios/${u.id}`, { cookie: c })).statusCode).toBe(403)
    expect((await chamar('POST', `/api/usuarios/${u.id}/encerrar-sessoes`, { cookie: c, corpo: {} })).statusCode).toBe(403)
  })

  it('nunca expõe senha_hash', async () => {
    const cookie = await logarAdmin()
    await criarUsuario(cookie)
    const lista = await chamar('GET', '/api/usuarios', { cookie })
    expect(lista.statusCode).toBe(200)
    expect(lista.json().usuarios).toHaveLength(2)
    expect(lista.body).not.toMatch(/senha_hash|scrypt|senhaHash/)
    const eu = await chamar('GET', '/api/eu', { cookie })
    expect(eu.body).not.toMatch(/senha_hash|scrypt|senhaHash/)
    const lg = await chamar('POST', '/api/login', { corpo: { email: ADMIN.email, senha: ADMIN.senha } })
    expect(lg.body).not.toMatch(/senha_hash|scrypt|senhaHash/)
  })

  it('rejeita e-mail duplicado sem diferenciar maiúsculas', async () => {
    const cookie = await logarAdmin()
    const r = await chamar('POST', '/api/usuarios', { cookie, corpo: { nome: 'Outra', email: 'ADMIN@Empresa.com', perfil: 'usuario', senha: '12345678' } })
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe('Já existe um usuário com este e-mail.')
  })

  it('desativar derruba a sessão e impede novo login; reativar libera', async () => {
    const cookieAdmin = await logarAdmin()
    const u = await criarUsuario(cookieAdmin)
    expect((await chamar('GET', '/api/eu', { cookie: u.cookie })).statusCode).toBe(200)
    const d = await chamar('PATCH', `/api/usuarios/${u.id}`, { cookie: cookieAdmin, corpo: { ativo: false } })
    expect(d.json().usuario.ativo).toBe(false)
    expect((await chamar('GET', '/api/eu', { cookie: u.cookie })).statusCode).toBe(401)
    expect((await login(u.email, 'definitiva-456')).r.statusCode).toBe(401)
    await chamar('PATCH', `/api/usuarios/${u.id}`, { cookie: cookieAdmin, corpo: { ativo: true } })
    expect((await login(u.email, 'definitiva-456')).r.statusCode).toBe(200)
  })

  it('encerrar sessões derruba só as sessões do alvo', async () => {
    const cookieAdmin = await logarAdmin()
    const u = await criarUsuario(cookieAdmin)
    const r = await chamar('POST', `/api/usuarios/${u.id}/encerrar-sessoes`, { cookie: cookieAdmin, corpo: {} })
    expect(r.json().encerradas).toBeGreaterThanOrEqual(1)
    expect((await chamar('GET', '/api/eu', { cookie: u.cookie })).statusCode).toBe(401)
    expect((await chamar('GET', '/api/eu', { cookie: cookieAdmin })).statusCode).toBe(200)
  })

  it('protege o último admin ativo e o próprio admin', async () => {
    const cookie = await logarAdmin()
    const eu = (await chamar('GET', '/api/eu', { cookie })).json().usuario.id as number
    const rebaixar = await chamar('PATCH', `/api/usuarios/${eu}`, { cookie, corpo: { perfil: 'usuario' } })
    expect(rebaixar.statusCode).toBe(409)
    expect(rebaixar.json().erro).toMatch(/último administrador ativo/)
    expect((await chamar('PATCH', `/api/usuarios/${eu}`, { cookie, corpo: { ativo: false } })).statusCode).toBe(409)
    expect((await chamar('DELETE', `/api/usuarios/${eu}`, { cookie })).statusCode).toBe(409)
    // renomear continua permitido
    expect((await chamar('PATCH', `/api/usuarios/${eu}`, { cookie, corpo: { nome: 'Ana Maria' } })).statusCode).toBe(200)
  })

  it('com dois admins, um pode rebaixar o outro, mas não a si mesmo desativar nem excluir', async () => {
    const cookie = await logarAdmin()
    const b = await criarUsuario(cookie, 'bia@empresa.com', 'admin')
    const eu = (await chamar('GET', '/api/eu', { cookie })).json().usuario.id as number
    expect((await chamar('PATCH', `/api/usuarios/${eu}`, { cookie, corpo: { ativo: false } })).statusCode).toBe(409)
    expect((await chamar('DELETE', `/api/usuarios/${eu}`, { cookie })).statusCode).toBe(409)
    expect((await chamar('PATCH', `/api/usuarios/${b.id}`, { cookie, corpo: { perfil: 'usuario' } })).statusCode).toBe(200)
    // agora o admin original voltou a ser o único: a Bia (comum) não o afeta e ele segue protegido
    expect((await chamar('DELETE', `/api/usuarios/${b.id}`, { cookie })).statusCode).toBe(200)
  })

  it('o admin só consegue excluir um admin ativo se houver outro', async () => {
    const cookie = await logarAdmin()
    const b = await criarUsuario(cookie, 'bia@empresa.com', 'admin')
    // Bia (admin) tenta excluir o admin original: permitido porque restam 2 → sobra 1
    const del = await chamar('DELETE', `/api/usuarios/${(await chamar('GET', '/api/eu', { cookie })).json().usuario.id}`, { cookie: b.cookie })
    expect(del.statusCode).toBe(200)
    // agora Bia é a única
    const eu = (await chamar('GET', '/api/eu', { cookie: b.cookie })).json().usuario.id
    expect((await chamar('PATCH', `/api/usuarios/${eu}`, { cookie: b.cookie, corpo: { perfil: 'usuario' } })).statusCode).toBe(409)
  })

  it('bootstrap recusa banco vazio sem ADMIN_SENHA', async () => {
    const d2 = mkdtempSync(join(tmpdir(), 'sim2-'))
    const s2 = await criarApp({ dataDir: d2 })
    await expect(garantirAdmin(s2, { ADMIN_EMAIL: 'a@b.com' })).rejects.toThrow(/ADMIN_SENHA/)
    await s2.app.close()
    rmSync(d2, { recursive: true, force: true })
  })

  it('/saude responde ok sem autenticação', async () => {
    const r = await s.app.inject({ method: 'GET', url: '/saude' })
    expect(r.statusCode).toBe(200)
    expect(r.body).toBe('ok')
  })
})
