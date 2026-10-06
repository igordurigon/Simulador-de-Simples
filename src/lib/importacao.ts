import { lerNumero } from '../format'
import { novoId, type Compra, type TipoFornecedor } from './calculo'

/** Um item que ficou de fora da importação, com o motivo. */
export interface Ignorado { motivo: string; detalhe: string }

/** O que a prévia mostra antes de gravar qualquer coisa. */
export interface Previa {
  fonte: 'planilha' | 'colar' | 'nfe'
  titulo: string
  compras: Compra[]
  /** Avisos por compra (id da compra). Compra com aviso aparece destacada. */
  avisosPorCompra: Record<string, string[]>
  ignorados: Ignorado[]
  /** Frases de resumo (o que foi lido). */
  resumo: string[]
  /** Alertas gerais, mostrados em destaque. */
  alertas: string[]
  /** NF-e: CNPJ a sugerir para a empresa quando o campo estava vazio. */
  cnpjSugerido?: string
  /** NF-e: refaz a prévia ignorando as notas já gravadas (usado em "Substituir"). */
  refazer?: (substituindo: boolean) => Previa
}

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Texto aproximado de tipo. Devolve null se não reconhecer. */
export function lerTipo(txt: string): TipoFornecedor | null {
  const t = semAcento(txt)
  if (!t) return null
  if (t === '1' || t === '2') return 'simples_dentro'
  if (t === '3') return 'regular'
  if (t === '4' || /\bmei\b/.test(t)) return 'nao_contribuinte'
  if (/fora/.test(t)) return 'simples_fora'
  if (/simples|dentro/.test(t)) return 'simples_dentro'
  if (/nao ?contrib|fisica|\bpf\b|\bcpf\b/.test(t)) return 'nao_contribuinte'
  if (/regular|normal|lucro/.test(t)) return 'regular'
  return null
}

export function lerSimNao(txt: string, padrao: boolean): boolean {
  const t = semAcento(txt)
  if (/^(sim|s|1|true|x|yes|y|verdadeiro)$/.test(t)) return true
  if (/^(nao|n|0|false|no|falso)$/.test(t)) return false
  return padrao
}

/** Quebra CSV em linhas e células: BOM, aspas, separador ; , ou tab detectado. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const conta = (c: string) => {
    let n = 0
    let aspas = false
    for (const ch of primeira) {
      if (ch === '"') aspas = !aspas
      else if (ch === c && !aspas) n++
    }
    return n
  }
  const cand: [string, number][] = [[';', conta(';')], ['\t', conta('\t')], [',', conta(',')]]
  cand.sort((a, b) => b[1] - a[1])
  const sep = cand[0][1] > 0 ? cand[0][0] : ';'

  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else aspas = false
      } else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += ch
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

type Coluna = 'fornecedor' | 'descricao' | 'tipo' | 'credito' | 'valor' | 'aliquota'

const SINONIMOS: [Coluna, string[]][] = [
  ['fornecedor', ['fornecedor', 'razao social', 'emitente']],
  ['descricao', ['descricao', 'item', 'produto', 'historico']],
  ['tipo', ['tipo', 'regime', 'crt']],
  ['credito', ['gera credito', 'credito', 'geracredito']],
  ['aliquota', ['% na nota', 'aliquota', '%', 'percentual']],
  ['valor', ['valor', 'total']],
]

function colunaDoCabecalho(celula: unknown): Coluna | null {
  const t = semAcento(String(celula ?? '')).replace(/[^a-z0-9% ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  for (const [col, sins] of SINONIMOS) if (sins.some((s) => t === s || t.startsWith(s + ' ') || (s === '%' && t.startsWith('%')))) return col
  return null
}

const celulaTexto = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

function celulaNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return lerNumero(celulaTexto(v))
}

/** Percentual de nota: "1,3%" ou 1,3 viram 0,013; 0,013 (célula em %) fica como está. */
function celulaPercentual(v: unknown): number | null {
  if (typeof v === 'string' && v.includes('%')) {
    const n = lerNumero(v)
    return n === null ? null : Number((n / 100).toPrecision(12))
  }
  const n = celulaNumero(v)
  if (n === null || n < 0) return null
  return n >= 1 ? Number((n / 100).toPrecision(12)) : n
}

