import { useEffect, useMemo, useRef, useState } from 'react'
import { calcular, calcularTransicao } from './lib/calculo'
import { ANEXOS, ANOS, type Ano } from './lib/tabelas'
import { useSimulacao, validarEntrada } from './estado'
import type { Usuario } from './api'
import { MenuUsuario } from './components/MenuUsuario'
import { brl } from './format'
import { CampoSelect } from './components/Campos'
import { AbaEmpresa } from './components/AbaEmpresa'
import { AbaVendas } from './components/AbaVendas'
import { AbaCompras, ListaComprasImpressao } from './components/AbaCompras'
import { AbaPremissas } from './components/AbaPremissas'
import { Veredito } from './components/Veredito'
import { Guias } from './components/Guias'
import { Comparativo } from './components/Comparativo'
import { GraficoTransicao } from './components/Grafico'

const ABAS = ['Empresa', 'Vendas', 'Compras', 'Premissas'] as const
type Aba = (typeof ABAS)[number]

export default function App({ usuario, onTrocarSenha, onAdministrar, onSair }: {
  usuario: Usuario
  onTrocarSenha: () => void
  onAdministrar: () => void
  onSair: () => void
}) {
  const { entrada, setEntrada, atualizar, restaurar } = useSimulacao(usuario.id)
  const [aba, setAba] = useState<Aba>('Empresa')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const r = useMemo(() => calcular(entrada), [entrada])
  const transicao = useMemo(() => calcularTransicao(entrada), [entrada])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  const exportar = () => {
    const nome = (entrada.empresa || 'empresa').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'empresa'
    const blob = new Blob([JSON.stringify(entrada, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `simulacao-${nome}-${entrada.ano}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ tipo: 'ok', texto: 'Simulação exportada.' })
  }

  const importar = async (f: File | undefined) => {
    if (!f) return
    try {
      const v = validarEntrada(JSON.parse(await f.text()))
      if ('erro' in v) setMsg({ tipo: 'erro', texto: `Não foi possível importar: ${v.erro}` })
      else {
        setEntrada(v.entrada)
        setMsg({ tipo: 'ok', texto: `Simulação de ${v.entrada.empresa || 'empresa sem nome'} importada.` })
      }
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível importar: o arquivo não é um JSON válido.' })
    }
    if (arquivo.current) arquivo.current.value = ''
  }

  const painel = (
    <>
      <div role="tabpanel" id="painel-Empresa" aria-labelledby="aba-Empresa" hidden={aba !== 'Empresa'}>
        {aba === 'Empresa' && <AbaEmpresa entrada={entrada} r={r} atualizar={atualizar} />}
      </div>
      <div role="tabpanel" id="painel-Vendas" aria-labelledby="aba-Vendas" hidden={aba !== 'Vendas'}>
        {aba === 'Vendas' && <AbaVendas entrada={entrada} atualizar={atualizar} />}
      </div>
      <div role="tabpanel" id="painel-Compras" aria-labelledby="aba-Compras" hidden={aba !== 'Compras'}>
        {aba === 'Compras' && <AbaCompras entrada={entrada} r={r} setEntrada={setEntrada} />}
      </div>
      <div role="tabpanel" id="painel-Premissas" aria-labelledby="aba-Premissas" hidden={aba !== 'Premissas'}>
        {aba === 'Premissas' && <AbaPremissas entrada={entrada} atualizar={atualizar} />}
      </div>
    </>
  )

  const anexoNome = ANEXOS.find((a) => a.id === entrada.anexo)?.nome

  return (
    <div className="pagina">
      <header className="cabecalho nao-imprimir">
        <div className="cab-linha">
          <h1>Simulador IBS/CBS no Simples</h1>
          <label className="empresa-nome">
            <span className="so-leitor">Nome da empresa</span>
            <input value={entrada.empresa} placeholder="Nome da empresa" onChange={(e) => atualizar({ empresa: e.target.value })} />
          </label>
          <CampoSelect<Ano> rotulo="Ano" valor={entrada.ano} onChange={(ano) => atualizar({ ano })}
            opcoes={ANOS.map((a) => ({ valor: a, nome: String(a) }))} className="cab-ano" />
        </div>
        <div className="cab-acoes">
          <button type="button" className="botao" onClick={exportar}>Exportar</button>
          <button type="button" className="botao" onClick={() => arquivo.current?.click()}>Importar</button>
          <input ref={arquivo} type="file" accept="application/json,.json" hidden onChange={(e) => importar(e.target.files?.[0])} />
          <button type="button" className="botao" onClick={() => window.print()}>Imprimir</button>
          <button type="button" className="botao" onClick={() => {
            if (window.confirm('Restaurar o exemplo? Todos os dados digitados serão substituídos.')) {
              restaurar()
              setMsg({ tipo: 'ok', texto: 'Exemplo restaurado.' })
            }
          }}>Restaurar exemplo</button>
          <MenuUsuario usuario={usuario} onTrocarSenha={onTrocarSenha} onAdministrar={onAdministrar} onSair={onSair} />
        </div>
      </header>

      {msg && <p className={`mensagem ${msg.tipo} nao-imprimir`} role={msg.tipo === 'erro' ? 'alert' : 'status'}>{msg.texto}</p>}

      <section className="so-impressao relatorio-id">
        <h1>Simulador IBS/CBS no Simples: {entrada.empresa || 'empresa sem nome'}</h1>
        <p>CNPJ {entrada.cnpj || 'não informado'}. Ano de referência {entrada.ano}. {anexoNome}. RBT12 de {brl(entrada.rbt12)}.</p>
      </section>

      <main>
        <div className={aba === 'Compras' ? 'topo larga' : 'topo'}>
          <div className="entrada nao-imprimir">
            <div className="abas" role="tablist" aria-label="Dados da simulação">
              {ABAS.map((a) => (
                <button key={a} type="button" role="tab" id={`aba-${a}`} aria-selected={aba === a} aria-controls={`painel-${a}`}
                  tabIndex={aba === a ? 0 : -1} className={aba === a ? 'aba ativa' : 'aba'}
                  onClick={() => setAba(a)}
                  onKeyDown={(e) => {
                    const i = ABAS.indexOf(aba)
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      const n = ABAS[(i + (e.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length]
                      setAba(n)
                      requestAnimationFrame(() => document.getElementById(`aba-${n}`)?.focus())
                    }
                  }}>
                  {a}
                </button>
              ))}
            </div>
            {painel}
          </div>
          <Veredito entrada={entrada} r={r} />
        </div>

        <Guias r={r} />

        <div className="fim">
          <Comparativo r={r} />
          <GraficoTransicao dados={transicao} ano={entrada.ano} onAno={(ano) => atualizar({ ano })} />
        </div>

        <ListaComprasImpressao r={r} />
      </main>

      <footer className="rodape nao-imprimir">
        <p>Estimativa para apoio à decisão. Valide com a contabilidade. LC 123/2006 e LC 214/2025.</p>
      </footer>
    </div>
  )
}
