import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cnpjMatriz, consolidarNotas, lerXml, type ArquivoLido } from './nfe'

const DIR = join(process.cwd(), 'amostras', 'xml')
const lerPasta = (): ArquivoLido[] =>
  readdirSync(DIR).filter((n) => n.endsWith('.xml')).map((n) => ({ arquivo: n, leitura: lerXml(readFileSync(join(DIR, n), 'utf8')) }))

const motivos = (p: ReturnType<typeof consolidarNotas>) => {
  const m: Record<string, number> = {}
  for (const i of p.ignorados) m[i.motivo] = (m[i.motivo] ?? 0) + 1
  return m
}

describe('lerXml', () => {
  it('lê nfeProc: chave, partes, CRT, total e data', () => {
    const l = lerXml(readFileSync(join(DIR, 'nfe-1001-alfa.xml'), 'utf8'))
    expect(l.tipo).toBe('nota')
    if (l.tipo !== 'nota') return
    expect(l.nota.chave).toHaveLength(44)
    expect(l.nota.emit.doc).toBe('44555666000110')
    expect(l.nota.emit.nome).toBe('Distribuidora Alfa Ltda')
    expect(l.nota.emit.crt).toBe(3)
    expect(l.nota.dest.doc).toBe('11222333000181')
    expect(l.nota.vNF).toBe(52300)
    expect(l.nota.emissao).toBe('2026-03-10')
    expect(l.nota.temIBSCBS).toBe(false)
  })
  it('lê o grupo IBSCBSTot quando existe', () => {
    const l = lerXml(readFileSync(join(DIR, 'nfe-8001-zeta-2027.xml'), 'utf8'))
    if (l.tipo !== 'nota') throw new Error('esperava nota')
    expect(l.nota.vIBS).toBe(3600)
    expect(l.nota.vCBS).toBe(1600)
    expect(l.nota.temIBSCBS).toBe(true)
  })
  it('aceita NFe sem o envelope nfeProc, com chave pelo Id', () => {
    const xml = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe' + '4'.repeat(44) + '"><ide><mod>65</mod><tpNF>1</tpNF><finNFe>1</finNFe><dEmi>2026-02-01</dEmi></ide><emit><CNPJ>1</CNPJ><xNome>X</xNome><CRT>3</CRT></emit><dest><CPF>12345678909</CPF><xNome>Y</xNome></dest><total><ICMSTot><vNF>10.50</vNF></ICMSTot></total></infNFe></NFe>'
    const l = lerXml(xml)
    if (l.tipo !== 'nota') throw new Error('esperava nota')
    expect(l.nota.chave).toBe('4'.repeat(44))
    expect(l.nota.modelo).toBe('65')
    expect(l.nota.emissao).toBe('2026-02-01')
    expect(l.nota.dest.ehCpf).toBe(true)
  })
  it('reconhece o evento de cancelamento', () => {
    const l = lerXml(readFileSync(join(DIR, 'evento-cancelamento-5001.xml'), 'utf8'))
    expect(l.tipo).toBe('cancelamento')
    if (l.tipo === 'cancelamento') expect(l.chave).toHaveLength(44)
  })
  it('descarta XML que não é NF-e e XML malformado', () => {
    expect(lerXml(readFileSync(join(DIR, 'catalogo-produtos.xml'), 'utf8'))).toEqual({ tipo: 'descarte', motivo: 'arquivo não é NF-e' })
    expect(lerXml(readFileSync(join(DIR, 'corrompido.xml'), 'utf8'))).toEqual({ tipo: 'descarte', motivo: 'arquivo ilegível' })
  })
})

