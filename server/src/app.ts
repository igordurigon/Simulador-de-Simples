import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { abrirBanco, type Perfil, type SessaoLinha, type UsuarioLinha } from './banco.ts'
import { conferirFalso, conferirSenha, hashSenha } from './senha.ts'

const COOKIE = 'sid'
const SESSAO_MS = 12 * 60 * 60 * 1000
const JANELA_MS = 15 * 60 * 1000
const MAX_FALHAS = 5
const SENHA_MIN = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioLinha
    sessaoId?: string
  }
}

export interface OpcoesApp {
  dataDir: string
  /** Pasta do build do Vite. Se não existir, só a API é servida. */
  staticDir?: string
  /** Escreve os logs de login e de ações de admin no stdout. */
  log?: boolean
  /** Relógio injetável (testes). */
  agora?: () => number
}

export function usuarioPublico(u: UsuarioLinha) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    ativo: u.ativo === 1,
    trocarSenha: u.trocar_senha === 1,
    criadoEm: u.criado_em,
    ultimoAcesso: u.ultimo_acesso,
  }
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

class Erro extends Error {
  status: number
  extra?: Record<string, unknown>
  constructor(status: number, mensagem: string, extra?: Record<string, unknown>) {
    super(mensagem)
    this.status = status
    this.extra = extra
  }
}

const ROTULOS: Record<string, string> = {
  email: 'e-mail', senha: 'senha', nome: 'nome', perfil: 'perfil', ativo: 'situação',
  senhaAtual: 'senha atual', novaSenha: 'nova senha',
}

type Param = string | number | null

function ajudantes(db: DatabaseSync) {
  const um = <T>(sql: string, ...p: Param[]) => db.prepare(sql).get(...p) as T | undefined
  const todos = <T>(sql: string, ...p: Param[]) => db.prepare(sql).all(...p) as T[]
  const exec = (sql: string, ...p: Param[]) => db.prepare(sql).run(...p)
  return { um, todos, exec }
}

