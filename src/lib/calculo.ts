import {
  ANOS, FRACAO_IBS_PADRAO, LIMITE_SIMPLES, SUBLIMITE, TABELAS,
  type Ano, type Anexo, type Partilha,
} from './tabelas'

export type TipoFornecedor = 'regular' | 'simples_fora' | 'simples_dentro' | 'nao_contribuinte'
export type Estrategia = 'repassar' | 'absorver'

export const TIPOS_FORNECEDOR: { id: TipoFornecedor; nome: string; dica: string }[] = [
  { id: 'regular', nome: 'Contribuinte do regime regular', dica: 'Destaca IBS/CBS cheio na nota' },
  { id: 'simples_fora', nome: 'Simples com IBS/CBS por fora', dica: 'Destaca IBS/CBS cheio na nota' },
  { id: 'simples_dentro', nome: 'Simples por dentro', dica: 'Crédito só do % que vier na nota' },
  { id: 'nao_contribuinte', nome: 'Não contribuinte / pessoa física', dica: 'Não gera crédito' },
]

export interface OrigemCompra {
  tipo: 'nfe' | 'planilha' | 'manual'
  chaves?: string[]
  cnpj?: string
  observacao?: string
}

export interface Compra {
  id: string
  fornecedor: string
  descricao: string
  tipo: TipoFornecedor
  geraCredito: boolean
  valor: number
  /** % de IBS/CBS informado na nota. Vazio = usa o padrão do tipo. */
  aliquotaNota: number | null
  /** De onde a compra veio (importação). Não entra em nenhum cálculo. */
  origem?: OrigemCompra
}

export interface Entrada {
  empresa: string
  cnpj: string
  ano: Ano
  rbt12: number
  /** false = RBT12 acompanha o faturamento anual; true = usa o valor digitado. */
  rbt12Manual: boolean
  anexo: Anexo
  faturamento: number
  pctB2B: number
  estrategiaB2B: Estrategia
  estrategiaB2C: Estrategia
  despesas: number
  /** Escala as compras na proporção faturamento / faturamentoRefCompras. */
  comprasAcompanham: boolean
  /** Faturamento que as compras lançadas representam. */
  faturamentoRefCompras: number
  cbsRef: number
  ibsRef: number
  pctSimplesDentroPadrao: number
  fracaoIbs: Record<Ano, number>
  compras: Compra[]
}

export interface Aliquotas {
  cbs: number
  ibs: number
  total: number
  /** Fração do ICMS/ISS original que ainda fica no DAS no ano. */
  icmsIssRemanescente: number
}

export interface Simples {
  faixa: number | null
  nominal: number
  deducao: number
  efetiva: number
  partilha: Partilha
  situacao: 'ok' | 'sublimite' | 'excede'
}

export interface Segmentos { b2b: number; b2c: number; total: number }

export interface CompraCalculada extends Compra { aliquotaAplicada: number; credito: number }

export interface Cenario1 {
  receita: Segmentos
  das: Segmentos
  composicaoDas: { nome: string; valor: number }[]
  compras: number
  despesas: number
  lucro: number
  margem: number
  preco: Segmentos
  pctCreditoCliente: number
  creditoGerado: Segmentos
  creditoAproveitado: Segmentos
  custoLiquidoCliente: Segmentos
}

export interface Cenario2 {
  receita: Segmentos
  aliquotaDas: number
  das: Segmentos
  ibsDebito: Segmentos
  cbsDebito: Segmentos
  preco: Segmentos
  /** Crédito usado no ano: limitado ao débito de cada tributo. */
  creditoIbs: number
  creditoCbs: number
  creditoTotal: number
  /** Crédito que passa do débito: fica para compensar depois, não entra no lucro do ano. */
  saldoCredor: number
  ibsRecolher: number
  cbsRecolher: number
  totalTributos: number
  compras: number
  despesas: number
  lucro: number
  margem: number
  pctCreditoCliente: number
  creditoGerado: Segmentos
  creditoAproveitado: Segmentos
  custoLiquidoCliente: Segmentos
}

export type Lado = 'dentro' | 'fora' | 'empate'

