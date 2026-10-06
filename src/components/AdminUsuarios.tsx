import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { apiUsuarios, ErroApi, gerarSenha, type Perfil, type Usuario } from '../api'
import { CampoTexto } from './CampoTexto'
import { Menu } from './Menu'
import { MenuUsuario } from './MenuUsuario'

type Gaveta =
  | { tipo: 'novo' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'senha'; usuario: Usuario; senha: string }
  | { tipo: 'criado'; usuario: Usuario; senha: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const msg = (e: unknown) => (e instanceof ErroApi ? e.message : 'Algo deu errado. Tente novamente.')

async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* cai no plano B */ }
  // Plano B para páginas servidas em HTTP, onde a API de área de transferência não existe.
  const t = document.createElement('textarea')
  t.value = texto
  t.setAttribute('readonly', '')
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* sem suporte */ }
  t.remove()
  return ok
}

function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [estado, setEstado] = useState<'' | 'ok' | 'falha'>('')
  useEffect(() => {
    if (!estado) return
    const t = setTimeout(() => setEstado(''), 2500)
    return () => clearTimeout(t)
  }, [estado])
  return (
    <button type="button" className="botao" disabled={!texto} onClick={async () => setEstado((await copiar(texto)) ? 'ok' : 'falha')}>
      {estado === 'ok' ? 'Copiado' : estado === 'falha' ? 'Copie manualmente' : rotulo}
    </button>
  )
}

export function Situacao({ u }: { u: Usuario }) {
  if (!u.ativo) return <span className="pilula inativo">Inativo</span>
  if (u.trocarSenha) return <span className="pilula pendente">Troca de senha pendente</span>
  return <span className="pilula ativo">Ativo</span>
}

