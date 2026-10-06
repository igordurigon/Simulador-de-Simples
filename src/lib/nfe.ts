import { mascaraCnpj } from '../format'
import { novoId, type Compra, type TipoFornecedor } from './calculo'
import type { Ignorado, Previa } from './importacao'

export interface Parte {
  /** CNPJ ou CPF, só dígitos. */
  doc: string
  ehCpf: boolean
  nome: string
}

export interface NotaNfe {
  chave: string
  modelo: string
  tpNF: string
  finNFe: string
  /** AAAA-MM-DD, ou '' se a nota não tiver data. */
  emissao: string
  emit: Parte & { crt: number | null }
  dest: Parte
  vNF: number
  /** Só existe quando a nota traz o grupo IBSCBSTot. */
  vIBS: number
  vCBS: number
  temIBSCBS: boolean
}

export type LeituraXml =
  | { tipo: 'nota'; nota: NotaNfe }
  | { tipo: 'cancelamento'; chave: string }
  | { tipo: 'descarte'; motivo: 'arquivo não é NF-e' | 'arquivo ilegível' | 'evento que não é cancelamento' }

const vazio = (el: Element | undefined | null) => (el ? (el.textContent ?? '').trim() : '')

function primeiro(raiz: Element | Document, nome: string): Element | null {
  return raiz.getElementsByTagName(nome)[0] ?? null
}
function texto(raiz: Element | Document | null, nome: string): string {
  return raiz ? vazio(primeiro(raiz, nome)) : ''
}
function numero(raiz: Element | null, nome: string): number {
  const n = Number(texto(raiz, nome))
  return Number.isFinite(n) ? n : 0
}

function parte(el: Element | null): Parte {
  const cnpj = texto(el, 'CNPJ')
  const cpf = texto(el, 'CPF')
  const doc = (cnpj || cpf || texto(el, 'idEstrangeiro')).replace(/\D/g, '')
  return { doc, ehCpf: !cnpj && !!cpf, nome: texto(el, 'xNome') }
}

/** Lê um XML (NF-e, NFC-e ou evento de cancelamento). Função pura: só recebe o texto. */
export function lerXml(xml: string): LeituraXml {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return { tipo: 'descarte', motivo: 'arquivo ilegível' }
  }
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) {
    return { tipo: 'descarte', motivo: 'arquivo ilegível' }
  }

  const infEvento = primeiro(doc, 'infEvento')
  if (infEvento) {
    if (texto(infEvento, 'tpEvento') === '110111') {
      const chave = texto(infEvento, 'chNFe')
      if (chave) return { tipo: 'cancelamento', chave }
    }
    return { tipo: 'descarte', motivo: 'evento que não é cancelamento' }
  }

  const inf = primeiro(doc, 'infNFe')
  if (!inf) return { tipo: 'descarte', motivo: 'arquivo não é NF-e' }

  const id = inf.getAttribute('Id') ?? ''
  const chave = id.replace(/^NFe/, '') || texto(primeiro(doc, 'protNFe'), 'chNFe')
  const ide = primeiro(inf, 'ide')
  const modelo = texto(ide, 'mod')
  if (!chave || (modelo !== '55' && modelo !== '65')) return { tipo: 'descarte', motivo: 'arquivo não é NF-e' }

  const emitEl = primeiro(inf, 'emit')
  const crtTxt = texto(emitEl, 'CRT')
  const dh = texto(ide, 'dhEmi') || texto(ide, 'dEmi')
  const ibscbs = primeiro(inf, 'IBSCBSTot')

  return {
    tipo: 'nota',
    nota: {
      chave,
      modelo,
      tpNF: texto(ide, 'tpNF'),
      finNFe: texto(ide, 'finNFe'),
      emissao: /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : '',
      emit: { ...parte(emitEl), crt: crtTxt ? Number(crtTxt) : null },
      dest: parte(primeiro(inf, 'dest')),
      vNF: numero(primeiro(inf, 'ICMSTot'), 'vNF'),
      vIBS: ibscbs ? numero(ibscbs, 'vIBS') : 0,
      vCBS: ibscbs ? numero(ibscbs, 'vCBS') : 0,
      temIBSCBS: !!ibscbs,
    },
  }
}

export interface ArquivoLido { arquivo: string; leitura: LeituraXml }

export interface OpcoesConsolidacao {
  /** CNPJ da empresa (qualquer formatação). Vazio = inferir do destinatário mais frequente. */
  cnpjEmpresa: string
  /** Chaves de notas já presentes em compras existentes. */
  chavesExistentes: Iterable<string>
}

const raiz = (doc: string) => doc.slice(0, 8)
const fmtDoc = (p: Parte) => (p.ehCpf || p.doc.length === 11
  ? `CPF ${p.doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}`
  : `CNPJ ${mascaraCnpj(p.doc)}`)
