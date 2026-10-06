import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Perfil = 'admin' | 'usuario'

export interface UsuarioLinha {
  id: number
  nome: string
  email: string
  senha_hash: string
  perfil: Perfil
  ativo: number
  trocar_senha: number
  criado_em: string
  atualizado_em: string
  ultimo_acesso: string | null
}

export interface SessaoLinha {
  id: string
  usuario_id: number
  criado_em: number
  expira_em: number
  ip: string | null
  user_agent: string | null
}

export function abrirBanco(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'simulador.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrar(db)
  return db
}

function migrar(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'usuario')),
      ativo INTEGER NOT NULL DEFAULT 1,
      trocar_senha INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      ultimo_acesso TEXT
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      id TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      criado_em INTEGER NOT NULL,
      expira_em INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);
  `)
}
