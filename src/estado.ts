import { useCallback, useEffect, useState } from 'react'
import { ANOS, FRACAO_IBS_PADRAO, TABELAS, type Ano } from './lib/tabelas'
import { entradaExemplo, novoId, type Compra, type Entrada, type OrigemCompra } from './lib/calculo'

const CHAVE_ANTIGA = 'simulador-ibs-cbs:v1'
const chaveDe = (usuarioId: number) => `${CHAVE_ANTIGA}:${usuarioId}`
const TIPOS = ['regular', 'simples_fora', 'simples_dentro', 'nao_contribuinte']

const num = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao)

function validarOrigem(v: unknown): OrigemCompra | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (o.tipo !== 'nfe' && o.tipo !== 'planilha' && o.tipo !== 'manual') return undefined
  const r: OrigemCompra = { tipo: o.tipo }
  if (Array.isArray(o.chaves)) r.chaves = o.chaves.filter((x): x is string => typeof x === 'string')
  if (typeof o.cnpj === 'string') r.cnpj = o.cnpj
  if (typeof o.observacao === 'string') r.observacao = o.observacao
  return r
}

/** Valida os campos mínimos e completa o resto com o exemplo. */
export function validarEntrada(obj: unknown): { entrada: Entrada } | { erro: string } {
  if (!obj || typeof obj !== 'object') return { erro: 'O arquivo não contém uma simulação.' }
  const o = obj as Record<string, unknown>
  if (typeof o.rbt12 !== 'number' || !Number.isFinite(o.rbt12)) return { erro: 'Campo "rbt12" ausente ou inválido.' }
  if (typeof o.anexo !== 'string' || !(o.anexo in TABELAS)) return { erro: 'Campo "anexo" ausente ou inválido (use I, II, III, IV ou V).' }
  if (!(ANOS as readonly number[]).includes(o.ano as number)) return { erro: 'Campo "ano" ausente ou fora de 2027–2033.' }
  if (!Array.isArray(o.compras)) return { erro: 'Campo "compras" ausente: deveria ser uma lista.' }
  if (typeof o.faturamento !== 'number') return { erro: 'Campo "faturamento" ausente ou inválido.' }
  const base = entradaExemplo()
  const compras: Compra[] = []
  for (const c of o.compras as Record<string, unknown>[]) {
    if (!c || typeof c !== 'object' || typeof c.valor !== 'number' || !TIPOS.includes(c.tipo as string)) {
      return { erro: 'Há uma compra com valor ou tipo de fornecedor inválido.' }
    }
    const origem = validarOrigem(c.origem)
    compras.push({
      id: typeof c.id === 'string' ? c.id : novoId(),
      fornecedor: String(c.fornecedor ?? ''),
      descricao: String(c.descricao ?? ''),
      tipo: c.tipo as Compra['tipo'],
      geraCredito: c.geraCredito !== false,
      valor: c.valor,
      aliquotaNota: typeof c.aliquotaNota === 'number' ? c.aliquotaNota : null,
      ...(origem ? { origem } : {}),
    })
  }
  const fr = (o.fracaoIbs && typeof o.fracaoIbs === 'object' ? o.fracaoIbs : {}) as Record<string, unknown>
  const fracaoIbs = { ...FRACAO_IBS_PADRAO }
  for (const a of ANOS) fracaoIbs[a] = num(fr[a], FRACAO_IBS_PADRAO[a])
  const entrada: Entrada = {
    empresa: String(o.empresa ?? ''),
    cnpj: String(o.cnpj ?? ''),
    ano: o.ano as Ano,
    rbt12: o.rbt12,
    // Simulações antigas não têm o campo: se o RBT12 digitado difere do faturamento, respeita o digitado.
    rbt12Manual: typeof o.rbt12Manual === 'boolean' ? o.rbt12Manual : o.rbt12 !== o.faturamento,
    anexo: o.anexo as Entrada['anexo'],
    faturamento: o.faturamento,
    pctB2B: Math.min(1, Math.max(0, num(o.pctB2B, base.pctB2B))),
    estrategiaB2B: o.estrategiaB2B === 'absorver' ? 'absorver' : 'repassar',
    estrategiaB2C: o.estrategiaB2C === 'repassar' ? 'repassar' : 'absorver',
    despesas: num(o.despesas, 0),
    comprasAcompanham: o.comprasAcompanham === true,
    faturamentoRefCompras: num(o.faturamentoRefCompras, o.faturamento),
    cbsRef: num(o.cbsRef, base.cbsRef),
    ibsRef: num(o.ibsRef, base.ibsRef),
    pctSimplesDentroPadrao: num(o.pctSimplesDentroPadrao, base.pctSimplesDentroPadrao),
    fracaoIbs,
    compras,
  }
  return { entrada }
}

/** Lê a simulação do usuário. Se existir a chave antiga (sem id), ela é migrada uma única vez para o primeiro usuário que entrar neste navegador. */
function carregar(usuarioId: number): Entrada {
  try {
    const chave = chaveDe(usuarioId)
    let bruto = localStorage.getItem(chave)
    if (bruto === null) {
      const antigo = localStorage.getItem(CHAVE_ANTIGA)
      if (antigo !== null) {
        localStorage.setItem(chave, antigo)
        localStorage.removeItem(CHAVE_ANTIGA)
        bruto = antigo
      }
    }
    if (bruto) {
      const r = validarEntrada(JSON.parse(bruto))
      if ('entrada' in r) return r.entrada
    }
  } catch { /* usa o exemplo */ }
  return entradaExemplo()
}

export function useSimulacao(usuarioId: number) {
  const [entrada, setEntrada] = useState<Entrada>(() => carregar(usuarioId))

  useEffect(() => {
    try { localStorage.setItem(chaveDe(usuarioId), JSON.stringify(entrada)) } catch { /* sem armazenamento */ }
  }, [entrada, usuarioId])

  const atualizar = useCallback((parcial: Partial<Entrada>) => setEntrada((e) => ({ ...e, ...parcial })), [])
  const restaurar = useCallback(() => setEntrada(entradaExemplo()), [])
  return { entrada, setEntrada, atualizar, restaurar }
}
