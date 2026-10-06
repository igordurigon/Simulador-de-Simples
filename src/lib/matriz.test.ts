import { describe, expect, it } from 'vitest'
import { calcularMatriz, entradaExemplo } from './calculo'

const fats = [180_000, 3_600_000]

describe('calcularMatriz', () => {
  it('B2B com repasse e sem compras: por fora em todos os anexos', () => {
    const m = calcularMatriz(entradaExemplo(), 1, 0, fats, ['I', 'III', 'V'])
    expect(m.flat().every((c) => c.lado === 'fora')).toBe(true)
  })

  it('B2C absorvendo e sem compras: por dentro em todos os anexos', () => {
    const m = calcularMatriz(entradaExemplo(), 0, 0, fats, ['I', 'III', 'V'])
    expect(m.flat().every((c) => c.lado === 'dentro')).toBe(true)
  })

  it('B2C com compras: faturamento maior puxa para por fora', () => {
    const [baixo, alto] = calcularMatriz(entradaExemplo(), 0, 0.6, fats, ['IV'])
    expect(baixo[0].lado).toBe('dentro')
    expect(alto[0].lado).toBe('fora')
  })

  it('despesas não mudam a decisão', () => {
    const e = entradaExemplo()
    const a = calcularMatriz({ ...e, despesas: 0 }, 0.5, 0.3, fats, ['I'])
    const b = calcularMatriz({ ...e, despesas: 500_000 }, 0.5, 0.3, fats, ['I'])
    expect(a).toEqual(b)
  })
})
