import { useMemo, useState } from 'react'
import { brl0, pct } from '../format'
import { calcularMatriz, calcularSimples, comprasCreditoEquivalente, EMPATE_MATRIZ, type CelulaMatriz, type Entrada, type Resultado } from '../lib/calculo'
import { ANEXOS, SUBLIMITE } from '../lib/tabelas'
import { CampoPercentual, NOME_LADO } from './Campos'

type Cliente = 'b2b' | 'misto' | 'b2c'

const FATURAMENTOS = [120_000, 180_000, 360_000, 540_000, 720_000, 1_200_000, 1_800_000, 2_700_000, 3_600_000]

const NOME_ANEXO: Record<string, string> = { I: 'Comércio', II: 'Indústria', III: 'Serviços', IV: 'Serviços sem CPP', V: 'Serviços, fator R' }

function fatCurto(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  return `R$ ${Math.round(n / 1000).toLocaleString('pt-BR')} mil`
}

/** Intensidade da cor: quanto o lado vencedor ganha, em % do faturamento. */
function nivel(c: CelulaMatriz) {
  const v = Math.abs(c.difPct)
  if (v < EMPATE_MATRIZ) return ''
  return v < 0.01 ? 'n1' : v < 0.03 ? 'n2' : 'n3'
}

export function Matriz({ entrada, r }: { entrada: Entrada; r: Resultado }) {
  const sugerido = Math.round(comprasCreditoEquivalente(entrada, r) * 100) / 100
  const [cliente, setCliente] = useState<Cliente>('misto')
  const [compras, setCompras] = useState<number | null>(null)
  const pctCompras = compras ?? sugerido
  const pctB2B = cliente === 'b2b' ? 1 : cliente === 'b2c' ? 0 : entrada.pctB2B

  const opcoes: { v: Cliente; t: string }[] = [
    { v: 'b2b', t: 'Empresas (B2B)' },
    { v: 'misto', t: `Misto, ${pct(entrada.pctB2B, 0)} B2B` },
    { v: 'b2c', t: 'Consumidor final (B2C)' },
  ]

  const suaEmpresa = entrada.faturamento > 0 && entrada.faturamento <= SUBLIMITE ? entrada.faturamento : null
  const linhas = useMemo(() => {
    const fats = suaEmpresa !== null && !FATURAMENTOS.includes(suaEmpresa)
      ? [...FATURAMENTOS, suaEmpresa].sort((a, b) => a - b) : FATURAMENTOS
    const m = calcularMatriz(entrada, pctB2B, pctCompras, fats, ANEXOS.map((a) => a.id))
    return fats.map((f, i) => ({ f, faixa: calcularSimples(f, 'I').faixa, celulas: m[i] }))
  }, [entrada, pctB2B, pctCompras, suaEmpresa])

  return (
    <section className="matriz" aria-labelledby="t-matriz">
      <div className="matriz-cab">
        <div>
          <h2 id="t-matriz">Por dentro ou por fora: faturamento × anexo</h2>
          <p className="apoio">
            Quem ganha em cada combinação, para o tipo de cliente escolhido. O número é a vantagem do lado vencedor,
            em % do faturamento. Ano {entrada.ano}, com as alíquotas e a estratégia de preço da simulação.
          </p>
        </div>
        <div className="matriz-controles">
          <fieldset className="estrategia">
            <legend>Cliente final</legend>
            <div className="segmentado tres" role="radiogroup" aria-label="Cliente final">
              {opcoes.map((o) => (
                <label key={o.v} className={cliente === o.v ? 'ativo' : ''}>
                  <input type="radio" name="matriz-cliente" checked={cliente === o.v} onChange={() => setCliente(o.v)} />
                  <span>{o.t}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <CampoPercentual rotulo="Compras com crédito integral (% do faturamento)" valor={pctCompras}
              onChange={(v) => setCompras(Math.max(0, v ?? 0))} />
            {compras !== null && Math.abs(compras - sugerido) > 0.00001 ? (
              <button type="button" className="link-acao" onClick={() => setCompras(null)}>
                Voltar ao da simulação ({pct(sugerido, 0)})
              </button>
            ) : (
              <p className="nota-caixa">Equivale ao crédito das compras lançadas na simulação.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rolagem">
        <table className="tabela-matriz">
          <caption className="so-leitor">
            Lado vencedor por faturamento anual e anexo do Simples, cliente {opcoes.find((o) => o.v === cliente)?.t},
            compras com crédito de {pct(pctCompras, 0)} do faturamento.
          </caption>
          <thead>
            <tr>
              <th scope="col">Faturamento anual</th>
              {ANEXOS.map((a) => (
                <th key={a.id} scope="col" className={a.id === entrada.anexo ? 'sel' : undefined}>
                  <span className="mt-anexo">Anexo {a.id}</span>
                  <span className="mt-sub">{NOME_ANEXO[a.id]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ f, faixa, celulas }) => {
              const sua = f === suaEmpresa
              return (
                <tr key={f} className={sua ? 'sua' : undefined}>
                  <th scope="row">
                    <span className="mt-fat num">{fatCurto(f)}</span>
                    <span className="mt-sub">{sua ? 'Sua empresa' : `${faixa}ª faixa`}</span>
                  </th>
                  {celulas.map((c, j) => {
                    const anexo = ANEXOS[j].id
                    const marcada = sua && anexo === entrada.anexo
                    return (
                      <td key={anexo} className={`mc ${c.lado} ${nivel(c)}${marcada ? ' marcada' : ''}`}
                        title={`Anexo ${anexo}, ${brl0(f)} por ano. Lucro por dentro ${brl0(c.lucroDentro)}; por fora ${brl0(c.lucroFora)}.`}>
                        <span className="mc-lado">{NOME_LADO[c.lado]}</span>
                        {c.lado !== 'empate' && <span className="mc-dif num">{' '}{pct(Math.abs(c.difPct), 1)}</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="matriz-legenda">
        <span><i className="amostra dentro" aria-hidden="true" />Por dentro ganha</span>
        <span><i className="amostra fora" aria-hidden="true" />Por fora ganha</span>
        <span><i className="amostra empate" aria-hidden="true" />Diferença abaixo de {pct(EMPATE_MATRIZ, 2)}</span>
        <span>Cor mais forte, vantagem maior: até 1%, de 1% a 3% e acima de 3%.</span>
      </div>
      <p className="apoio">
        Despesas sem crédito, como folha e pró-labore, não mudam a decisão: pesam igual nos dois lados.
        Acima de {fatCurto(SUBLIMITE)} o ICMS e o ISS saem do DAS e a matriz não se aplica.
      </p>
    </section>
  )
}