export async function criarApp(opcoes: OpcoesApp) {
  const db = abrirBanco(opcoes.dataDir)
  const { um, todos, exec } = ajudantes(db)
  const agora = opcoes.agora ?? Date.now
  const iso = () => new Date(agora()).toISOString()
  const registrar = (msg: string) => {
    if (opcoes.log) console.log(`[${new Date().toISOString()}] ${msg}`)
  }

  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 })
  await app.register(fastifyCookie)
  app.decorateRequest('usuario', undefined)
  app.decorateRequest('sessaoId', undefined)

  // Corpo JSON vazio vira {} (logout, encerrar sessões etc.).
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, corpo, feito) => {
    if (!corpo || !String(corpo).trim()) return feito(null, {})
    try {
      feito(null, JSON.parse(String(corpo)))
    } catch {
      feito(new Erro(400, 'O corpo da requisição não é um JSON válido.'), undefined)
    }
  })

  // ---------- Cabeçalhos e CSRF ----------
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'same-origin')
    if (!req.url.startsWith('/api')) return
    reply.header('Cache-Control', 'no-store')
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const tipo = req.headers['content-type'] ?? ''
    if (!tipo.toLowerCase().startsWith('application/json')) {
      throw new Erro(415, 'A requisição precisa usar Content-Type application/json.')
    }
    const origem = req.headers.origin
    if (origem !== undefined) {
      let host = ''
      try { host = new URL(origem).host } catch { /* origem inválida */ }
      const aceitos = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean).map(String)
      if (!aceitos.includes(host)) throw new Erro(403, 'Origem da requisição não permitida.')
    }
  })

  type ErroValidacao = { keyword: string; instancePath: string; params: Record<string, unknown> }
  app.setErrorHandler((err: Error & { validation?: ErroValidacao[]; statusCode?: number }, _req, reply) => {
    if (err instanceof Erro) return reply.code(err.status).send({ erro: err.message, ...err.extra })
    if (err.validation?.length) {
      const v = err.validation[0]
      const campo = String(v.params.missingProperty ?? v.instancePath.replace(/^\//, ''))
      const rotulo = ROTULOS[campo] ?? campo
      let msg: string
      if (v.keyword === 'required') msg = `Preencha o campo ${rotulo}.`
      else if (v.keyword === 'minLength' && /senha/i.test(campo)) msg = `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`
      else if (v.keyword === 'minLength') msg = `Preencha o campo ${rotulo}.`
      else if (v.keyword === 'maxLength') msg = `O campo ${rotulo} está longo demais.`
      else if (v.keyword === 'enum') msg = `Valor inválido no campo ${rotulo}.`
      else msg = `Dados inválidos no campo ${rotulo}.`
      return reply.code(400).send({ erro: msg })
    }
    if (err.statusCode && err.statusCode < 500) {
      const msg = err.statusCode === 413 ? 'Requisição grande demais.' : 'Requisição inválida.'
      return reply.code(err.statusCode).send({ erro: msg })
    }
    console.error(`[${new Date().toISOString()}] erro interno:`, err)
    return reply.code(500).send({ erro: 'Erro interno no servidor. Tente novamente em instantes.' })
  })

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ erro: 'Recurso não encontrado.' })
    const raiz = opcoes.staticDir
    if (raiz && existsSync(raiz) && req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
      return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').sendFile('index.html')
    }
    return reply.code(404).type('text/plain; charset=utf-8').send('Não encontrado')
  })

  // ---------- Sessões ----------
  const cookieOpcoes = (req: FastifyRequest) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: req.protocol === 'https',
    maxAge: SESSAO_MS / 1000,
  })

  function criarSessao(req: FastifyRequest, reply: FastifyReply, usuarioId: number) {
    const token = randomBytes(32).toString('base64url')
    const t = agora()
    exec('INSERT INTO sessoes (id, usuario_id, criado_em, expira_em, ip, user_agent) VALUES (?,?,?,?,?,?)',
      hashToken(token), usuarioId, t, t + SESSAO_MS, req.ip, (req.headers['user-agent'] ?? '').slice(0, 300))
    reply.setCookie(COOKIE, token, cookieOpcoes(req))
  }

  function limparCookie(req: FastifyRequest, reply: FastifyReply) {
    reply.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https' })
  }

  function resolverSessao(req: FastifyRequest, reply: FastifyReply): boolean {
    const token = req.cookies[COOKIE]
    if (!token) return false
    const id = hashToken(token)
    const s = um<SessaoLinha>('SELECT * FROM sessoes WHERE id = ?', id)
    if (!s) return false
    const t = agora()
    if (s.expira_em <= t) {
      exec('DELETE FROM sessoes WHERE id = ?', id)
      return false
    }
    const u = um<UsuarioLinha>('SELECT * FROM usuarios WHERE id = ?', s.usuario_id)
    if (!u || !u.ativo) return false
    if (s.expira_em - t < SESSAO_MS / 2) {
      exec('UPDATE sessoes SET expira_em = ? WHERE id = ?', t + SESSAO_MS, id)
      reply.setCookie(COOKIE, token, cookieOpcoes(req))
    }
    req.usuario = u
    req.sessaoId = id
    return true
  }

  const autenticar = (permitirTrocaPendente = false) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!resolverSessao(req, reply)) {
      limparCookie(req, reply)
      throw new Erro(401, 'Sessão expirada. Entre novamente.')
    }
    if (req.usuario!.trocar_senha && !permitirTrocaPendente) {
      throw new Erro(403, 'Defina sua nova senha antes de continuar.', { trocarSenha: true })
    }
  }
  const exigirAdmin = async (req: FastifyRequest) => {
    if (req.usuario!.perfil !== 'admin') throw new Erro(403, 'Apenas administradores podem fazer isso.')
  }
  const soAdmin = [autenticar(), exigirAdmin]

  // ---------- Limite de tentativas (em memória) ----------
  const tentativas = new Map<string, { falhas: number[]; bloqueadoAte: number }>()
  const limpeza = setInterval(() => {
    const t = agora()
    for (const [k, v] of tentativas) if (v.bloqueadoAte < t && v.falhas.every((f) => t - f > JANELA_MS)) tentativas.delete(k)
    exec('DELETE FROM sessoes WHERE expira_em <= ?', t)
  }, 10 * 60 * 1000)
  limpeza.unref()
  app.addHook('onClose', async () => { clearInterval(limpeza); db.close() })
  exec('DELETE FROM sessoes WHERE expira_em <= ?', agora())

  function verificarBloqueio(chave: string) {
    const e = tentativas.get(chave)
    const t = agora()
    if (e && e.bloqueadoAte > t) {
      const min = Math.ceil((e.bloqueadoAte - t) / 60000)
      throw new Erro(429, `Muitas tentativas incorretas. Tente novamente em ${min} ${min === 1 ? 'minuto' : 'minutos'}.`)
    }
  }
  function registrarFalha(chave: string) {
    const t = agora()
    const e = tentativas.get(chave) ?? { falhas: [], bloqueadoAte: 0 }
    e.falhas = e.falhas.filter((f) => t - f < JANELA_MS)
    e.falhas.push(t)
    if (e.falhas.length >= MAX_FALHAS) { e.bloqueadoAte = t + JANELA_MS; e.falhas = [] }
    tentativas.set(chave, e)
  }

  // ---------- Rotas públicas ----------
  app.get('/saude', async (_req, reply) => reply.type('text/plain; charset=utf-8').send('ok'))

  app.post('/api/login', {
    schema: { body: { type: 'object', required: ['email', 'senha'], additionalProperties: false,
      properties: { email: { type: 'string', minLength: 1, maxLength: 200 }, senha: { type: 'string', minLength: 1, maxLength: 200 } } } },
  }, async (req, reply) => {
    const { email, senha } = req.body as { email: string; senha: string }
    const em = email.trim().toLowerCase()
    const chave = `${req.ip}|${em}`
    verificarBloqueio(chave)
    const u = um<UsuarioLinha>('SELECT * FROM usuarios WHERE email = ?', em)
    const ok = u ? await conferirSenha(senha, u.senha_hash) : await conferirFalso(senha)
    if (!u || !ok || !u.ativo) {
      registrarFalha(chave)
      registrar(`login falhou: ${em} (ip ${req.ip})${u && ok && !u.ativo ? ' [usuário inativo]' : ''}`)
      throw new Erro(401, 'E-mail ou senha incorretos.')
    }
    tentativas.delete(chave)
    criarSessao(req, reply, u.id)
    exec('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', iso(), u.id)
    registrar(`login ok: ${u.email} (ip ${req.ip})`)
    return { usuario: usuarioPublico(um<UsuarioLinha>('SELECT * FROM usuarios WHERE id = ?', u.id)!) }
  })

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies[COOKIE]
    if (token) exec('DELETE FROM sessoes WHERE id = ?', hashToken(token))
    limparCookie(req, reply)
    return { ok: true }
  })

  // ---------- Usuário logado ----------
  app.get('/api/eu', { preHandler: autenticar(true) }, async (req) => ({ usuario: usuarioPublico(req.usuario!) }))

  app.post('/api/eu/senha', {
    preHandler: autenticar(true),
    schema: { body: { type: 'object', required: ['senhaAtual', 'novaSenha'], additionalProperties: false,
      properties: { senhaAtual: { type: 'string', minLength: 1, maxLength: 200 }, novaSenha: { type: 'string', minLength: SENHA_MIN, maxLength: 200 } } } },
  }, async (req) => {
    const u = req.usuario!
    const { senhaAtual, novaSenha } = req.body as { senhaAtual: string; novaSenha: string }
    const chave = `senha|${u.id}`
    verificarBloqueio(chave)
    if (!(await conferirSenha(senhaAtual, u.senha_hash))) {
      registrarFalha(chave)
      throw new Erro(400, 'A senha atual está incorreta.')
    }
    if (senhaAtual === novaSenha) throw new Erro(400, 'A nova senha precisa ser diferente da atual.')
    tentativas.delete(chave)
    exec('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, atualizado_em = ? WHERE id = ?', await hashSenha(novaSenha), iso(), u.id)
    exec('DELETE FROM sessoes WHERE usuario_id = ? AND id <> ?', u.id, req.sessaoId!)
    registrar(`senha trocada pelo próprio usuário: ${u.email}`)
    return { usuario: usuarioPublico(um<UsuarioLinha>('SELECT * FROM usuarios WHERE id = ?', u.id)!) }
  })

  // ---------- Administração ----------
  const adminAtivos = () => um<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1")!.n
  const buscar = (id: number) => {
    const u = um<UsuarioLinha>('SELECT * FROM usuarios WHERE id = ?', id)
    if (!u) throw new Erro(404, 'Usuário não encontrado. A lista pode estar desatualizada; recarregue.')
    return u
  }
  const emailValido = (e: string) => {
    const em = e.trim().toLowerCase()
    if (!EMAIL_RE.test(em)) throw new Erro(400, 'Informe um e-mail válido.')
    return em
  }
  const nomeValido = (n: string) => {
    const nome = n.trim()
    if (!nome) throw new Erro(400, 'Preencha o campo nome.')
    return nome
  }
  const emailLivre = (email: string, exceto?: number) => {
    const o = um<{ id: number }>('SELECT id FROM usuarios WHERE email = ?', email)
    if (o && o.id !== exceto) throw new Erro(409, 'Já existe um usuário com este e-mail.')
  }
  const idParam = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } }
  const ator = (req: FastifyRequest) => req.usuario!.email

  app.get('/api/usuarios', { preHandler: soAdmin }, async () => ({
    usuarios: todos<UsuarioLinha>('SELECT * FROM usuarios ORDER BY nome COLLATE NOCASE').map(usuarioPublico),
  }))

  app.post('/api/usuarios', {
    preHandler: soAdmin,
    schema: { body: { type: 'object', required: ['nome', 'email', 'perfil', 'senha'], additionalProperties: false,
      properties: {
        nome: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', minLength: 1, maxLength: 200 },
        perfil: { type: 'string', enum: ['admin', 'usuario'] }, senha: { type: 'string', minLength: SENHA_MIN, maxLength: 200 },
      } } },
  }, async (req, reply) => {
    const b = req.body as { nome: string; email: string; perfil: Perfil; senha: string }
    const nome = nomeValido(b.nome)
    const email = emailValido(b.email)
    emailLivre(email)
    const t = iso()
    const r = exec('INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, trocar_senha, criado_em, atualizado_em) VALUES (?,?,?,?,1,1,?,?)',
      nome, email, await hashSenha(b.senha), b.perfil, t, t)
    registrar(`admin ${ator(req)} criou o usuário ${email} (${b.perfil})`)
    return reply.code(201).send({ usuario: usuarioPublico(buscar(Number(r.lastInsertRowid))) })
  })

  app.patch('/api/usuarios/:id', {
    preHandler: soAdmin,
    schema: { params: idParam, body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        nome: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', minLength: 1, maxLength: 200 },
        perfil: { type: 'string', enum: ['admin', 'usuario'] }, ativo: { type: 'boolean' },
      } } },
  }, async (req) => {
    const alvo = buscar((req.params as { id: number }).id)
    const b = req.body as { nome?: string; email?: string; perfil?: Perfil; ativo?: boolean }
    const proprio = alvo.id === req.usuario!.id
    const nome = b.nome !== undefined ? nomeValido(b.nome) : alvo.nome
    const email = b.email !== undefined ? emailValido(b.email) : alvo.email
    if (email !== alvo.email) emailLivre(email, alvo.id)
    const perfil = b.perfil ?? alvo.perfil
    const ativo = b.ativo ?? alvo.ativo === 1
    if (proprio && !ativo) throw new Erro(409, 'Você não pode desativar a sua própria conta.')
    const deixaDeSerAdminAtivo = alvo.perfil === 'admin' && alvo.ativo === 1 && (perfil !== 'admin' || !ativo)
    if (deixaDeSerAdminAtivo && adminAtivos() <= 1) {
      throw new Erro(409, 'Este é o último administrador ativo. Promova outro usuário a administrador antes de alterar este.')
    }
    exec('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ?, atualizado_em = ? WHERE id = ?',
      nome, email, perfil, ativo ? 1 : 0, iso(), alvo.id)
    if (alvo.ativo === 1 && !ativo) exec('DELETE FROM sessoes WHERE usuario_id = ?', alvo.id)
    const partes = [
      email !== alvo.email && 'e-mail', nome !== alvo.nome && 'nome', perfil !== alvo.perfil && `perfil=${perfil}`,
      ativo !== (alvo.ativo === 1) && (ativo ? 'reativado' : 'desativado'),
    ].filter(Boolean)
    registrar(`admin ${ator(req)} alterou ${alvo.email}: ${partes.join(', ') || 'sem mudanças'}`)
    return { usuario: usuarioPublico(buscar(alvo.id)) }
  })

  app.post('/api/usuarios/:id/senha', {
    preHandler: soAdmin,
    schema: { params: idParam, body: { type: 'object', required: ['senha'], additionalProperties: false,
      properties: { senha: { type: 'string', minLength: SENHA_MIN, maxLength: 200 } } } },
  }, async (req) => {
    const alvo = buscar((req.params as { id: number }).id)
    if (alvo.id === req.usuario!.id) throw new Erro(409, 'Para trocar a sua própria senha, use "Trocar senha" no menu do usuário.')
    exec('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1, atualizado_em = ? WHERE id = ?',
      await hashSenha((req.body as { senha: string }).senha), iso(), alvo.id)
    exec('DELETE FROM sessoes WHERE usuario_id = ?', alvo.id)
    registrar(`admin ${ator(req)} redefiniu a senha de ${alvo.email}`)
    return { usuario: usuarioPublico(buscar(alvo.id)) }
  })

  app.delete('/api/usuarios/:id', { preHandler: soAdmin, schema: { params: idParam } }, async (req) => {
    const alvo = buscar((req.params as { id: number }).id)
    if (alvo.id === req.usuario!.id) throw new Erro(409, 'Você não pode excluir a sua própria conta.')
    if (alvo.perfil === 'admin' && alvo.ativo === 1 && adminAtivos() <= 1) {
      throw new Erro(409, 'Este é o último administrador ativo e não pode ser excluído.')
    }
    exec('DELETE FROM usuarios WHERE id = ?', alvo.id)
    registrar(`admin ${ator(req)} excluiu o usuário ${alvo.email}`)
    return { ok: true }
  })

  app.post('/api/usuarios/:id/encerrar-sessoes', { preHandler: soAdmin, schema: { params: idParam } }, async (req) => {
    const alvo = buscar((req.params as { id: number }).id)
    if (alvo.id === req.usuario!.id) throw new Erro(409, 'Para encerrar a sua própria sessão, use "Sair" no menu do usuário.')
    const r = exec('DELETE FROM sessoes WHERE usuario_id = ?', alvo.id)
    registrar(`admin ${ator(req)} encerrou as sessões de ${alvo.email}`)
    return { encerradas: Number(r.changes) }
  })

  // ---------- Front estático ----------
  if (opcoes.staticDir && existsSync(opcoes.staticDir)) {
    await app.register(fastifyStatic, {
      root: opcoes.staticDir,
      cacheControl: false,
      setHeaders(res, caminho) {
        const p = caminho.replace(/\\/g, '/')
        if (p.endsWith('/index.html')) res.header('Cache-Control', 'no-cache')
        else if (p.includes('/assets/')) res.header('Cache-Control', 'public, max-age=31536000, immutable')
        else res.header('Cache-Control', 'public, max-age=3600')
      },
    })
  }

  return { app, db, registrar, exec, contarUsuarios: () => um<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios')!.n }
}

export type Servidor = Awaited<ReturnType<typeof criarApp>>

/** Cria o primeiro administrador a partir do ambiente, se o banco estiver vazio. */
export async function garantirAdmin(s: Servidor, env: { ADMIN_EMAIL?: string; ADMIN_NOME?: string; ADMIN_SENHA?: string }) {
  if (s.contarUsuarios() > 0) return
  const email = (env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const senha = env.ADMIN_SENHA ?? ''
  if (!EMAIL_RE.test(email) || senha.length < SENHA_MIN) {
    throw new Error('Banco vazio: defina ADMIN_EMAIL (e-mail válido) e ADMIN_SENHA (mínimo 8 caracteres) para criar o primeiro administrador.')
  }
  const t = new Date().toISOString()
  s.exec('INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, trocar_senha, criado_em, atualizado_em) VALUES (?,?,?,?,1,0,?,?)',
    (env.ADMIN_NOME ?? '').trim() || 'Administrador', email, await hashSenha(senha), 'admin', t, t)
  s.registrar(`primeiro administrador criado: ${email}`)
}