export function AdminUsuarios({ usuario, onVoltar, onTrocarSenha, onSair }: {
  usuario: Usuario
  onVoltar: () => void
  onTrocarSenha: () => void
  onSair: () => void
}) {
  const [lista, setLista] = useState<Usuario[] | null>(null)
  const [erroCarga, setErroCarga] = useState('')
  const [busca, setBusca] = useState('')
  const [gaveta, setGaveta] = useState<Gaveta | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    setErroCarga('')
    try {
      setLista((await apiUsuarios.listar()).usuarios)
    } catch (e) {
      setErroCarga(msg(e))
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(t)
  }, [aviso])

  const filtrada = useMemo(() => {
    const q = semAcento(busca.trim())
    if (!lista) return []
    return q ? lista.filter((u) => semAcento(u.nome).includes(q) || semAcento(u.email).includes(q)) : lista
  }, [lista, busca])

  /** Executa uma ação, recarrega a lista e mostra o resultado. */
  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    try {
      await acao()
      setAviso({ tipo: 'ok', texto: sucesso })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msg(e) })
    }
    await carregar()
  }

  const redefinir = async (u: Usuario) => {
    if (!window.confirm(`Redefinir a senha de ${u.nome}? Uma nova senha será gerada e as sessões dele serão encerradas.`)) return
    const senha = gerarSenha()
    try {
      await apiUsuarios.redefinirSenha(u.id, senha)
      setGaveta({ tipo: 'senha', usuario: u, senha })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msg(e) })
    }
    await carregar()
  }

  const alternarAtivo = (u: Usuario) => {
    if (u.ativo && !window.confirm(`Desativar ${u.nome}? Ele será desconectado e não poderá entrar até ser reativado.`)) return
    executar(() => apiUsuarios.alterar(u.id, { ativo: !u.ativo }), u.ativo ? `${u.nome} foi desativado.` : `${u.nome} foi reativado.`)
  }
  const encerrar = (u: Usuario) => {
    if (!window.confirm(`Encerrar todas as sessões de ${u.nome}? Ele precisará entrar de novo.`)) return
    executar(() => apiUsuarios.encerrarSessoes(u.id), `Sessões de ${u.nome} encerradas.`)
  }
  const excluir = (u: Usuario) => {
    if (!window.confirm(`Excluir ${u.nome} (${u.email}) definitivamente? Esta ação não pode ser desfeita. Para apenas bloquear o acesso, use Desativar.`)) return
    executar(() => apiUsuarios.excluir(u.id), `${u.nome} foi excluído.`)
  }

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div className="cab-linha">
          <button type="button" className="botao ghost" onClick={onVoltar}>Voltar ao simulador</button>
          <h1>Administrar usuários</h1>
        </div>
        <div className="cab-acoes">
          <MenuUsuario usuario={usuario} onTrocarSenha={onTrocarSenha} onSair={onSair} />
        </div>
      </header>

      {aviso && <p className={`mensagem ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>{aviso.texto}</p>}

      <main>
        <div className="admin-barra">
          <label className="busca">
            <span className="so-leitor">Buscar por nome ou e-mail</span>
            <input type="search" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <p className="admin-contagem" role="status">
            {lista ? `${filtrada.length} ${filtrada.length === 1 ? 'usuário' : 'usuários'}${busca.trim() ? ` de ${lista.length}` : ''}` : ''}
          </p>
          <button type="button" className="botao primario" onClick={() => setGaveta({ tipo: 'novo' })}>Novo usuário</button>
        </div>

        {erroCarga ? (
          <div className="vazio" role="alert">
            <p>Não foi possível carregar os usuários. {erroCarga}</p>
            <p><button type="button" className="botao" onClick={carregar}>Tentar de novo</button></p>
          </div>
        ) : !lista ? (
          <p className="vazio" role="status">Carregando usuários…</p>
        ) : filtrada.length === 0 ? (
          <div className="vazio">
            {busca.trim() ? (
              <>
                <p>Nenhum usuário encontrado para “{busca.trim()}”. Confira a grafia ou limpe a busca.</p>
                <p><button type="button" className="botao" onClick={() => setBusca('')}>Limpar busca</button></p>
              </>
            ) : (
              <>
                <p>Nenhum usuário cadastrado ainda.</p>
                <p><button type="button" className="botao primario" onClick={() => setGaveta({ tipo: 'novo' })}>Novo usuário</button></p>
              </>
            )}
          </div>
        ) : (
          <div className="rolagem">
            <table className="tabela-usuarios">
              <thead>
                <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th><span className="so-leitor">Ações</span></th></tr>
              </thead>
              <tbody>
                {filtrada.map((u) => {
                  const eu = u.id === usuario.id
                  return (
                    <tr key={u.id} className={u.ativo ? undefined : 'inativa'}>
                      <th scope="row">
                        <span className="nome-usuario">{u.nome}{eu && <span className="chip voce">você</span>}</span>
                      </th>
                      <td className="email-usuario">{u.email}</td>
                      <td><span className={u.perfil === 'admin' ? 'chip perfil-admin' : 'chip'}>{u.perfil === 'admin' ? 'Administrador' : 'Usuário'}</span></td>
                      <td><Situacao u={u} /></td>
                      <td className="num ultimo">{u.ultimoAcesso ? formatoData.format(new Date(u.ultimoAcesso)).replace(', ', ' às ') : <span className="suave">Nunca acessou</span>}</td>
                      <td className="acoes-linha">
                        <button type="button" className="botao pequeno" onClick={() => setGaveta({ tipo: 'editar', usuario: u })}>Editar</button>
                        {!eu && (
                          <Menu className="botao pequeno ghost" ariaLabel={`Mais ações para ${u.nome}`} rotulo={<>Mais<span className="menu-seta" aria-hidden="true" /></>}
                            itens={[
                              { texto: 'Redefinir senha', onClick: () => redefinir(u) },
                              { texto: u.ativo ? 'Desativar' : 'Reativar', onClick: () => alternarAtivo(u) },
                              { texto: 'Encerrar sessões', onClick: () => encerrar(u) },
                              { texto: 'Excluir', onClick: () => excluir(u), perigo: true },
                            ]} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {gaveta && (
        <GavetaUsuario
          key={gaveta.tipo + ('usuario' in gaveta ? gaveta.usuario.id : '')}
          gaveta={gaveta}
          eu={usuario.id}
          onFechar={() => setGaveta(null)}
          onSalvo={async (g, texto) => {
            await carregar()
            if (g) setGaveta(g)
            else setGaveta(null)
            if (texto) setAviso({ tipo: 'ok', texto })
          }}
        />
      )}
    </div>
  )
}

function GavetaUsuario({ gaveta, eu, onFechar, onSalvo }: {
  gaveta: Gaveta
  eu: number
  onFechar: () => void
  onSalvo: (proxima: Gaveta | null, texto?: string) => Promise<void>
}) {
  const editando = gaveta.tipo === 'editar' ? gaveta.usuario : null
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [email, setEmail] = useState(editando?.email ?? '')
  const [perfil, setPerfil] = useState<Perfil>(editando?.perfil ?? 'usuario')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onFechar])
  useEffect(() => { ref.current?.querySelector<HTMLElement>('.gaveta-corpo input, .gaveta-corpo button')?.focus() }, [])

  const titulo = gaveta.tipo === 'novo' ? 'Novo usuário'
    : gaveta.tipo === 'editar' ? 'Editar usuário'
    : gaveta.tipo === 'criado' ? 'Usuário criado' : 'Senha redefinida'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setErro('')
    if (!nome.trim()) return setErro('Preencha o nome.')
    if (!email.trim()) return setErro('Preencha o e-mail.')
    if (gaveta.tipo === 'novo' && senha.length < 8) return setErro('A senha inicial deve ter no mínimo 8 caracteres. Use “Gerar senha” se preferir.')
    setEnviando(true)
    try {
      if (gaveta.tipo === 'novo') {
        const r = await apiUsuarios.criar({ nome, email, perfil, senha })
        await onSalvo({ tipo: 'criado', usuario: r.usuario, senha })
      } else if (editando) {
        await apiUsuarios.alterar(editando.id, { nome, email, perfil })
        await onSalvo(null, `Dados de ${nome.trim()} atualizados.`)
      }
    } catch (x) {
      setErro(msg(x))
      setEnviando(false)
    }
  }

  const resultado = gaveta.tipo === 'criado' || gaveta.tipo === 'senha'
  return (
    <>
      <div className="scrim" onClick={onFechar} aria-hidden="true" />
      <aside ref={ref} className="gaveta" role="dialog" aria-modal="true" aria-labelledby="gaveta-titulo">
        <div className="gaveta-cab">
          <h2 id="gaveta-titulo">{titulo}</h2>
          <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar painel">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        {resultado ? (
          <div className="gaveta-corpo">
            <p className="apoio">
              {gaveta.tipo === 'criado'
                ? <><strong>{gaveta.usuario.nome}</strong> já pode entrar com o e-mail <strong>{gaveta.usuario.email}</strong> e a senha abaixo.</>
                : <>Nova senha de <strong>{gaveta.usuario.nome}</strong>. As sessões dele foram encerradas.</>}
            </p>
            <div className="senha-gerada">
              <output className="senha-valor" aria-label="Senha gerada">{gaveta.senha}</output>
              <BotaoCopiar texto={gaveta.senha} />
            </div>
            <p className="alerta-simples">Esta senha aparece só agora. Copie e repasse ao usuário; no primeiro acesso ele será obrigado a trocá-la.</p>
            <div className="gaveta-acoes">
              <button type="button" className="botao primario" onClick={onFechar}>Concluir</button>
            </div>
          </div>
        ) : (
          <form className="gaveta-corpo" onSubmit={enviar} noValidate>
            <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} autoComplete="off" required />
            <CampoTexto rotulo="E-mail" tipo="email" valor={email} onChange={setEmail} autoComplete="off" required />
            <fieldset className="perfil-campo">
              <legend>Perfil</legend>
              <div className="segmentado">
                {(['usuario', 'admin'] as const).map((p) => (
                  <label key={p} className={perfil === p ? 'ativo' : undefined}>
                    <input type="radio" name="perfil" value={p} checked={perfil === p} onChange={() => setPerfil(p)} />
                    {p === 'admin' ? 'Administrador' : 'Usuário'}
                  </label>
                ))}
              </div>
              <p className="nota-caixa">
                {editando?.id === eu && perfil !== 'admin'
                  ? 'Ao salvar, você deixa de ser administrador e perde o acesso a esta tela.'
                  : perfil === 'admin' ? 'Administradores gerenciam os usuários.' : 'Usuários só usam o simulador.'}
              </p>
            </fieldset>
            {gaveta.tipo === 'novo' && (
              <div className="senha-inicial">
                <CampoTexto rotulo="Senha inicial" tipo="text" valor={senha} onChange={setSenha} autoComplete="off" required
                  ajuda="Mínimo de 8 caracteres. O usuário troca no primeiro acesso." />
                <div className="senha-botoes">
                  <button type="button" className="botao" onClick={() => setSenha(gerarSenha())}>Gerar senha</button>
                  <BotaoCopiar texto={senha} />
                </div>
              </div>
            )}
            {erro && <p className="auth-erro" role="alert">{erro}</p>}
            <div className="gaveta-acoes">
              <button type="submit" className="botao primario" disabled={enviando}>{enviando ? 'Salvando…' : gaveta.tipo === 'novo' ? 'Criar usuário' : 'Salvar alterações'}</button>
              <button type="button" className="botao ghost" onClick={onFechar}>Cancelar</button>
            </div>
          </form>
        )}
      </aside>
    </>
  )
}
