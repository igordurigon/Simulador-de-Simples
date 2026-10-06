import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { interpretarCsv, interpretarTabela, type Previa } from './importacao'
import { lerXml, type ArquivoLido } from './nfe'

const pausa = () => new Promise<void>((r) => setTimeout(r, 0))

/** Lê .xlsx ou .csv e devolve a prévia. .xls antigo gera um erro com instrução. */
export async function lerPlanilha(arquivo: File): Promise<Previa> {
  const nome = arquivo.name
  const ext = nome.toLowerCase().split('.').pop()
  if (ext === 'xls') throw new Error('Arquivos .xls antigos não são suportados. Abra no Excel e salve como .xlsx (ou .csv), depois importe de novo.')
  if (ext === 'csv' || ext === 'txt') return interpretarCsv(await arquivo.text(), nome)
  if (ext === 'xlsx') {
    const folhas = await readXlsxFile(arquivo)
    const folha = folhas.find((f) => f.sheet.toLowerCase() === 'compras') ?? folhas[0]
    if (!folha) throw new Error('A planilha não tem nenhuma aba.')
    return interpretarTabela(folha.data as unknown[][], { fonte: 'planilha', titulo: nome })
  }
  throw new Error('Formato não reconhecido. Use .xlsx ou .csv.')
}

export async function baixarModelo() {
  const neg = (v: string) => ({ value: v, fontWeight: 'bold' as const })
  const compras = [
    [neg('Fornecedor'), neg('Descrição'), neg('Tipo de fornecedor'), neg('Gera crédito'), neg('Valor pago no ano'), neg('% na nota')],
    ['Distribuidora Alfa Ltda', 'Mercadoria para revenda', 'Regular', 'Sim', { value: 420000, type: Number, format: '#,##0.00' }, null],
    ['Comercial Gama ME', 'Mercadoria para revenda', 'Simples por dentro', 'Sim', { value: 150000, type: Number, format: '#,##0.00' }, { value: 0.013, type: Number, format: '0.0%' }],
    ['Locador pessoa física', 'Aluguel do imóvel', 'Não contribuinte', 'Não', { value: 48000, type: Number, format: '#,##0.00' }, null],
  ]
  const ajuda = [
    [neg('Coluna'), neg('O que colocar')],
    ['Fornecedor', 'Nome do fornecedor.'],
    ['Descrição', 'O que foi comprado (opcional).'],
    ['Tipo de fornecedor', 'Regular (contribuinte do regime regular); Simples por fora; Simples por dentro; Não contribuinte (pessoa física, MEI). Também vale o código CRT da nota: 3 = regular, 1 ou 2 = Simples por dentro, 4 = MEI (não contribuinte).'],
    ['Gera crédito', 'Sim ou Não. Em branco: sim, exceto para não contribuinte.'],
    ['Valor pago no ano', 'Total pago no ano, em reais. Aceita 1.234,56 ou 1234.56. Linhas sem valor maior que zero são ignoradas.'],
    ['% na nota', 'Opcional. Percentual de IBS/CBS destacado na nota (por exemplo 1,3%). Em branco usa o padrão do tipo.'],
  ]
  await writeXlsxFile(
    [
      { data: compras as never, sheet: 'Compras', columns: [{ width: 30 }, { width: 28 }, { width: 24 }, { width: 14 }, { width: 20 }, { width: 12 }] },
      { data: ajuda as never, sheet: 'Como preencher', columns: [{ width: 24 }, { width: 110 }] },
    ],
  ).toFile('modelo-compras-simulador.xlsx')
}

/** Lê os XMLs em lotes, devolvendo o controle ao navegador entre eles. */
export async function lerXmls(
  arquivos: File[],
  progresso: (lidos: number, total: number) => void,
): Promise<{ lidos: ArquivoLido[]; naoXml: string[] }> {
  const xmls = arquivos.filter((f) => f.name.toLowerCase().endsWith('.xml'))
  const naoXml = arquivos.filter((f) => !f.name.toLowerCase().endsWith('.xml')).map((f) => f.name)
  const lidos: ArquivoLido[] = []
  const LOTE = 50
  progresso(0, xmls.length)
  for (let i = 0; i < xmls.length; i += LOTE) {
    const lote = xmls.slice(i, i + LOTE)
    const textos = await Promise.all(lote.map((f) => f.text().catch(() => null)))
    lote.forEach((f, j) => {
      const t = textos[j]
      lidos.push({
        arquivo: f.name,
        leitura: t === null ? { tipo: 'descarte', motivo: 'arquivo ilegível' } : lerXml(t),
      })
    })
    progresso(Math.min(i + LOTE, xmls.length), xmls.length)
    await pausa()
  }
  return { lidos, naoXml }
}

/** Percorre pastas arrastadas (webkitGetAsEntry) e devolve todos os arquivos. */
export async function arquivosDoDrop(itens: DataTransferItemList): Promise<File[]> {
  // As entradas precisam ser capturadas de forma síncrona, antes de qualquer await.
  const entradas = Array.from(itens).map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  const saida: File[] = []
  const ler = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      const f = await new Promise<File | null>((res) => (e as FileSystemFileEntry).file(res, () => res(null)))
      if (f) saida.push(f)
    } else if (e.isDirectory) {
      const leitor = (e as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const lote = await new Promise<FileSystemEntry[]>((res) => leitor.readEntries(res, () => res([])))
        if (!lote.length) break
        for (const sub of lote) await ler(sub)
      }
    }
  }
  for (const e of entradas) await ler(e)
  return saida
}
