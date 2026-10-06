import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarApp, garantirAdmin } from './app.ts'

const dataDir = resolve(process.env.DATA_DIR ?? (process.env.NODE_ENV === 'production' ? '/data' : './.dados'))
// server/dist/index.js (ou server/src/index.ts) -> ../../dist
const staticDir = resolve(process.env.STATIC_DIR ?? fileURLToPath(new URL('../../dist', import.meta.url)))
const porta = Number(process.env.PORT ?? 3000)

try {
  const s = await criarApp({ dataDir, staticDir, log: true })
  await garantirAdmin(s, process.env)
  const parar = () => { s.app.close().then(() => process.exit(0)) }
  process.on('SIGTERM', parar)
  process.on('SIGINT', parar)
  await s.app.listen({ port: porta, host: process.env.HOST ?? '0.0.0.0' })
  s.registrar(`servidor no ar na porta ${porta} (dados em ${dataDir})`)
} catch (e) {
  console.error('Falha ao iniciar:', e instanceof Error ? e.message : e)
  process.exit(1)
}
