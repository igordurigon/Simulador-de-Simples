import { brl, pct, pp, sinalBrl, sinalPct } from '../format'
import type { Lado, Resultado } from '../lib/calculo'
import { Caixa, NOME_LADO, Ponto } from './Campos'

type Melhor = 'maior' | 'menor'

interface Linha {
  nome: string
  d: number
  f: number
  tipo: 'brl' | 'pct'
  melhor: Melhor
  nota?: string
}

function ladoMelhor(d: number, f: number, m: Melhor): Lado {
  if (Math.abs(f - d) < (Math.abs(d) < 1 && Math.abs(f) < 1 ? 0.00005 : 0.005)) return 'empate'
  return (f > d) === (m === 'maior') ? 'fora' : 'dentro'
}

export function Comparativo({ r }: { r: Resultado }) {
  const { c1, c2, comp } = r
  const linhas: Linha[] = [
    { nome: 'Total de tributos', d: c1.das.total, f: c2.totalTributos, tipo: 'brl', melhor: 'menor',
      nota: 'No por fora, parte do IBS/CBS é cobrada do cliente; decida pelo lucro.' },
    { nome: 'Lucro líquido', d: c1.lucro, f: c2.lucro, tipo: 'brl', melhor: 'maior' },
    { nome: 'Margem', d: c1.margem, f: c2.margem, tipo: 'pct', melhor: 'maior' },
    { nome: 'Receita própria sem IBS/CBS', d: c1.receita.total, f: c2.receita.total, tipo: 'brl', melhor: 'maior' },
    { nome: 'Preço pago por clientes B2B', d: c1.preco.b2b, f: c2.preco.b2b, tipo: 'brl', melhor: 'menor' },
    { nome: 'Crédito aproveitado B2B', d: c1.creditoAproveitado.b2b, f: c2.creditoAproveitado.b2b, tipo: 'brl', melhor: 'maior' },
    { nome: 'Custo líquido B2B', d: c1.custoLiquidoCliente.b2b, f: c2.custoLiquidoCliente.b2b, tipo: 'brl', melhor: 'menor' },
    { nome: 'Preço final B2C', d: c1.preco.b2c, f: c2.preco.b2c, tipo: 'brl', melhor: 'menor' },
  ]
  return (
    <section className="comparativo" aria-labelledby="t-comp">
      <h2 id="t-comp">Comparativo</h2>
      <div className="rolagem">
        <table className="tabela-simples tabela-comp">
          <thead>
            <tr>
              <th scope="col">Indicador</th>
              <th scope="col" className="d">Por dentro</th>
              <th scope="col" className="d">Por fora</th>
              <th scope="col" className="d">Diferença (R$)</th>
              <th scope="col" className="d">Diferença (%)</th>
              <th scope="col">Melhor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const dif = l.f - l.d
              const m = ladoMelhor(l.d, l.f, l.melhor)
              const fmt = l.tipo === 'brl' ? brl : (n: number) => pct(n)
              return (
                <tr key={l.nome}>
                  <th scope="row">
                    {l.nome}
                    {l.nota && <span className="nota-linha">{l.nota}</span>}
                  </th>
                  <td className="d num">{fmt(l.d)}</td>
                  <td className="d num">{fmt(l.f)}</td>
                  <td className="d num">{l.tipo === 'brl' ? sinalBrl(dif) : pp(dif)}</td>
                  <td className="d num">{l.tipo === 'brl' && l.d !== 0 ? sinalPct(dif / Math.abs(l.d)) : '—'}</td>
                  <td><span className="melhor"><Ponto lado={m} />{NOME_LADO[m]}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>Impacto no preço</h3>
      <div className="grade c4">
        <Caixa rotulo="Variação de preço B2B">{sinalPct(comp.variacaoPrecoB2B)}</Caixa>
        <Caixa rotulo="Variação de preço B2C">{sinalPct(comp.variacaoPrecoB2C)}</Caixa>
        <Caixa rotulo="Receita absorvida no B2C">{brl(comp.receitaAbsorvidaB2C)}</Caixa>
        <Caixa rotulo="Folga de preço B2B (R$)">{brl(comp.folgaPrecoB2B)}</Caixa>
        <Caixa rotulo="Folga de preço B2B (%)">{pct(comp.folgaPrecoB2BPct)}</Caixa>
        <Caixa rotulo="Redução para o cliente B2B empatar (R$)">{brl(comp.reducaoNecessariaB2B)}</Caixa>
        <Caixa rotulo="Redução para o cliente B2B empatar (%)">{pct(comp.reducaoNecessariaB2BPct)}</Caixa>
        <div className="caixa vazia" aria-hidden="true" />
      </div>
    </section>
  )
}