const dataBr = (iso: string) => iso.split('-').reverse().join('/')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** CNPJ da matriz (0001) a partir da raiz de 8 dígitos, com dígitos verificadores. */
export function cnpjMatriz(raiz8: string): string {
  const base = (raiz8 + '0001').split('').map(Number)
  const dv = (d: number[]) => {
    const pesos = d.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = d.reduce((a, n, i) => a + n * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(base)
  const d2 = dv([...base, d1])
  return [...base, d1, d2].join('')
}
const arred = (n: number) => Math.round(n * 100) / 100

interface Item { nota: NotaNfe; contraparte: Parte; entradaPropria: boolean }

/** Classifica o fornecedor pelo CRT do emitente (e, se houver, pelo IBS/CBS destacado). */
function classificar(itens: Item[], recente: Item): { tipo: TipoFornecedor; aliquotaNota: number | null; aviso?: string } {
  if (recente.entradaPropria) return { tipo: 'nao_contribuinte', aliquotaNota: null }
  const e = recente.nota.emit
  if (e.ehCpf || e.doc.length === 11 || e.crt === 4) return { tipo: 'nao_contribuinte', aliquotaNota: null }
  if (e.crt === 3) return { tipo: 'regular', aliquotaNota: null }
  if (e.crt === 1 || e.crt === 2) {
    const com = itens.filter((i) => i.nota.emissao >= '2027-01-01' && i.nota.vIBS + i.nota.vCBS > 0 && i.nota.vNF > 0)
    if (com.length) {
      const trib = com.reduce((a, i) => a + i.nota.vIBS + i.nota.vCBS, 0)
      const base = com.reduce((a, i) => a + i.nota.vNF, 0)
      const pct = trib / base
      if (pct >= 0.05) return { tipo: 'simples_fora', aliquotaNota: null }
      return { tipo: 'simples_dentro', aliquotaNota: Number(pct.toPrecision(6)) }
    }
    return { tipo: 'simples_dentro', aliquotaNota: null }
  }
  return { tipo: 'regular', aliquotaNota: null, aviso: 'Nota sem CRT do emitente; entrou como regime regular.' }
}

/** Junta todas as leituras (notas e eventos) numa prévia de compras agrupadas por fornecedor. */
export function consolidarNotas(lidos: ArquivoLido[], opcoes: OpcoesConsolidacao): Previa {
  const existentes = new Set(opcoes.chavesExistentes)
  const ignorados: Ignorado[] = []
  const alertas: string[] = []
  const resumo: string[] = []

  const canceladas = new Set<string>()
  const notas: { arquivo: string; nota: NotaNfe }[] = []
  for (const { arquivo, leitura } of lidos) {
    if (leitura.tipo === 'cancelamento') canceladas.add(leitura.chave)
    else if (leitura.tipo === 'nota') notas.push({ arquivo, nota: leitura.nota })
    else ignorados.push({ motivo: leitura.motivo === 'evento que não é cancelamento' ? 'evento que não é cancelamento' : leitura.motivo, detalhe: arquivo })
  }

  // Empresa: raiz do CNPJ informado ou o destinatário mais frequente.
  let empresa = opcoes.cnpjEmpresa.replace(/\D/g, '')
  let inferida = false
  if (empresa.length < 14) {
    const freq = new Map<string, { n: number; doc: string }>()
    for (const { nota } of notas) {
      if (nota.dest.doc.length !== 14) continue
      const k = raiz(nota.dest.doc)
      const f = freq.get(k) ?? { n: 0, doc: nota.dest.doc }
      f.n++
      freq.set(k, f)
    }
    const top = [...freq.entries()].sort((a, b) => b[1].n - a[1].n)[0]
    empresa = top ? top[1].doc : ''
    inferida = !!top
  }
  const empRaiz = empresa.length >= 14 ? raiz(empresa) : ''
  const matriz = inferida ? cnpjMatriz(empRaiz) : ''

  const vistas = new Set<string>()
  const itens: Item[] = []
  for (const { arquivo, nota } of notas) {
    const det = `${arquivo} (nota ${nota.chave.slice(25, 34).replace(/^0+/, '') || nota.chave})`
    if (vistas.has(nota.chave) || existentes.has(nota.chave)) { ignorados.push({ motivo: 'nota já importada', detalhe: det }); continue }
    vistas.add(nota.chave)
    if (canceladas.has(nota.chave)) { ignorados.push({ motivo: 'cancelada', detalhe: det }); continue }
    if (nota.finNFe === '4') { ignorados.push({ motivo: 'devolução', detalhe: det }); continue }
    const emitEmp = !!empRaiz && nota.emit.doc.length === 14 && raiz(nota.emit.doc) === empRaiz
    const destEmp = !!empRaiz && nota.dest.doc.length === 14 && raiz(nota.dest.doc) === empRaiz
    if (emitEmp && destEmp) { ignorados.push({ motivo: 'transferência entre filiais', detalhe: det }); continue }
    if (destEmp) { itens.push({ nota, contraparte: nota.emit, entradaPropria: false }); continue }
    if (emitEmp) {
      if (nota.tpNF === '0') itens.push({ nota, contraparte: nota.dest, entradaPropria: true })
      else ignorados.push({ motivo: 'venda da própria empresa', detalhe: det })
      continue
    }
    ignorados.push({ motivo: 'destinatário é outra empresa', detalhe: det })
  }

  // Agrupa por fornecedor (documento da contraparte).
  const grupos = new Map<string, Item[]>()
  for (const it of itens) {
    const k = `${it.entradaPropria ? 'e' : 'n'}:${it.contraparte.doc}`
    grupos.set(k, [...(grupos.get(k) ?? []), it])
  }

  const compras: Compra[] = []
  const avisosPorCompra: Record<string, string[]> = {}
  for (const g of grupos.values()) {
    const ord = [...g].sort((a, b) => a.nota.emissao.localeCompare(b.nota.emissao))
    const recente = ord[ord.length - 1]
    const cl = classificar(g, recente)
    const c: Compra = {
      id: novoId(),
      fornecedor: recente.contraparte.nome || fmtDoc(recente.contraparte),
      descricao: `${g.length} ${g.length === 1 ? 'nota' : 'notas'} NF-e · ${fmtDoc(recente.contraparte)}`,
      tipo: cl.tipo,
      geraCredito: cl.tipo !== 'nao_contribuinte',
      valor: arred(g.reduce((a, i) => a + i.nota.vNF, 0)),
      aliquotaNota: cl.aliquotaNota,
      origem: {
        tipo: 'nfe',
        chaves: g.map((i) => i.nota.chave),
        cnpj: recente.contraparte.doc,
        ...(recente.entradaPropria ? { observacao: 'nota de entrada própria — revisar' } : {}),
      },
    }
    const av: string[] = []
    if (cl.aviso) av.push(cl.aviso)
    if (recente.entradaPropria) av.push('Nota de entrada própria: confira o tipo e se a compra gera crédito.')
    const crts = new Set(g.map((i) => (i.entradaPropria ? 'e' : i.nota.emit.crt ?? 'x')))
    if (crts.size > 1) av.push('Notas com regimes (CRT) diferentes; usei o da nota mais recente.')
    if (cl.aliquotaNota !== null) av.push(`IBS/CBS destacado nas notas: ${(cl.aliquotaNota * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do valor.`)
    if (cl.tipo === 'simples_fora') av.push('IBS/CBS destacado nas notas passa de 5% do valor; tratei como Simples com IBS/CBS por fora.')
    if (av.length) avisosPorCompra[c.id] = av
    compras.push(c)
  }
  compras.sort((a, b) => b.valor - a.valor)

  const incluidas = itens.length
  const total = compras.reduce((a, c) => a + c.valor, 0)
  const datas = itens.map((i) => i.nota.emissao).filter(Boolean).sort()
  resumo.push(`${incluidas} ${incluidas === 1 ? 'nota incluída' : 'notas incluídas'}, de ${compras.length} ${compras.length === 1 ? 'fornecedor' : 'fornecedores'}, somando ${brl(total)}.`)
  if (datas.length) {
    const [d0, d1] = [datas[0], datas[datas.length - 1]]
    resumo.push(`Período das notas: ${dataBr(d0)} a ${dataBr(d1)}.`)
    const meses = (Number(d1.slice(0, 4)) - Number(d0.slice(0, 4))) * 12 + Number(d1.slice(5, 7)) - Number(d0.slice(5, 7)) + 1
    if (meses < 12) alertas.push(`As notas cobrem ${meses} ${meses === 1 ? 'mês' : 'meses'}; o simulador trata o valor como anual.`)
  }
  if (inferida) resumo.push(`Considerei como sua empresa o CNPJ ${mascaraCnpj(matriz)} (destinatário mais frequente).`)
  else if (empRaiz) resumo.push(`Empresa identificada pela raiz do CNPJ ${empRaiz.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2.$3')}; filiais entram.`)
  else alertas.push('Não consegui identificar a empresa: informe o CNPJ na aba Empresa e importe de novo.')

  return {
    fonte: 'nfe',
    titulo: 'XML de notas fiscais',
    compras,
    avisosPorCompra,
    ignorados,
    resumo,
    alertas,
    cnpjSugerido: inferida ? mascaraCnpj(matriz) : undefined,
    refazer: (substituindo) => consolidarNotas(lidos, { ...opcoes, chavesExistentes: substituindo ? [] : opcoes.chavesExistentes }),
  }
}
