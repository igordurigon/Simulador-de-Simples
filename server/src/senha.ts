import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'

const N = 16384
const R = 8
const P = 1
const TAM = 64

function derivar(senha: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize('NFKC'), salt, TAM, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, chave) => (e ? reject(e) : resolve(chave)))
  })
}

/** Formato: scrypt$N$r$p$salt(base64)$hash(base64) */
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16)
  const chave = await derivar(senha, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${chave.toString('base64')}`
}

export async function conferirSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = partes
  try {
    const esperado = Buffer.from(hash, 'base64')
    const obtido = await derivar(senha, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
    return esperado.length === obtido.length && timingSafeEqual(esperado, obtido)
  } catch {
    return false
  }
}

/** Hash descartável para igualar o tempo de resposta quando o e-mail não existe. */
let falso: Promise<string> | undefined
export function conferirFalso(senha: string): Promise<boolean> {
  falso ??= hashSenha('senha-inexistente')
  return falso.then((h) => conferirSenha(senha, h)).then(() => false)
}

// Sem caracteres ambíguos (0/O, 1/l/I).
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function gerarSenha(tamanho = 12): string {
  let s = ''
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return s
}