export interface Comparativo {
  melhorEmpresa: Lado
  difLucro: number
  difLucroPct: number
  variacaoPrecoB2B: number
  variacaoPrecoB2C: number
  receitaAbsorvidaB2C: number
  /** Quanto o preço B2B pode cair no "por fora" mantendo o lucro do "por dentro". */
  folgaPrecoB2B: number
  folgaPrecoB2BPct: number
  /** Redução necessária para o cliente B2B ter o mesmo custo líquido do "por dentro". */
  reducaoNecessariaB2B: number
  reducaoNecessariaB2BPct: number
  vantagemB2B: 'fora' | 'fora_com_ajuste' | 'dentro'
  vantagemB2C: Lado
}

export interface Resultado {
  ano: Ano
  /** RBT12 usado no cálculo (o digitado ou o faturamento). */
  rbt12: number
  aliquotas: Aliquotas
  simples: Simples
  /** Parcela do DAS que é CBS/IBS (vira crédito ao cliente no "por dentro"). */
  parcelaCbsIbsDas: number
  compras: CompraCalculada[]
  /** Soma da lista de compras, como lançada. */
  totalComprasLista: number
  totalCreditosLista: number
  /** Fator aplicado às compras para acompanhar o faturamento (1 = sem ajuste). */
  fatorCompras: number
  /** Compras e créditos usados na simulação (lista × fator). */
  totalCompras: number
  totalCreditos: number
  c1: Cenario1
  c2: Cenario2
  comp: Comparativo
}

const seg = (b2b: number, b2c: number): Segmentos => ({ b2b, b2c, total: b2b + b2c })
const ladoMaior = (dentro: number, fora: number): Lado =>
  Math.abs(fora - dentro) < 0.005 ? 'empate' : fora > dentro ? 'fora' : 'dentro'

export function aliquotasDoAno(e: Entrada, ano: Ano): Aliquotas {
  const teste = ano <= 2028
  const fr = e.fracaoIbs[ano] ?? FRACAO_IBS_PADRAO[ano]
  const cbs = e.cbsRef - (teste ? 0.001 : 0)
  const ibs = teste ? 0.001 : e.ibsRef * fr
  return { cbs, ibs, total: cbs + ibs, icmsIssRemanescente: teste ? 1 : 1 - fr }
}

export function calcularSimples(rbt12: number, anexo: Anexo): Simples {
  const tabela = TABELAS[anexo]
  const situacao = rbt12 > LIMITE_SIMPLES ? 'excede' : rbt12 > SUBLIMITE ? 'sublimite' : 'ok'
  const idx = situacao === 'excede' ? tabela.length - 1 : tabela.findIndex((f) => rbt12 <= f.ate)
  const f = tabela[idx]
  const efetiva = rbt12 > 0 ? (rbt12 * f.nominal - f.deducao) / rbt12 : 0
  return {
    faixa: situacao === 'excede' ? null : idx + 1,
    nominal: f.nominal,
    deducao: f.deducao,
    efetiva: Math.max(0, efetiva),
    partilha: f.partilha,
    situacao,
  }
}

export function calcularCompra(c: Compra, aliq: Aliquotas, pctSimplesDentro: number): CompraCalculada {
  const destacaCheio = c.tipo === 'regular' || c.tipo === 'simples_fora'
  const padrao = destacaCheio ? aliq.total : c.tipo === 'simples_dentro' ? pctSimplesDentro : 0
  const aliquotaAplicada = c.tipo === 'nao_contribuinte' ? 0 : c.aliquotaNota ?? padrao
  let credito = 0
  if (c.geraCredito && c.valor > 0 && aliquotaAplicada > 0) {
    // Regime regular: o valor pago já inclui o IBS/CBS destacado por fora.
    credito = destacaCheio ? (c.valor * aliquotaAplicada) / (1 + aliquotaAplicada) : c.valor * aliquotaAplicada
  }
  return { ...c, aliquotaAplicada, credito }
}

