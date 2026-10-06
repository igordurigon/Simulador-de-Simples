import { useRef, useState } from 'react'
import { brl, pct } from '../format'
import { novoId, TIPOS_FORNECEDOR, type Compra, type Entrada, type Resultado, type TipoFornecedor } from '../lib/calculo'
import { interpretarColagem, type Previa } from '../lib/importacao'
import { consolidarNotas } from '../lib/nfe'
import { arquivosDoDrop, baixarModelo, lerPlanilha, lerXmls } from '../lib/arquivos'
import { CampoMoeda, CampoPercentual, CampoSelect } from './Campos'
import { PainelImportacao } from './PainelImportacao'

interface Props {
  entrada: Entrada
  r: Resultado
  setEntrada: (f: (e: Entrada) => Entrada) => void
}

export function AbaCompras({ entrada, r, setEntrada }: Props) {
  const [colando, setColando] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [lendo, setLendo] = useState<{ lidos: number; total: number } | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const inputPlanilha = useRef<HTMLInputElement>(null)
  const inputPasta = useRef<HTMLInputElement>(null)
  const dirProps = { webkitdirectory: '', directory: '' } as Record<string, string>

  const mudar = (id: string, p: Partial<Compra>) =>
    setEntrada((e) => ({ ...e, compras: e.compras.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const remover = (id: string) => setEntrada((e) => ({ ...e, compras: e.compras.filter((c) => c.id !== id) }))
  const adicionar = () =>
    setEntrada((e) => ({
      ...e,
      compras: [...e.compras, { id: novoId(), fornecedor: '', descricao: '', tipo: 'regular', geraCredito: true, valor: 0, aliquotaNota: null }],
    }))

  const abrirPrevia = (p: Previa) => { setAviso(null); setPrevia(p) }

  const colar = () => {
    abrirPrevia(interpretarColagem(texto))
    setColando(false)
    setTexto('')
  }

  const escolherPlanilha = async (f: File | undefined) => {
    if (inputPlanilha.current) inputPlanilha.current.value = ''
    if (!f) return
    try {
      abrirPrevia(await lerPlanilha(f))
    } catch (e) {
      setPrevia(null)
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível ler a planilha.' })
    }
  }

  const importarArquivos = async (arquivos: File[]) => {
    if (!arquivos.length) return
    setPrevia(null)
    setAviso(null)
    try {
      const { lidos, naoXml } = await lerXmls(arquivos, (a, t) => setLendo({ lidos: a, total: t }))
      setLendo(null)
      if (!lidos.length) {
        setAviso({ tipo: 'erro', texto: 'Nenhum arquivo .xml encontrado. Se as notas estão em .zip, descompacte antes.' })
        return
      }
      const chaves = entrada.compras.flatMap((c) => c.origem?.chaves ?? [])
      const p = consolidarNotas(lidos, { cnpjEmpresa: entrada.cnpj, chavesExistentes: chaves })
      if (naoXml.length) p.resumo.push(`${naoXml.length} ${naoXml.length === 1 ? 'arquivo que não é .xml foi ignorado' : 'arquivos que não são .xml foram ignorados'}.`)
      abrirPrevia(p)
    } catch (e) {
      setLendo(null)
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível ler os arquivos.' })
    }
  }

  const soltar = async (ev: React.DragEvent) => {
    ev.preventDefault()
    setArrastando(false)
    const itens = ev.dataTransfer.items
    const arquivos = itens && itens.length ? await arquivosDoDrop(itens) : Array.from(ev.dataTransfer.files)
    await importarArquivos(arquivos)
  }

  const gravar = (modo: 'adicionar' | 'substituir', preencherCnpj: boolean) => {
    if (!previa) return
    if (modo === 'substituir' && entrada.compras.length > 0 &&
      !window.confirm(`Substituir as ${entrada.compras.length} compras atuais pelas importadas? As atuais serão apagadas.`)) return
    const final = modo === 'substituir' && previa.refazer ? previa.refazer(true) : previa
    const novas = final.compras
    setEntrada((e) => ({
      ...e,
      compras: modo === 'substituir' ? novas : [...e.compras, ...novas],
      cnpj: preencherCnpj && previa.cnpjSugerido ? previa.cnpjSugerido : e.cnpj,
    }))
    setAviso({ tipo: 'ok', texto: `${novas.length} ${novas.length === 1 ? 'compra importada' : 'compras importadas'}.` })
    setPrevia(null)
  }

  const porTipo = TIPOS_FORNECEDOR.map((t) => {
    const itens = r.compras.filter((c) => c.tipo === t.id)
    return { ...t, valor: itens.reduce((a, c) => a + c.valor, 0), credito: itens.reduce((a, c) => a + c.credito, 0), n: itens.length }
  })
  const creditoMedio = r.totalComprasLista > 0 ? r.totalCreditosLista / r.totalComprasLista : 0

  return (
    <div className="aba-corpo">
      <div className="barra-acoes">
        <button type="button" className="botao primario" onClick={() => inputPasta.current?.click()} disabled={!!lendo}>Importar XML de notas</button>
        <button type="button" className="botao" onClick={() => inputPlanilha.current?.click()}>Importar planilha</button>
        <button type="button" className="botao" onClick={adicionar}>Adicionar compra</button>
        <button type="button" className="botao" onClick={() => setColando((v) => !v)} aria-expanded={colando}>Colar do Excel</button>
        <button type="button" className="botao ghost" onClick={() => { baixarModelo().catch(() => setAviso({ tipo: 'erro', texto: 'Não foi possível gerar o modelo.' })) }}>Baixar modelo</button>
        <input ref={inputPlanilha} type="file" accept=".xlsx,.xls,.csv,.txt" className="so-leitor" tabIndex={-1} aria-label="Escolher planilha de compras"
          onChange={(e) => escolherPlanilha(e.target.files?.[0])} />
        <input ref={inputPasta} type="file" multiple className="so-leitor" tabIndex={-1} aria-label="Escolher pasta com XMLs de notas" {...dirProps}
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; importarArquivos(f) }} />
      </div>

      <div className={`zona-xml${arrastando ? ' ativa' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}>
        <p>Solte aqui a pasta com os XMLs das notas, ou os próprios arquivos.</p>
        <p className="apoio">Arquivos .zip não são lidos: descompacte antes. Só notas em que a empresa é destinatária viram compras.</p>
        {lendo && <p className="progresso" role="status">Lendo {lendo.lidos.toLocaleString('pt-BR')} de {lendo.total.toLocaleString('pt-BR')} arquivos</p>}
      </div>

      {colando && (
        <div className="colar">
          <label htmlFor="colar-txt">
            Cole as linhas copiadas do Excel, na ordem: fornecedor, descrição, tipo, gera crédito (sim ou não), valor e, se quiser, % na nota.
          </label>
          <textarea id="colar-txt" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={'Distribuidora Alfa\tMercadoria\tregular\tsim\t420.000,00'} />
          <div className="barra-acoes">
            <button type="button" className="botao primario" onClick={colar} disabled={!texto.trim()}>Ver prévia</button>
            <button type="button" className="botao ghost" onClick={() => { setColando(false); setTexto('') }}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso && <p className={`aviso-importacao ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>{aviso.texto}</p>}

      {previa && (
        <PainelImportacao previa={previa} temCompras={entrada.compras.length > 0} temComprasNfe={entrada.compras.some((c) => c.origem?.tipo === 'nfe')} cnpjAtual={entrada.cnpj}
          onGravar={gravar} onCancelar={() => setPrevia(null)} />
      )}

      {entrada.compras.length === 0 ? (
        <p className="vazio">Nenhuma compra ainda. Adicione a primeira compra para ver o crédito de IBS/CBS que ela gera.</p>
      ) : (
        <div className="rolagem">
          <table className="tabela-compras">
            <thead>
              <tr>
                <th scope="col">Fornecedor</th>
                <th scope="col">Descrição</th>
                <th scope="col">Tipo de fornecedor</th>
                <th scope="col">Gera crédito?</th>
                <th scope="col" className="d">Valor pago no ano (R$)</th>
                <th scope="col" className="d">% na nota (opcional)</th>
                <th scope="col" className="d">% aplicado</th>
                <th scope="col" className="d">Crédito</th>
                <th scope="col"><span className="so-leitor">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {r.compras.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <div className="celula-forn">
                      <input className="celula" aria-label={`Fornecedor da compra ${i + 1}`} value={c.fornecedor}
                        onChange={(e) => mudar(c.id, { fornecedor: e.target.value })} />
                      {c.origem?.tipo === 'nfe' && (
                        <span className="chip nfe" title={`${c.origem.chaves?.length ?? 0} ${c.origem.chaves?.length === 1 ? 'nota importada' : 'notas importadas'}${c.origem.observacao ? '. ' + c.origem.observacao : ''}`}>
                          NF-e <span className="num">{c.origem.chaves?.length ?? 0}</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td><input className="celula" aria-label={`Descrição da compra ${i + 1}`} value={c.descricao}
                    onChange={(e) => mudar(c.id, { descricao: e.target.value })} /></td>
                  <td>
                    <CampoSelect<TipoFornecedor> semRotulo rotulo={`Tipo de fornecedor da compra ${i + 1}`} valor={c.tipo}
                      onChange={(tipo) => mudar(c.id, { tipo, ...(tipo === 'nao_contribuinte' ? { geraCredito: false } : {}) })}
                      opcoes={TIPOS_FORNECEDOR.map((t) => ({ valor: t.id, nome: t.nome }))} className="celula-caixa" />
                  </td>
                  <td className="centro">
                    <input type="checkbox" className="toggle" role="switch" aria-label={`Gera crédito, compra ${i + 1}`}
                      checked={c.geraCredito} onChange={(e) => mudar(c.id, { geraCredito: e.target.checked })} />
                  </td>
                  <td className="d"><CampoMoeda semRotulo rotulo={`Valor pago, compra ${i + 1}`} valor={c.valor}
                    onChange={(valor) => mudar(c.id, { valor })} className="celula-caixa" /></td>
                  <td className="d"><CampoPercentual semRotulo anulavel rotulo={`Percentual na nota, compra ${i + 1}`}
                    valor={c.aliquotaNota} placeholder="padrão" disabled={c.tipo === 'nao_contribuinte'}
                    onChange={(aliquotaNota) => mudar(c.id, { aliquotaNota })} className="celula-caixa" /></td>
                  <td className="d num">{pct(c.aliquotaAplicada)}</td>
                  <td className="d num">{brl(c.credito)}</td>
                  <td className="centro">
                    <button type="button" className="botao-icone" onClick={() => remover(c.id)} aria-label={`Remover compra ${i + 1}`}>
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>Total</th>
                <td className="d num">{brl(r.totalComprasLista)}</td>
                <td />
                <td className="d num">{pct(creditoMedio)}</td>
                <td className="d num">{brl(r.totalCreditosLista)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <section aria-labelledby="t-por-tipo">
        <h3 id="t-por-tipo">Resumo por tipo de fornecedor</h3>
        <div className="rolagem">
          <table className="tabela-simples">
            <thead>
              <tr><th scope="col">Tipo</th><th scope="col" className="d">Compras</th><th scope="col" className="d">Valor</th><th scope="col" className="d">Crédito</th></tr>
            </thead>
            <tbody>
              {porTipo.map((t) => (
                <tr key={t.id}><th scope="row">{t.nome}</th><td className="d num">{t.n}</td><td className="d num">{brl(t.valor)}</td><td className="d num">{brl(t.credito)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="apoio">Crédito médio sobre as compras: <strong>{pct(creditoMedio)}</strong></p>
        {Math.abs(r.fatorCompras - 1) > 0.0005 && (
          <p className="apoio">
            Na simulação, as compras acompanham o faturamento: {brl(r.totalComprasLista)} viram{' '}
            <strong>{brl(r.totalCompras)}</strong> e o crédito vira <strong>{brl(r.totalCreditos)}</strong>.
          </p>
        )}
      </section>
    </div>
  )
}

/** Lista simples de compras, usada só na impressão. */
export function ListaComprasImpressao({ r }: { r: Resultado }) {
  return (
    <section className="so-impressao bloco">
      <h2>Compras consideradas</h2>
      <table className="tabela-simples">
        <thead>
          <tr><th scope="col">Fornecedor</th><th scope="col">Descrição</th><th scope="col">Tipo</th><th scope="col">Gera crédito</th>
            <th scope="col" className="d">Valor</th><th scope="col" className="d">% aplicado</th><th scope="col" className="d">Crédito</th></tr>
        </thead>
        <tbody>
          {r.compras.map((c) => (
            <tr key={c.id}>
              <td>{c.fornecedor}</td><td>{c.descricao}</td>
              <td>{TIPOS_FORNECEDOR.find((t) => t.id === c.tipo)?.nome}</td>
              <td>{c.geraCredito ? 'Sim' : 'Não'}</td>
              <td className="d num">{brl(c.valor)}</td><td className="d num">{pct(c.aliquotaAplicada)}</td><td className="d num">{brl(c.credito)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row" colSpan={4}>Total</th><td className="d num">{brl(r.totalComprasLista)}</td><td /><td className="d num">{brl(r.totalCreditosLista)}</td></tr>
        </tfoot>
      </table>
    </section>
  )
}
