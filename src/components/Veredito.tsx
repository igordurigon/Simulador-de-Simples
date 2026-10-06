import { useEffect, useRef, useState } from 'react'
import { brl0, pct } from '../format'
import type { Entrada, Lado, Resultado } from '../lib/calculo'
import { NOME_LADO, Ponto } from './Campos'

const FRASE: Record<Lado, string> = {
  fora: 'Vale mais recolher por fora',
  dentro: 'Vale mais ficar por dentro',
  empate: 'Os dois empatam',
}

function Linha({ titulo, lado, texto }: { titulo: string; lado: Lado; texto: string }) {
  return (
    <div className="vantagem">
      <dt>{titulo}</dt>
      <dd>
        <span className="lado"><Ponto lado={lado} />{lado === 'empate' ? 'Neutro' : NOME_LADO[lado]}</span>
        <span className="compl">{texto}</span>
      </dd>
    </div>
  )
}

export function Veredito({ entrada, r }: { entrada: Entrada; r: Resultado }) {
  const { c1, c2, comp } = r
  const lado = comp.melhorEmpresa
  const anterior = useRef<Lado>(lado)
  const [piscar, setPiscar] = useState(0)

  useEffect(() => {
    if (anterior.current !== lado) {
      anterior.current = lado
      setPiscar((n) => n + 1)
    }
  }, [lado])

  const dif = Math.abs(comp.difLucro)
  const sub = lado === 'empate'
    ? `Diferença de lucro menor que R$ 1 por ano em ${r.ano}`
    : `${brl0(dif)} a mais de lucro por ano em ${r.ano}`

  let b2b: { lado: Lado; texto: string }
  if (comp.vantagemB2B === 'fora') {
    b2b = { lado: 'fora', texto: 'Por fora, o custo líquido do cliente já é menor.' }
  } else if (comp.vantagemB2B === 'fora_com_ajuste') {
    b2b = {
      lado: 'fora',
      texto: `Por fora, baixando o preço em até ${pct(comp.folgaPrecoB2BPct, 1)} (o cliente empata com ${pct(comp.reducaoNecessariaB2BPct, 1)}).`,
    }
  } else {
    b2b = { lado: 'dentro', texto: 'O cliente paga menos por dentro e a folga de preço não cobre a diferença.' }
  }

  let b2c: { lado: Lado; texto: string }
  if (comp.vantagemB2C === 'empate') {
    b2c = {
      lado: 'empate',
      texto: entrada.estrategiaB2C === 'absorver' && comp.receitaAbsorvidaB2C > 0.005
        ? `Neutro no preço; a empresa absorve ${brl0(comp.receitaAbsorvidaB2C)}.`
        : 'Neutro no preço final.',
    }
  } else {
    b2c = { lado: comp.vantagemB2C, texto: `Preço final ${pct(Math.abs(comp.variacaoPrecoB2C))} menor.` }
  }

  return (
    <aside className={`veredito vence-${lado}`} aria-labelledby="veredito-titulo">
      <div key={piscar} className={`veredito-pisca${piscar ? ' pisca' : ''} ${lado}`}>
        <span className={`chip-lado ${lado}`}><Ponto lado={lado} />{lado === 'empate' ? 'Empate' : NOME_LADO[lado]}</span>
        <h2 id="veredito-titulo" className={`frase ${lado}`}>{FRASE[lado]}</h2>
        <p className="sub" aria-live="polite">{sub}</p>
      </div>

      <div className="lados">
        {([['dentro', c1.lucro, c1.margem, c1.das.total], ['fora', c2.lucro, c2.margem, c2.totalTributos]] as const).map(
          ([l, lucro, margem, trib]) => (
            <div key={l} className={`lado-bloco${lado === l ? ' vence ' + l : ''}`}>
              <h3><Ponto lado={l} />{NOME_LADO[l]}</h3>
              <dl>
                <div><dt>Lucro líquido</dt><dd className="num forte">{brl0(lucro)}</dd></div>
                <div><dt>Margem</dt><dd className="num">{pct(margem)}</dd></div>
                <div><dt>Total de tributos</dt><dd className="num">{brl0(trib)}</dd></div>
              </dl>
            </div>
          ),
        )}
      </div>

      <dl className="vantagens">
        <Linha titulo="Para a empresa" lado={lado}
          texto={lado === 'empate' ? 'Sem diferença relevante.' : `${brl0(dif)} a mais de lucro por ano.`} />
        <Linha titulo="Para clientes B2B" lado={b2b.lado} texto={b2b.texto} />
        <Linha titulo="Para consumidor final" lado={b2c.lado} texto={b2c.texto} />
      </dl>

      <p className="nota">Considera a estratégia de preço escolhida em Vendas.</p>
    </aside>
  )
}
