import { useEffect, useState } from 'react'
import { aoSessaoInvalida, apiAuth, ErroApi, type Usuario } from './api'
import App from './App'
import { AdminUsuarios } from './components/AdminUsuarios'
import { Login, TrocarSenha } from './components/Autenticacao'

type Fase = { tipo: 'carregando' } | { tipo: 'login'; aviso?: string } | { tipo: 'logado'; usuario: Usuario }
type Tela = 'simulador' | 'admin' | 'senha'

/** Decide o que mostrar: login, troca obrigatória de senha, administração ou o simulador. */
export default function Raiz() {
  const [fase, setFase] = useState<Fase>({ tipo: 'carregando' })
  const [tela, setTela] = useState<Tela>('simulador')

  useEffect(() => {
    aoSessaoInvalida((motivo) => {
      if (motivo === 'expirada') {
        setTela('simulador')
        setFase((f) => (f.tipo === 'logado' ? { tipo: 'login', aviso: 'Sua sessão expirou. Entre novamente.' } : f))
      } else {
        apiAuth.eu().then((r) => setFase({ tipo: 'logado', usuario: r.usuario })).catch(() => {})
      }
    })
    apiAuth.eu()
      .then((r) => setFase({ tipo: 'logado', usuario: r.usuario }))
      .catch((e) => setFase({ tipo: 'login', aviso: e instanceof ErroApi && e.status === 0 ? e.message : undefined }))
  }, [])

  const sair = () => {
    apiAuth.logout().catch(() => {}).finally(() => {
      setTela('simulador')
      setFase({ tipo: 'login' })
    })
  }

  if (fase.tipo === 'carregando') return <p className="auth-carregando" role="status">Carregando…</p>
  if (fase.tipo === 'login') return <Login aviso={fase.aviso} onEntrar={(usuario) => { setTela('simulador'); setFase({ tipo: 'logado', usuario }) }} />

  const { usuario } = fase
  if (usuario.trocarSenha || tela === 'senha') {
    return (
      <TrocarSenha usuario={usuario} obrigatoria={usuario.trocarSenha} onSair={sair}
        onCancelar={() => setTela('simulador')}
        onConcluir={(u) => { setFase({ tipo: 'logado', usuario: u }); setTela('simulador') }} />
    )
  }
  if (tela === 'admin' && usuario.perfil === 'admin') {
    return <AdminUsuarios usuario={usuario} onVoltar={() => setTela('simulador')} onTrocarSenha={() => setTela('senha')} onSair={sair} />
  }
  return <App key={usuario.id} usuario={usuario} onTrocarSenha={() => setTela('senha')} onAdministrar={() => setTela('admin')} onSair={sair} />
}
