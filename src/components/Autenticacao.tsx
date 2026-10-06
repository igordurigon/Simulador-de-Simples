import { useState, type FormEvent } from 'react'
import { apiAuth, ErroApi, type Usuario } from '../api'
import { CampoTexto } from './CampoTexto'

const TITULO = 'Simulador IBS/CBS no Simples'

export function Login({ aviso, onEntrar }: { aviso?: string; onEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setErro('')
    if (!email.trim() || !senha) {
      setErro(!email.trim() ? 'Informe o seu e-mail.' : 'Informe a sua senha.')
      return
    }
    setEnviando(true)
    try {
      const r = await apiAuth.login(email, senha)
      onEntrar(r.usuario)
    } catch (x) {
      setErro(x instanceof ErroApi ? x.message : 'Algo deu errado. Tente novamente.')
      setSenha('')
      setEnviando(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth-quadro">
        <form className="auth-painel" onSubmit={enviar} noValidate>
          <h1>{TITULO}</h1>
          <p className="auth-sub">Entre com o seu e-mail e a sua senha.</p>
          {aviso && !erro && <p className="auth-aviso" role="status">{aviso}</p>}
          <div className="auth-campos">
            <CampoTexto rotulo="E-mail" tipo="email" valor={email} onChange={setEmail} autoComplete="username" autoFocus required />
            <CampoTexto rotulo="Senha" senha valor={senha} onChange={setSenha} autoComplete="current-password" required />
          </div>
          {erro && <p className="auth-erro" role="alert">{erro}</p>}
          <button type="submit" className="botao primario largo" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          <p className="auth-ajuda">Esqueceu a senha? Peça ao administrador para redefinir.</p>
        </form>
        <aside className="auth-faixa" aria-label="Sobre o simulador">
          <p className="auth-faixa-texto">Compare os dois caminhos do IBS/CBS para uma empresa do Simples Nacional e veja qual deixa mais lucro.</p>
          <ul>
            <li><span className="ponto dentro" aria-hidden="true" /><span><strong>Por dentro</strong> recolhe IBS/CBS no DAS, sem crédito das compras.</span></li>
            <li><span className="ponto fora" aria-hidden="true" /><span><strong>Por fora</strong> apura IBS/CBS no regime regular, com crédito.</span></li>
          </ul>
        </aside>
      </div>
    </main>
  )
}

export function TrocarSenha({ usuario, obrigatoria, onConcluir, onCancelar, onSair }: {
  usuario: Usuario
  obrigatoria: boolean
  onConcluir: (u: Usuario) => void
  onCancelar?: () => void
  onSair: () => void
}) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setErro('')
    if (!atual) return setErro('Informe a senha atual.')
    if (nova.length < 8) return setErro('A nova senha deve ter no mínimo 8 caracteres.')
    if (nova !== confirmar) return setErro('A confirmação não confere com a nova senha.')
    if (nova === atual) return setErro('A nova senha precisa ser diferente da atual.')
    setEnviando(true)
    try {
      const r = await apiAuth.trocarSenha(atual, nova)
      onConcluir(r.usuario)
    } catch (x) {
      setErro(x instanceof ErroApi ? x.message : 'Algo deu errado. Tente novamente.')
      setEnviando(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth-quadro">
        <form className="auth-painel" onSubmit={enviar} noValidate>
          <h1>{obrigatoria ? 'Defina sua nova senha' : 'Trocar senha'}</h1>
          <p className="auth-sub">
            {obrigatoria
              ? `${usuario.nome}, a sua senha foi definida por um administrador. Escolha uma senha só sua para continuar.`
              : 'Use no mínimo 8 caracteres. As outras sessões abertas com a sua conta serão encerradas.'}
          </p>
          <div className="auth-campos">
            <CampoTexto rotulo={obrigatoria ? 'Senha recebida' : 'Senha atual'} senha valor={atual} onChange={setAtual} autoComplete="current-password" autoFocus required />
            <CampoTexto rotulo="Nova senha" senha valor={nova} onChange={setNova} autoComplete="new-password" required ajuda="Mínimo de 8 caracteres." />
            <CampoTexto rotulo="Repita a nova senha" senha valor={confirmar} onChange={setConfirmar} autoComplete="new-password" required />
          </div>
          {erro && <p className="auth-erro" role="alert">{erro}</p>}
          <button type="submit" className="botao primario largo" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar nova senha'}</button>
          <button type="button" className="botao ghost largo" onClick={obrigatoria ? onSair : onCancelar}>{obrigatoria ? 'Sair' : 'Cancelar'}</button>
        </form>
      </div>
    </main>
  )
}
