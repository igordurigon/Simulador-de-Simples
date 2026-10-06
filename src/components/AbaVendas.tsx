import { useId } from 'react'
import { brl } from '../format'
import type { Entrada, Estrategia, Resultado } from '../lib/calculo'
import { Alerta, Caixa, CampoMoeda, CampoPercentual, Interruptor } from './Campos'

interface Props {
  entrada: Entrada
  r: Resultado
  atualizar: (p: Partial<Entrada>) => void
}

const DESCRICAO: Record<Estrategia, string> = {
  repassar: 'O preço de tabela sobe com o IBS/CBS por cima; o cliente paga mais e a empresa mantém a receita.',
  absorver: 'O cliente continua pagando o mesmo preço; o IBS/CBS sai de dentro dele e a receita da empresa diminui.',
}

function Segmentado({ rotulo, valor, onChange }: { rotulo: string; valor: Estrategia; onChange: (v: Estrategia) => void }) {
  const nome = useId()
  const opcoes: { v: Estrategia; t: string }[] = [
    { v: 'repassar', t: 'Repassar IBS/CBS no preço' },
    { v: 'absorver', t: 'Manter preço final (absorver)' },
  ]
  return (
    <fieldset className="estrategia">
      <legend>{rotulo}</legend>
      <div className="segmentado" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <label key={o.v} className={valor === o.v ? 'ativo' : ''}>
            <input type="radio" name={nome} checked={valor === o.v} onChange={() => onChange(o.v)} />
            <span>{o.t}</span>
          </label>
        ))}
      </div>
      <p className="apoio">{DESCRICAO[valor]}</p>
    </fieldset>
  )
}

export function AbaVendas({ entrada, r, atualizar }: Props) {
  const idSlider = useId()
  const b2b = entrada.faturamento * entrada.pctB2B
  const b2c = entrada.faturamento - b2b
  return (
    <div className="aba-corpo">
      <div className="grade c2">
        <CampoMoeda rotulo="Faturamento anual (preço praticado hoje)" valor={entrada.faturamento}
          onChange={(faturamento) => atualizar({ faturamento })} />
        <CampoMoeda rotulo="Despesas sem crédito (folha, pró-labore, encargos)" valor={entrada.despesas}
          onChange={(despesas) => atualizar({ despesas })} />
      </div>

      <Interruptor rotulo="Compras acompanham o faturamento" ligado={entrada.comprasAcompanham}
        onChange={(v) => atualizar({ comprasAcompanham: v, faturamentoRefCompras: entrada.faturamento })}
        ajuda={entrada.comprasAcompanham
          ? <>As compras lançadas valem para um faturamento de {brl(entrada.faturamentoRefCompras)}. Na simulação elas
            sobem ou descem na mesma proporção: hoje {brl(r.totalComprasLista)} viram <strong>{brl(r.totalCompras)}</strong>.</>
          : 'Desligado: as compras entram pelo valor lançado, mesmo que o faturamento mude.'} />

      {r.totalCompras > entrada.faturamento && (
        <Alerta>
          As compras ({brl(r.totalCompras)}) passam do faturamento ({brl(entrada.faturamento)}). A simulação fica fora da
          realidade e o crédito das compras pesa demais a favor do cenário por fora.
          {!entrada.comprasAcompanham && ' Ligue "Compras acompanham o faturamento" ou revise a lista na aba Compras.'}
        </Alerta>
      )}

      <div className="mix espaco">
        <div className="grade c3">
          <CampoPercentual rotulo="Vendas para empresas contribuintes (B2B)" valor={entrada.pctB2B}
            onChange={(v) => atualizar({ pctB2B: Math.min(1, Math.max(0, v ?? 0)) })} />
          <Caixa rotulo="Vendas B2B">{brl(b2b)}</Caixa>
          <Caixa rotulo="Vendas B2C (consumidor final)">{brl(b2c)}</Caixa>
        </div>
        <div className="slider">
          <label htmlFor={idSlider}>Proporção de vendas B2B</label>
          <input id={idSlider} type="range" min={0} max={100} step={1} value={Math.round(entrada.pctB2B * 100)}
            onChange={(e) => atualizar({ pctB2B: Number(e.target.value) / 100 })} />
        </div>
      </div>

      <section aria-labelledby="t-estrategia">
        <h3 id="t-estrategia">Estratégia de preço no cenário por fora</h3>
        <div className="estrategias">
          <Segmentado rotulo="Vendas B2B" valor={entrada.estrategiaB2B} onChange={(estrategiaB2B) => atualizar({ estrategiaB2B })} />
          <Segmentado rotulo="Vendas B2C" valor={entrada.estrategiaB2C} onChange={(estrategiaB2C) => atualizar({ estrategiaB2C })} />
        </div>
      </section>
    </div>
  )
}
