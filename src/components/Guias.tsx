import { useState, type ReactNode } from 'react'
import { brl, pct } from '../format'
import { NOME_LADO, Ponto } from './Campos'
import type { Resultado, Segmentos } from '../lib/calculo'

type Linha =
  | { t: 'seg'; nome: string; s: Segmentos; destaque?: boolean }
  | { t: 'total'; nome: string; v: ReactNode; destaque?: boolean; nota?: string }
  | { t: 'tit'; nome: string }

function Celula({ children, nota, destaque, vazio }: { children?: ReactNode; nota?: string; destaque?: boolean; vazio?: boolean }) {
  return (
    <div className={`caixa celula${destaque ? ' destaque' : ''}${vazio ? ' vazia' : ''}`} role="cell">
      <span className="valor num">{children}</span>
      {nota && <span className="nota-caixa">{nota}</span>}
    </div>
  )
}

function Guia({ lado, titulo, linhas, extra }: { lado: 'dentro' | 'fora'; titulo: string; linhas: Linha[]; extra?: ReactNode }) {
  return (
    <section className={`guia ${lado}`} aria-labelledby={`g-${lado}`}>
      <header className="guia-cab">
        <span className={`chip-lado ${lado}`}><Ponto lado={lado} />{NOME_LADO[lado]}</span>
        <h2 id={`g-${lado}`}>{titulo}</h2>
      </header>
      <div className="rolagem">
        <div className="guia-grade" role="table" aria-label={titulo}>
          <div className="guia-linha cab" role="row">
            <div className="caixa cab-cel" role="columnheader"><span className="rotulo">Item</span></div>
            <div className="caixa cab-cel d" role="columnheader"><span className="rotulo">B2B</span></div>
            <div className="caixa cab-cel d" role="columnheader"><span className="rotulo">B2C</span></div>
            <div className="caixa cab-cel d" role="columnheader"><span className="rotulo">Total</span></div>
          </div>
          {linhas.map((l, i) =>
            l.t === 'tit' ? (
              <div key={i} className="guia-tit" role="row"><span role="cell">{l.nome}</span></div>
            ) : (
              <div key={i} className={`guia-linha${l.destaque ? ' destaque-linha' : ''}`} role="row">
                <div className={`caixa nome-cel${l.destaque ? ' destaque' : ''}`} role="rowheader"><span className="rotulo">{l.nome}</span></div>
                {l.t === 'seg' ? (
                  <>
                    <Celula destaque={l.destaque}>{brl(l.s.b2b)}</Celula>
                    <Celula destaque={l.destaque}>{brl(l.s.b2c)}</Celula>
                    <Celula destaque={l.destaque}>{brl(l.s.total)}</Celula>
                  </>
                ) : (
                  <>
                    <Celula vazio />
                    <Celula vazio />
                    <Celula destaque={l.destaque} nota={l.nota}>{l.v}</Celula>
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </div>
      {extra}
    </section>
  )
}

export function Guias({ r }: { r: Resultado }) {
  const { c1, c2 } = r
  const [aberto, setAberto] = useState(false)

  const l1: Linha[] = [
    { t: 'seg', nome: 'Receita', s: c1.receita },
    { t: 'seg', nome: 'DAS', s: c1.das },
    { t: 'total', nome: 'Total de tributos', v: brl(c1.das.total) },
    { t: 'total', nome: 'Compras', v: brl(c1.compras) },
    { t: 'total', nome: 'Despesas', v: brl(c1.despesas) },
    { t: 'total', nome: 'Lucro líquido', v: brl(c1.lucro), destaque: true },
    { t: 'total', nome: 'Margem', v: pct(c1.margem) },
    { t: 'tit', nome: 'Do lado do cliente' },
    { t: 'seg', nome: 'Preço pago pelo cliente', s: c1.preco },
    { t: 'seg', nome: 'Crédito gerado', s: c1.creditoGerado },
    { t: 'seg', nome: 'Crédito aproveitado', s: c1.creditoAproveitado },
    { t: 'seg', nome: 'Custo líquido para o cliente', s: c1.custoLiquidoCliente },
  ]
  const l2: Linha[] = [
    { t: 'seg', nome: 'Receita (sem IBS/CBS)', s: c2.receita },
    { t: 'seg', nome: 'DAS', s: c2.das },
    { t: 'seg', nome: 'IBS débito', s: c2.ibsDebito },
    { t: 'seg', nome: 'CBS débito', s: c2.cbsDebito },
    { t: 'seg', nome: 'Preço cobrado do cliente', s: c2.preco },
    { t: 'total', nome: 'Crédito de IBS usado (compras)', v: brl(c2.creditoIbs) },
    { t: 'total', nome: 'Crédito de CBS usado (compras)', v: brl(c2.creditoCbs) },
    ...(c2.saldoCredor > 0.005
      ? [{ t: 'total' as const, nome: 'Saldo credor (fora do lucro)', v: brl(c2.saldoCredor), nota: 'crédito acima do débito, fica para compensar' }]
      : []),
    { t: 'total', nome: 'IBS a recolher', v: brl(c2.ibsRecolher) },
    { t: 'total', nome: 'CBS a recolher', v: brl(c2.cbsRecolher) },
    { t: 'total', nome: 'Total de tributos', v: brl(c2.totalTributos) },
    { t: 'total', nome: 'Compras', v: brl(c2.compras) },
    { t: 'total', nome: 'Despesas', v: brl(c2.despesas) },
    { t: 'total', nome: 'Lucro líquido', v: brl(c2.lucro), destaque: true },
    { t: 'total', nome: 'Margem', v: pct(c2.margem) },
    { t: 'tit', nome: 'Do lado do cliente' },
    { t: 'seg', nome: 'Crédito gerado', s: c2.creditoGerado },
    { t: 'seg', nome: 'Crédito aproveitado', s: c2.creditoAproveitado },
    { t: 'seg', nome: 'Custo líquido para o cliente', s: c2.custoLiquidoCliente },
  ]

  const composicao = (
    <details className="composicao" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary>Composição do DAS</summary>
      <table className="tabela-simples">
        <thead><tr><th scope="col">Tributo</th><th scope="col" className="d">Valor</th><th scope="col" className="d">Parte do DAS</th></tr></thead>
        <tbody>
          {c1.composicaoDas.map((x) => (
            <tr key={x.nome}>
              <th scope="row">{x.nome}</th>
              <td className="d num">{brl(x.valor)}</td>
              <td className="d num">{pct(c1.das.total > 0 ? x.valor / c1.das.total : 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th scope="row">Total do DAS</th><td className="d num">{brl(c1.das.total)}</td><td className="d num">100%</td></tr></tfoot>
      </table>
    </details>
  )

  return (
    <div className="guias">
      <Guia lado="dentro" titulo="Cenário 1 – Simples por dentro" linhas={l1} extra={composicao} />
      <Guia lado="fora" titulo="Cenário 2 – Simples por fora" linhas={l2} />
    </div>
  )
}