/**
 * Interpreta linhas de tabela (planilha, CSV ou texto colado).
 * Reconhece o cabeçalho pelos nomes das colunas; sem cabeçalho, assume a ordem do modelo.
 */
export function interpretarTabela(
  linhas: unknown[][],
  opcoes: { fonte: 'planilha' | 'colar'; titulo: string },
): Previa {
  const compras: Compra[] = []
  const avisosPorCompra: Record<string, string[]> = {}
  const ignorados: Ignorado[] = []
  const alertas: string[] = []

  let mapa: Record<Coluna, number> = { fornecedor: 0, descricao: 1, tipo: 2, credito: 3, valor: 4, aliquota: 5 }
  let inicio = 0
  const idxCab = linhas.findIndex((l) => l.filter((c) => colunaDoCabecalho(c)).length >= 2)
  if (idxCab >= 0 && idxCab <= 5) {
    const achado: Partial<Record<Coluna, number>> = {}
    linhas[idxCab].forEach((c, i) => {
      const col = colunaDoCabecalho(c)
      if (col && achado[col] === undefined) achado[col] = i
    })
    if (achado.valor === undefined) {
      alertas.push('Não encontrei a coluna de valor no cabeçalho; usei a ordem do modelo (fornecedor, descrição, tipo, gera crédito, valor, % na nota).')
    } else {
      mapa = { fornecedor: -1, descricao: -1, tipo: -1, credito: -1, valor: -1, aliquota: -1, ...achado } as Record<Coluna, number>
    }
    inicio = idxCab + 1
  }

  for (let i = inicio; i < linhas.length; i++) {
    const cel = linhas[i]
    if (cel.every((c) => celulaTexto(c) === '')) continue
    const pega = (col: Coluna) => (mapa[col] >= 0 ? cel[mapa[col]] : undefined)
    const fornecedor = celulaTexto(pega('fornecedor'))
    const valor = celulaNumero(pega('valor'))
    const rotulo = `linha ${i + 1}${fornecedor ? `: ${fornecedor}` : ''}`
    if (valor === null || !(valor > 0)) {
      ignorados.push({ motivo: 'Sem valor maior que zero', detalhe: rotulo })
      continue
    }
    const avisos: string[] = []
    const tipoTxt = celulaTexto(pega('tipo'))
    let tipo = lerTipo(tipoTxt)
    if (!tipo) {
      tipo = 'regular'
      avisos.push(tipoTxt ? `Tipo "${tipoTxt}" não reconhecido; entrou como regime regular.` : 'Tipo em branco; entrou como regime regular.')
    }
    const aliq = tipo === 'nao_contribuinte' ? null : celulaPercentual(pega('aliquota'))
    const c: Compra = {
      id: novoId(),
      fornecedor,
      descricao: celulaTexto(pega('descricao')),
      tipo,
      geraCredito: lerSimNao(celulaTexto(pega('credito')), tipo !== 'nao_contribuinte'),
      valor,
      aliquotaNota: aliq,
      origem: { tipo: opcoes.fonte === 'planilha' ? 'planilha' : 'manual' },
    }
    if (avisos.length) avisosPorCompra[c.id] = avisos
    compras.push(c)
  }

  const total = compras.reduce((a, c) => a + c.valor, 0)
  return {
    fonte: opcoes.fonte,
    titulo: opcoes.titulo,
    compras,
    avisosPorCompra,
    ignorados,
    alertas,
    resumo: [`${compras.length} compras lidas, somando ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`],
  }
}

/** Texto colado do Excel (tabulação) ou CSV simples. */
export function interpretarColagem(texto: string): Previa {
  return interpretarTabela(parseCsv(texto), { fonte: 'colar', titulo: 'Texto colado do Excel' })
}

export function interpretarCsv(texto: string, nomeArquivo: string): Previa {
  return interpretarTabela(parseCsv(texto), { fonte: 'planilha', titulo: nomeArquivo })
}
