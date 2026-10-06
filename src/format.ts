const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moeda0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 })
const num1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

const casasFmt = new Map<number, Intl.NumberFormat>()
function nf(casas: number) {
  let f = casasFmt.get(casas)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    casasFmt.set(casas, f)
  }
  return f
}

/** R$ 1.234,56 — negativo como −R$ 1.234,56. */
export function brl(n: number): string {
  if (Math.round(Math.abs(n) * 100) === 0) return moeda.format(0)
  return (n < 0 ? '−' : '') + moeda.format(Math.abs(n))
}

/** Sem centavos: R$ 45.286. */
export function brl0(n: number): string {
  if (Math.round(Math.abs(n)) === 0) return moeda0.format(0)
  return (n < 0 ? '−' : '') + moeda0.format(Math.abs(n))
}

export function pct(n: number, casas = 2): string {
  const v = n * 100
  return (Math.round(Math.abs(v) * 10 ** casas) === 0 ? '' : v < 0 ? '−' : '') + nf(casas).format(Math.abs(v)) + '%'
}

/** Diferença em pontos percentuais. */
export function pp(n: number): string {
  const v = n * 100
  const s = nf(2).format(Math.abs(v)) + ' p.p.'
  return Math.round(Math.abs(v) * 100) === 0 ? s : (v < 0 ? '−' : '+') + s
}

export function sinalBrl(n: number): string {
  return n > 0.004 ? '+' + brl(n) : brl(n)
}

export function sinalPct(n: number, casas = 2): string {
  return n > 0 && Math.round(n * 100 * 10 ** casas) > 0 ? '+' + pct(n, casas) : pct(n, casas)
}

/** Valor curto de eixo: R$ 50 mil, R$ 1,5 mi. */
export function brlEixo(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `R$ ${num1.format(a / 1e6)} mi` : a >= 1000 ? `R$ ${num1.format(a / 1000)} mil` : `R$ ${num1.format(a)}`
  return v < 0 ? '−' + s : s
}

/** Lê "R$ 1.234,56", "1234,56", "1.234", "8,8%" etc. Devolve null se vazio/inválido. */
export function lerNumero(txt: string): number | null {
  let s = txt.replace(/R\$|%|\s| /g, '').replace(/−/g, '-')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Valor para edição: sem símbolo, vírgula decimal. */
export function paraEdicao(n: number, fator = 1): string {
  return String(Number((n * fator).toPrecision(12))).replace('.', ',')
}

export function mascaraCnpj(txt: string): string {
  const d = txt.replace(/\D/g, '').slice(0, 14)
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`
  return d
}