export function calcular(e: Entrada, ano: Ano = e.ano): Resultado {
  const aliq = aliquotasDoAno(e, ano)
  const rbt12 = e.rbt12Manual ? e.rbt12 : e.faturamento
  const s = calcularSimples(rbt12, e.anexo)
  const p = s.partilha
  const t = aliq.total

  const parcelaCbsIbsDas = p.cofins + p.pis + p.icmsIss * (1 - aliq.icmsIssRemanescente)
  const aliqDasFora = s.efetiva * (1 - parcelaCbsIbsDas)

  const compras = e.compras.map((c) => calcularCompra(c, aliq, e.pctSimplesDentroPadrao))
  const totalComprasLista = compras.reduce((a, c) => a + (c.valor || 0), 0)
  const totalCreditosLista = compras.reduce((a, c) => a + c.credito, 0)
  const fatorCompras = e.comprasAcompanham && e.faturamentoRefCompras > 0 ? e.faturamento / e.faturamentoRefCompras : 1
  const totalCompras = totalComprasLista * fatorCompras
  const totalCreditos = totalCreditosLista * fatorCompras

  const fatB2B = e.faturamento * e.pctB2B
  const fatB2C = e.faturamento - fatB2B

  // ---- Cenário 1: tudo dentro do DAS
  const r1 = seg(fatB2B, fatB2C)
  const das1 = seg(r1.b2b * s.efetiva, r1.b2c * s.efetiva)
  const lucro1 = r1.total - das1.total - totalCompras - e.despesas
  const pctCred1 = s.efetiva * parcelaCbsIbsDas
  const credGer1 = seg(r1.b2b * pctCred1, r1.b2c * pctCred1)
  const credAp1 = seg(credGer1.b2b, 0)
  const c1: Cenario1 = {
    receita: r1,
    das: das1,
    composicaoDas: [
      { nome: 'IRPJ', valor: das1.total * p.irpj },
      { nome: 'CSLL', valor: das1.total * p.csll },
      { nome: 'CBS (no lugar de PIS/Cofins)', valor: das1.total * (p.pis + p.cofins) },
      { nome: 'CPP (INSS patronal)', valor: das1.total * p.cpp },
      { nome: 'IPI', valor: das1.total * p.ipi },
      { nome: 'ICMS/ISS', valor: das1.total * p.icmsIss * aliq.icmsIssRemanescente },
      { nome: 'IBS (no lugar do ICMS/ISS)', valor: das1.total * p.icmsIss * (1 - aliq.icmsIssRemanescente) },
    ].filter((x) => x.valor > 0.005),
    compras: totalCompras,
    despesas: e.despesas,
    lucro: lucro1,
    margem: r1.total > 0 ? lucro1 / r1.total : 0,
    preco: r1,
    pctCreditoCliente: pctCred1,
    creditoGerado: credGer1,
    creditoAproveitado: credAp1,
    custoLiquidoCliente: seg(r1.b2b - credAp1.b2b, r1.b2c),
  }

  // ---- Cenário 2: IBS/CBS por fora
  const base = (fat: number, est: Estrategia) => (est === 'absorver' ? fat / (1 + t) : fat)
  const r2 = seg(base(fatB2B, e.estrategiaB2B), base(fatB2C, e.estrategiaB2C))
  const das2 = seg(r2.b2b * aliqDasFora, r2.b2c * aliqDasFora)
  const ibsDeb = seg(r2.b2b * aliq.ibs, r2.b2c * aliq.ibs)
  const cbsDeb = seg(r2.b2b * aliq.cbs, r2.b2c * aliq.cbs)
  const preco2 = seg(r2.b2b + ibsDeb.b2b + cbsDeb.b2b, r2.b2c + ibsDeb.b2c + cbsDeb.b2c)
  // IBS e CBS são tributos separados: o crédito de um não abate o débito do outro.
  // O que passa do débito vira saldo credor para compensar depois, não dinheiro no ano.
  const creditoIbs = Math.min(t > 0 ? (totalCreditos * aliq.ibs) / t : 0, ibsDeb.total)
  const creditoCbs = Math.min(t > 0 ? (totalCreditos * aliq.cbs) / t : 0, cbsDeb.total)
  const saldoCredor = totalCreditos - creditoIbs - creditoCbs
  const ibsRecolher = ibsDeb.total - creditoIbs
  const cbsRecolher = cbsDeb.total - creditoCbs
  const totalTributos = das2.total + ibsRecolher + cbsRecolher
  const lucro2 = preco2.total - totalTributos - totalCompras - e.despesas
  const credGer2 = seg(ibsDeb.b2b + cbsDeb.b2b, ibsDeb.b2c + cbsDeb.b2c)
  const credAp2 = seg(credGer2.b2b, 0)
  const c2: Cenario2 = {
    receita: r2,
    aliquotaDas: aliqDasFora,
    das: das2,
    ibsDebito: ibsDeb,
    cbsDebito: cbsDeb,
    preco: preco2,
    creditoIbs,
    creditoCbs,
    creditoTotal: creditoIbs + creditoCbs,
    saldoCredor,
    ibsRecolher,
    cbsRecolher,
    totalTributos,
    compras: totalCompras,
    despesas: e.despesas,
    lucro: lucro2,
    margem: r2.total > 0 ? lucro2 / r2.total : 0,
    pctCreditoCliente: t / (1 + t),
    creditoGerado: credGer2,
    creditoAproveitado: credAp2,
    custoLiquidoCliente: seg(preco2.b2b - credAp2.b2b, preco2.b2c),
  }

  // ---- Comparativo
  const difLucro = lucro2 - lucro1
  const folga = 1 - aliqDasFora > 0 ? difLucro / (1 - aliqDasFora) : 0
  const reducao = Math.max(0, c2.custoLiquidoCliente.b2b - c1.custoLiquidoCliente.b2b)
  const vantagemB2B =
    c2.custoLiquidoCliente.b2b <= c1.custoLiquidoCliente.b2b ? 'fora'
      : folga >= reducao ? 'fora_com_ajuste' : 'dentro'
  const comp: Comparativo = {
    melhorEmpresa: ladoMaior(lucro1, lucro2),
    difLucro,
    difLucroPct: lucro1 !== 0 ? difLucro / Math.abs(lucro1) : 0,
    variacaoPrecoB2B: c1.preco.b2b > 0 ? c2.preco.b2b / c1.preco.b2b - 1 : 0,
    variacaoPrecoB2C: c1.preco.b2c > 0 ? c2.preco.b2c / c1.preco.b2c - 1 : 0,
    receitaAbsorvidaB2C: r1.b2c - r2.b2c,
    folgaPrecoB2B: folga,
    folgaPrecoB2BPct: r2.b2b > 0 ? folga / r2.b2b : 0,
    reducaoNecessariaB2B: reducao,
    reducaoNecessariaB2BPct: r2.b2b > 0 ? reducao / r2.b2b : 0,
    vantagemB2B,
    // Para o consumidor, menor preço é melhor: inverte o sinal.
    vantagemB2C: ladoMaior(-c1.preco.b2c, -c2.preco.b2c),
  }

  return {
    ano, rbt12, aliquotas: aliq, simples: s, parcelaCbsIbsDas, compras,
    totalComprasLista, totalCreditosLista, fatorCompras, totalCompras, totalCreditos, c1, c2, comp,
  }
}

