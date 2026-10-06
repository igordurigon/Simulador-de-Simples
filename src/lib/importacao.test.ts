import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import readXlsxFile from 'read-excel-file/node'
import { interpretarColagem, interpretarCsv, interpretarTabela, lerTipo, parseCsv } from './importacao'

const AMOSTRAS = join(process.cwd(), 'amostras')

describe('lerTipo', () => {
  it('aceita texto aproximado e códigos CRT', () => {
    expect(lerTipo('Regular')).toBe('regular')
    expect(lerTipo('Contribuinte do regime regular')).toBe('regular')
    expect(lerTipo('Simples por fora')).toBe('simples_fora')
    expect(lerTipo('simples')).toBe('simples_dentro')
    expect(lerTipo('Simples por dentro')).toBe('simples_dentro')
    expect(lerTipo('Não contribuinte')).toBe('nao_contribuinte')
    expect(lerTipo('PF')).toBe('nao_contribuinte')
    expect(lerTipo('1')).toBe('simples_dentro')
    expect(lerTipo('2')).toBe('simples_dentro')
    expect(lerTipo('3')).toBe('regular')
    expect(lerTipo('4')).toBe('nao_contribuinte')
    expect(lerTipo('MEI')).toBe('nao_contribuinte')
    expect(lerTipo('cooperativa')).toBeNull()
  })
})

describe('parseCsv', () => {
  it('trata BOM, aspas e separador ;', () => {
    expect(parseCsv('﻿a;b;c\r\n"x;y";"1.234,56";"diz ""oi"""\r\n')).toEqual([['a', 'b', 'c'], ['x;y', '1.234,56', 'diz "oi"']])
  })
  it('detecta vírgula e tabulação', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('CSV de amostra', () => {
  const p = interpretarCsv(readFileSync(join(AMOSTRAS, 'compras-exemplo.csv'), 'utf8'), 'compras-exemplo.csv')
  it('lê 7 compras e ignora a linha sem valor', () => {
    expect(p.compras).toHaveLength(7)
    expect(p.ignorados).toHaveLength(1)
    expect(p.ignorados[0].motivo).toBe('Sem valor maior que zero')
    expect(p.ignorados[0].detalhe).toContain('Fornecedor sem valor')
  })
  it('valores brasileiros, tipos e % na nota', () => {
    expect(p.compras[0]).toMatchObject({ fornecedor: 'Distribuidora Alfa Ltda', tipo: 'regular', valor: 420000, geraCredito: true, aliquotaNota: null })
    expect(p.compras[2]).toMatchObject({ tipo: 'simples_dentro', aliquotaNota: 0.013 })
    expect(p.compras[4].tipo).toBe('simples_fora')
    expect(p.compras[5]).toMatchObject({ tipo: 'nao_contribuinte', geraCredito: false })
  })
  it('tipo não reconhecido entra como regular com aviso', () => {
    const c = p.compras[6]
    expect(c.tipo).toBe('regular')
    expect(p.avisosPorCompra[c.id][0]).toContain('Cooperativa')
  })
})

describe('XLSX de amostra', () => {
  it('lê a mesma tabela do CSV', async () => {
    const dados = await readXlsxFile(join(AMOSTRAS, 'compras-exemplo.xlsx'))
    const linhas = (Array.isArray(dados) && dados[0] && 'data' in (dados[0] as object) ? (dados[0] as { data: unknown[][] }).data : dados) as unknown[][]
    const p = interpretarTabela(linhas, { fonte: 'planilha', titulo: 'x' })
    expect(p.compras).toHaveLength(7)
    expect(p.compras[2]).toMatchObject({ tipo: 'simples_dentro', valor: 150000 })
    expect(p.compras[2].aliquotaNota).toBeCloseTo(0.013, 6)
    expect(p.ignorados).toHaveLength(1)
  })
})

describe('cabeçalho e ordem', () => {
  it('reconhece cabeçalhos com sinônimos e colunas fora de ordem', () => {
    const p = interpretarTabela([
      ['Valor total', 'Regime', 'Razão social', 'Item', 'Crédito'],
      ['1234.56', '3', 'Fulano SA', 'Peças', 'sim'],
      ['2.000,00', 'MEI', 'Beltrano', '', ''],
    ], { fonte: 'planilha', titulo: 'x' })
    expect(p.compras).toHaveLength(2)
    expect(p.compras[0]).toMatchObject({ fornecedor: 'Fulano SA', valor: 1234.56, tipo: 'regular', descricao: 'Peças' })
    expect(p.compras[1]).toMatchObject({ tipo: 'nao_contribuinte', geraCredito: false, valor: 2000 })
  })
  it('sem cabeçalho assume a ordem do modelo', () => {
    const p = interpretarColagem('Alfa\tRevenda\tregular\tsim\t420.000,00\nBeta\tFrete\tsimples por fora\tnão\t30.000,00')
    expect(p.compras).toHaveLength(2)
    expect(p.compras[0].valor).toBe(420000)
    expect(p.compras[1]).toMatchObject({ tipo: 'simples_fora', geraCredito: false })
  })
  it('% na nota: 1,3 e 1,3% viram 0,013; 0,013 fica', () => {
    const p = interpretarTabela([
      ['Fornecedor', 'Valor', 'Tipo', '%'],
      ['A', 100, 'simples', '1,3'],
      ['B', 100, 'simples', '1,3%'],
      ['C', 100, 'simples', 0.013],
    ], { fonte: 'planilha', titulo: 'x' })
    expect(p.compras.map((c) => c.aliquotaNota)).toEqual([0.013, 0.013, 0.013])
  })
})
