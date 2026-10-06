export type Perfil = 'admin' | 'usuario'

export interface Usuario {
  id: number
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  trocarSenha: boolean
  criadoEm: string
  ultimoAcesso: string | null
}

export class ErroApi extends Error {
  status: number
  dados: Record<string, unknown>
  constructor(status: number, mensagem: string, dados: Record<string, unknown> = {}) {
    super(mensagem)
    this.status = status
    this.dados = dados
  }
}

type Gancho = (motivo: 'expirada' | 'trocar-senha') => void
let aoInvalidar: Gancho = () => {}
/** A raiz da aplicação registra aqui o que fazer quando a sessão cai (401) ou exige troca de senha (403). */
export function aoSessaoInvalida(fn: Gancho) {
  aoInvalidar = fn
}

export async function api<T = unknown>(metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, corpo?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: metodo === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
    })
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.')
  }
  let dados: Record<string, unknown> = {}
  try { dados = await r.json() } catch { /* sem corpo JSON */ }
  if (r.ok) return dados as T
  const erro = new ErroApi(r.status, typeof dados.erro === 'string' ? dados.erro : 'Algo deu errado. Tente novamente.', dados)
  if (r.status === 401 && url !== '/api/login') aoInvalidar('expirada')
  if (r.status === 403 && dados.trocarSenha === true) aoInvalidar('trocar-senha')
  throw erro
}

export const apiAuth = {
  eu: () => api<{ usuario: Usuario }>('GET', '/api/eu'),
  login: (email: string, senha: string) => api<{ usuario: Usuario }>('POST', '/api/login', { email, senha }),
  logout: () => api('POST', '/api/logout'),
  trocarSenha: (senhaAtual: string, novaSenha: string) => api<{ usuario: Usuario }>('POST', '/api/eu/senha', { senhaAtual, novaSenha }),
}

export const apiUsuarios = {
  listar: () => api<{ usuarios: Usuario[] }>('GET', '/api/usuarios'),
  criar: (d: { nome: string; email: string; perfil: Perfil; senha: string }) => api<{ usuario: Usuario }>('POST', '/api/usuarios', d),
  alterar: (id: number, d: Partial<{ nome: string; email: string; perfil: Perfil; ativo: boolean }>) =>
    api<{ usuario: Usuario }>('PATCH', `/api/usuarios/${id}`, d),
  redefinirSenha: (id: number, senha: string) => api<{ usuario: Usuario }>('POST', `/api/usuarios/${id}/senha`, { senha }),
  excluir: (id: number) => api('DELETE', `/api/usuarios/${id}`),
  encerrarSessoes: (id: number) => api<{ encerradas: number }>('POST', `/api/usuarios/${id}/encerrar-sessoes`),
}

const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** 12 caracteres legíveis (sem 0/O, 1/l/I). */
export function gerarSenha(tamanho = 12): string {
  const buf = new Uint32Array(tamanho)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => ALFABETO[n % ALFABETO.length]).join('')
}