describe('consolidarNotas com a pasta de amostras', () => {
  const lidos = lerPasta()
  const p = consolidarNotas(lidos, { cnpjEmpresa: '11.222.333/0001-81', chavesExistentes: [] })
  const porNome = (parte: string) => p.compras.find((c) => c.fornecedor.includes(parte))!

  it('conta os descartes por motivo', () => {
    expect(motivos(p)).toEqual({
      'venda da própria empresa': 1,
      devolução: 1,
      cancelada: 1,
      'nota já importada': 1,
      'destinatário é outra empresa': 1,
      'arquivo não é NF-e': 1,
      'arquivo ilegível': 1,
    })
  })
  it('agrupa por fornecedor e soma vNF', () => {
    expect(p.compras).toHaveLength(7)
    const alfa = porNome('Alfa')
    expect(alfa.valor).toBe(112050.5)
    expect(alfa.descricao).toBe('3 notas NF-e · CNPJ 44.555.666/0001-10')
    expect(alfa.origem?.chaves).toHaveLength(3)
    expect(alfa.origem?.tipo).toBe('nfe')
    expect(alfa.tipo).toBe('regular')
  })
  it('não inclui a nota cancelada nem a venda própria', () => {
    expect(p.compras.some((c) => c.fornecedor.includes('Beta'))).toBe(false)
    expect(p.compras.some((c) => c.fornecedor.includes('Cliente'))).toBe(false)
  })
  it('classifica por CRT', () => {
    expect(porNome('Gama').tipo).toBe('simples_dentro')
    expect(porNome('Gama').valor).toBe(12400.5)
    expect(porNome('Gama').origem?.chaves).toHaveLength(1)
    expect(porNome('Jose da Silva').tipo).toBe('nao_contribuinte')
    expect(porNome('Jose da Silva').geraCredito).toBe(false)
  })
  it('aceita nota da filial (mesma raiz de CNPJ)', () => {
    const delta = porNome('Delta')
    expect(delta.tipo).toBe('regular')
    expect(delta.valor).toBe(6800)
  })
  it('Simples em 2027 com IBS/CBS: abaixo de 5% fica por dentro com a alíquota da nota; acima vira por fora', () => {
    const eps = porNome('Epsilon')
    expect(eps.tipo).toBe('simples_dentro')
    expect(eps.aliquotaNota).toBeCloseTo(0.012, 6)
    const zeta = porNome('Zeta')
    expect(zeta.tipo).toBe('simples_fora')
    expect(zeta.aliquotaNota).toBeNull()
  })
  it('nota de entrada própria vira compra de não contribuinte, para revisar', () => {
    const prod = porNome('Produtor')
    expect(prod.tipo).toBe('nao_contribuinte')
    expect(prod.geraCredito).toBe(false)
    expect(prod.descricao).toContain('CPF 123.456.789-09')
    expect(prod.origem?.observacao).toBe('nota de entrada própria — revisar')
    expect(p.avisosPorCompra[prod.id]).toBeDefined()
  })
  it('resumo: notas incluídas, período e aviso de menos de 12 meses', () => {
    expect(p.resumo[0]).toContain('9 notas incluídas')
    expect(p.resumo[0]).toContain('7 fornecedores')
    expect(p.resumo[1]).toBe('Período das notas: 10/03/2026 a 20/01/2027.')
    expect(p.alertas.join(' ')).toContain('cobrem 11 meses')
  })
  it('ignora notas cujas chaves já estão em compras existentes', () => {
    const chaves = porNome('Alfa').origem!.chaves!
    const q = consolidarNotas(lidos, { cnpjEmpresa: '11222333000181', chavesExistentes: chaves })
    expect(q.compras.some((c) => c.fornecedor.includes('Alfa'))).toBe(false)
    expect(motivos(q)['nota já importada']).toBe(4)
    // "Substituir": refaz sem as chaves existentes
    expect(q.refazer!(true).compras.some((c) => c.fornecedor.includes('Alfa'))).toBe(true)
  })
  it('sem CNPJ informado, usa o destinatário mais frequente (matriz)', () => {
    const q = consolidarNotas(lidos, { cnpjEmpresa: '', chavesExistentes: [] })
    expect(q.cnpjSugerido).toBe('11.222.333/0001-81')
    expect(q.resumo.join(' ')).toContain('Considerei como sua empresa o CNPJ 11.222.333/0001-81')
    expect(q.compras).toHaveLength(7)
  })
  it('calcula o dígito verificador da matriz', () => {
    expect(cnpjMatriz('11222333')).toBe('11222333000181')
  })
})
