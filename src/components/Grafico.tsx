import { useEffect, useMemo, useRef, useState } from 'react'
import { brl, brl0, brlEixo, sinalBrl } from '../format'
import type { Lado } from '../lib/calculo'
import type { Ano } from '../lib/tabelas'
import { NOME_LADO, Ponto } from './Campos'

export interface DadoAno { ano: Ano; lucroDentro: number; lucroFora: number; dif: number }

interface Props {
  dados: DadoAno[]
  ano: Ano
  onAno: (a: Ano) => void
}

const ladoDe = (dif: number): Lado => (Math.abs(dif) < 0.005 ? 'empate' : dif > 0 ? 'fora' : 'dentro')

function escala(vals: number[]) {
  const max = Math.max(0, ...vals)
  const min = Math.min(0, ...vals)
  const span = Math.max(max - min, 1000)
  const bruto = span / 5
  const p = 10 ** Math.floor(Math.log10(bruto))
  const f = bruto / p
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
  const lo = Math.floor(min / passo) * passo
  const hi = Math.ceil(max / passo) * passo
  const ticks: number[] = []
  for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(Math.round(v / passo) * passo)
  return { lo, hi, ticks }
}

/** Barra com a ponta de dado arredondada (4px) e a base quadrada na linha zero. */
function caminhoBarra(x: number, w: number, y0: number, y: number): string {
  const h = Math.abs(y - y0)
  if (h < 0.5) return ''
  const r = Math.min(4, h)
  const x2 = x + w
  if (y < y0) {
    return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x2 - r}Q${x2},${y} ${x2},${y + r}V${y0}Z`
  }
  return `M${x},${y0}V${y - r}Q${x},${y} ${x + r},${y}H${x2 - r}Q${x2},${y} ${x2},${y - r}V${y0}Z`
}

export function TabelaTransicao({ dados, ano }: { dados: DadoAno[]; ano: Ano }) {
  return (
    <div className="rolagem">
      <table className="tabela-simples">
        <thead>
          <tr>
            <th scope="col">Ano</th>
            <th scope="col" className="d">Lucro por dentro</th>
            <th scope="col" className="d">Lucro por fora</th>
            <th scope="col" className="d">Diferença</th>
            <th scope="col">Melhor</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => {
            const l = ladoDe(d.dif)
            return (
              <tr key={d.ano} className={d.ano === ano ? 'atual' : ''}>
                <th scope="row">{d.ano}</th>
                <td className="d num">{brl(d.lucroDentro)}</td>
                <td className="d num">{brl(d.lucroFora)}</td>
                <td className="d num">{sinalBrl(d.dif)}</td>
                <td><span className="melhor"><Ponto lado={l} />{NOME_LADO[l]}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GraficoTransicao({ dados, ano, onAno }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(620)
  const [hover, setHover] = useState<number | null>(null)
  const [tabela, setTabela] = useState(false)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabela])

  const H = 300
  const m = { t: 26, r: 22, b: 36, l: 66 }
  const { lo, hi, ticks } = useMemo(() => escala(dados.map((d) => d.dif)), [dados])
  const pw = w - m.l - m.r
  const ph = H - m.t - m.b
  const y = (v: number) => m.t + ((hi - v) / (hi - lo || 1)) * ph
  const y0 = y(0)
  const banda = pw / dados.length
  const bw = Math.min(24, banda * 0.5)

  const iMax = dados.reduce((im, d, i) => (Math.abs(d.dif) > Math.abs(dados[im].dif) ? i : im), 0)
  const rotulados = new Set<number>([iMax, dados.findIndex((d) => d.ano === ano)])
  const tip = hover === null ? null : dados[hover]

  return (
    <section className="transicao" aria-labelledby="t-trans">
      <h2 id="t-trans">Ao longo da transição</h2>
      <p className="apoio">Diferença de lucro por ano: por fora menos por dentro. Clique em um ano para usá-lo como referência.</p>
      <ul className="legenda-grafico">
        <li><Ponto lado="fora" />Por fora dá mais lucro</li>
        <li><Ponto lado="dentro" />Por dentro dá mais lucro</li>
      </ul>

      {!tabela && (
        <div className="grafico" ref={caixa}>
          <svg width={w} height={H} role="group" aria-label="Diferença de lucro entre por fora e por dentro, por ano">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--fio-leve)" strokeWidth={1} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="eixo">{brlEixo(t)}</text>
              </g>
            ))}
            {dados.map((d, i) => {
              const cx = m.l + banda * (i + 0.5)
              const topo = y(d.dif)
              const sel = d.ano === ano
              return (
                <g key={d.ano}>
                  <path d={caminhoBarra(cx - bw / 2, bw, y0, topo)} fill={d.dif >= 0 ? 'var(--fora)' : 'var(--dentro)'} />
                  {rotulados.has(i) && (
                    <text x={cx} y={d.dif >= 0 ? topo - 7 : topo + 16} textAnchor="middle" className="rotulo-valor">{brl0(d.dif)}</text>
                  )}
                  <text x={cx} y={H - 12} textAnchor="middle" className={sel ? 'eixo sel' : 'eixo'}>{d.ano}</text>
                  {sel && <line x1={cx - 14} x2={cx + 14} y1={H - 6} y2={H - 6} stroke="var(--tinta)" strokeWidth={2} />}
                </g>
              )
            })}
            <line x1={m.l} x2={w - m.r} y1={y0} y2={y0} stroke="var(--tinta-3)" strokeWidth={1} />
            {dados.map((d, i) => (
              <g
                key={d.ano}
                className={`faixa${hover === i ? ' ativa' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${d.ano}: por dentro ${brl0(d.lucroDentro)}, por fora ${brl0(d.lucroFora)}, diferença ${sinalBrl(d.dif)}`}
                aria-pressed={d.ano === ano}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => onAno(d.ano)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAno(d.ano) }
                }}
              >
                <rect x={m.l + banda * i} y={m.t - 10} width={banda} height={ph + 20 + m.b - 10} />
              </g>
            ))}
          </svg>
          {tip && hover !== null && (
            <div className="dica" style={{ left: Math.min(Math.max(m.l + banda * (hover + 0.5), 100), w - 100) }} role="status">
              <strong>{tip.ano}</strong>
              <span>Por dentro: {brl(tip.lucroDentro)}</span>
              <span>Por fora: {brl(tip.lucroFora)}</span>
              <span>Diferença: {sinalBrl(tip.dif)}</span>
            </div>
          )}
        </div>
      )}
      {tabela && <TabelaTransicao dados={dados} ano={ano} />}

      <button type="button" className="botao" onClick={() => setTabela((v) => !v)} aria-pressed={tabela}>
        {tabela ? 'Ver como gráfico' : 'Ver como tabela'}
      </button>

      <div className="so-impressao"><TabelaTransicao dados={dados} ano={ano} /></div>
    </section>
  )
}