/** Mesma simulação para cada ano da transição. */
export function calcularTransicao(e: Entrada) {
  return ANOS.map((ano) => {
    const r = calcular(e, ano)
    return { ano, lucroDentro: r.c1.lucro, lucroFora: r.c2.lucro, dif: r.comp.difLucro }
  })
}

let seq = 0
export const novoId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

export function entradaExemplo(): Entrada {
  const c = (fornecedor: string, descricao: string, tipo: TipoFornecedor, geraCredito: boolean, valor: number): Compra =>
    ({ id: novoId(), fornecedor, descricao, tipo, geraCredito, valor, aliquotaNota: null })
  return {
    empresa: 'Empresa Exemplo Ltda',
    cnpj: '',
    ano: 2027,
    rbt12: 1_200_000,
    rbt12Manual: false,
    anexo: 'I',
    faturamento: 1_200_000,
    pctB2B: 0.7,
    estrategiaB2B: 'repassar',
    estrategiaB2C: 'absorver',
    despesas: 90_000,
    comprasAcompanham: true,
    faturamentoRefCompras: 1_200_000,
    cbsRef: 0.088,
    ibsRef: 0.177,
    pctSimplesDentroPadrao: 0.013,
    fracaoIbs: { ...FRACAO_IBS_PADRAO },
    compras: [
      c('Distribuidora Alfa Ltda', 'Mercadoria para revenda', 'regular', true, 420_000),
      c('Indústria Beta S.A.', 'Mercadoria para revenda', 'regular', true, 180_000),
      c('Comercial Gama ME', 'Mercadoria para revenda', 'simples_dentro', true, 150_000),
      c('Concessionária de energia', 'Energia elétrica', 'regular', true, 36_000),
      c('Transportadora Delta', 'Frete', 'simples_fora', true, 30_000),
      c('Locador pessoa física', 'Aluguel do imóvel', 'nao_contribuinte', false, 48_000),
      c('Supermercado', 'Itens de uso pessoal dos sócios', 'regular', false, 5_000),
    ],
  }
}
