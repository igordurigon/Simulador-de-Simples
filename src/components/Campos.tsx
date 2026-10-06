import { useId, useState, type ReactNode } from 'react'
import { brl, lerNumero, paraEdicao, pct } from '../format'
import type { Lado } from '../lib/calculo'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

/** Ponto na cor do cenário. Decorativo: o nome do lado sempre vem em texto. */
export function Ponto({ lado }: { lado: Lado }) {
  return <span className={`ponto ${lado}`} aria-hidden="true" />
}

export const NOME_LADO: Record<Lado, string> = { dentro: 'Por dentro', fora: 'Por fora', empate: 'Empate' }

/** Caixa calculada: rótulo pequeno no canto, valor embaixo. */
export function Caixa({ rotulo, children, destaque, nota, className }: {
  rotulo: string
  children: ReactNode
  destaque?: boolean
  nota?: string
  className?: string
}) {
  return (
    <div className={cx('caixa', destaque && 'destaque', className)}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{children}</span>
      {nota && <span className="nota-caixa">{nota}</span>}
    </div>
  )
}

interface BaseNumero {
  rotulo: string
  semRotulo?: boolean
  valor: number | null
  onChange: (v: number | null) => void
  formatar: (n: number) => string
  editar: (n: number) => string
  parse: (s: string) => number | null
  placeholder?: string
  disabled?: boolean
  className?: string
  ajuda?: string
}

function CampoNumero(p: BaseNumero) {
  const id = useId()
  const [txt, setTxt] = useState<string | null>(null)
  const mostrado = txt ?? (p.valor === null ? '' : p.formatar(p.valor))
  return (
    <label className={cx('caixa', 'campo', p.semRotulo && 'sem-rotulo', p.disabled && 'desativado', p.className)} htmlFor={id}>
      {!p.semRotulo && <span className="rotulo">{p.rotulo}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="valor"
        value={mostrado}
        placeholder={p.placeholder}
        disabled={p.disabled}
        aria-label={p.semRotulo ? p.rotulo : undefined}
        aria-describedby={p.ajuda ? id + 'a' : undefined}
        onFocus={(e) => {
          const el = e.currentTarget
          setTxt(p.valor === null ? '' : p.editar(p.valor))
          requestAnimationFrame(() => el.select())
        }}
        onChange={(e) => {
          setTxt(e.target.value)
          const n = p.parse(e.target.value)
          if (n !== null) p.onChange(n)
          else if (e.target.value.trim() === '') p.onChange(null)
        }}
        onBlur={() => setTxt(null)}
      />
      {p.ajuda && <span id={id + 'a'} className="nota-caixa">{p.ajuda}</span>}
    </label>
  )
}

/** Valor em reais: digita 1.234,56; exibe R$ 1.234,56 ao sair. */
export function CampoMoeda(p: {
  rotulo: string
  valor: number
  onChange: (v: number) => void
  semRotulo?: boolean
  className?: string
  ajuda?: string
  disabled?: boolean
}) {
  return (
    <CampoNumero
      {...p}
      onChange={(v) => p.onChange(v ?? 0)}
      formatar={brl}
      editar={(n) => (n === 0 ? '' : paraEdicao(n))}
      parse={lerNumero}
      placeholder="R$ 0,00"
    />
  )
}

/** Percentual: digita 8,8 e o estado guarda 0,088. */
export function CampoPercentual(p: {
  rotulo: string
  valor: number | null
  onChange: (v: number | null) => void
  semRotulo?: boolean
  anulavel?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  ajuda?: string
}) {
  const { anulavel, ...resto } = p
  return (
    <CampoNumero
      {...resto}
      onChange={(v) => {
        if (v === null) p.onChange(anulavel ? null : 0)
        else p.onChange(Number((v / 100).toPrecision(12)))
      }}
      formatar={(n) => pct(n, 2).replace(/,00%$/, '%').replace(/(,\d)0%$/, '$1%')}
      editar={(n) => paraEdicao(n, 100)}
      parse={lerNumero}
    />
  )
}

export function CampoTexto({ rotulo, valor, onChange, className, placeholder, maxLength, inputMode }: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  maxLength?: number
  inputMode?: 'text' | 'numeric'
}) {
  const id = useId()
  return (
    <label className={cx('caixa', 'campo', className)} htmlFor={id}>
      <span className="rotulo">{rotulo}</span>
      <input id={id} type="text" className="valor" value={valor} placeholder={placeholder} maxLength={maxLength}
        inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function CampoSelect<T extends string | number>({ rotulo, valor, onChange, opcoes, className, semRotulo }: {
  rotulo: string
  valor: T
  onChange: (v: T) => void
  opcoes: { valor: T; nome: string }[]
  className?: string
  semRotulo?: boolean
}) {
  const id = useId()
  return (
    <label className={cx('caixa', 'campo', semRotulo && 'sem-rotulo', className)} htmlFor={id}>
      {!semRotulo && <span className="rotulo">{rotulo}</span>}
      <select
        id={id}
        className="valor"
        value={String(valor)}
        aria-label={semRotulo ? rotulo : undefined}
        onChange={(e) => {
          const o = opcoes.find((x) => String(x.valor) === e.target.value)
          if (o) onChange(o.valor)
        }}
      >
        {opcoes.map((o) => <option key={String(o.valor)} value={String(o.valor)}>{o.nome}</option>)}
      </select>
    </label>
  )
}

/** Liga/desliga com texto ao lado. */
export function Interruptor({ rotulo, ligado, onChange, ajuda }: {
  rotulo: string
  ligado: boolean
  onChange: (v: boolean) => void
  ajuda?: ReactNode
}) {
  return (
    <div className="interruptor">
      <label>
        <input type="checkbox" className="toggle" role="switch" checked={ligado} onChange={(e) => onChange(e.target.checked)} />
        <span>{rotulo}</span>
      </label>
      {ajuda && <p className="apoio">{ajuda}</p>}
    </div>
  )
}

/** Ícone de alerta: sempre acompanhado de texto. */
export function Alerta({ children }: { children: ReactNode }) {
  return (
    <div className="alerta" role="note">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M9 2 17 16H1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 7v4.2M9 13v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <p>{children}</p>
    </div>
  )
}
