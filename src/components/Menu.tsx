import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ItemMenu {
  texto: string
  onClick: () => void
  perigo?: boolean
  oculto?: boolean
}

/** Botão que abre uma lista de ações. A lista usa posição fixa para não ser cortada por áreas com rolagem. */
export function Menu({ rotulo, ariaLabel, itens, className }: {
  rotulo: ReactNode
  ariaLabel: string
  itens: ItemMenu[]
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const id = useId()
  const visiveis = itens.filter((i) => !i.oculto)

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return
    const r = botao.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const fechar = () => setAberto(false)
    const fora = (e: MouseEvent) => {
      const t = e.target as Node
      if (!lista.current?.contains(t) && !botao.current?.contains(t)) fechar()
    }
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { fechar(); botao.current?.focus() }
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', fechar)
    window.addEventListener('scroll', fechar, true)
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus())
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [aberto])

  const navegar = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = Array.from(lista.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length]?.focus()
  }

  return (
    <>
      <button ref={botao} type="button" className={className ?? 'botao ghost'} aria-haspopup="menu" aria-expanded={aberto}
        aria-controls={aberto ? id : undefined} aria-label={ariaLabel} onClick={() => setAberto((a) => !a)}>
        {rotulo}
      </button>
      {aberto && pos && (
        <ul ref={lista} id={id} role="menu" className="menu-lista" style={{ top: pos.top, right: pos.right }} onKeyDown={navegar}>
          {visiveis.map((i) => (
            <li key={i.texto} role="none">
              <button type="button" role="menuitem" className={i.perigo ? 'perigo' : undefined}
                onClick={() => { setAberto(false); i.onClick() }}>{i.texto}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
