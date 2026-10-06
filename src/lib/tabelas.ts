// Tabelas do Simples Nacional — LC 123/2006, Anexos I a V (redação da LC 155/2016).
// Partilha em fração do DAS: [IRPJ, CSLL, Cofins, PIS, CPP, IPI, ICMS/ISS].

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V'

export interface Faixa {
  ate: number
  nominal: number
  deducao: number
  partilha: Partilha
}

export interface Partilha {
  irpj: number
  csll: number
  cofins: number
  pis: number
  cpp: number
  ipi: number
  icmsIss: number
}

export const ANEXOS: { id: Anexo; nome: string }[] = [
  { id: 'I', nome: 'Anexo I — Comércio' },
  { id: 'II', nome: 'Anexo II — Indústria' },
  { id: 'III', nome: 'Anexo III — Serviços' },
  { id: 'IV', nome: 'Anexo IV — Serviços (sem CPP no DAS)' },
  { id: 'V', nome: 'Anexo V — Serviços (fator R < 28%)' },
]

export const LIMITE_SIMPLES = 4_800_000
export const SUBLIMITE = 3_600_000

const TETOS = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000]

type Linha = [number, number, number, number, number, number, number]

function monta(nominais: number[], deducoes: number[], partilhas: Linha[]): Faixa[] {
  return TETOS.map((ate, i) => {
    const [irpj, csll, cofins, pis, cpp, ipi, icmsIss] = partilhas[i].map((v) => v / 100)
    return {
      ate,
      nominal: nominais[i] / 100,
      deducao: deducoes[i],
      partilha: { irpj, csll, cofins, pis, cpp, ipi, icmsIss },
    }
  })
}

const II_PADRAO: Linha = [5.5, 3.5, 11.51, 2.49, 37.5, 7.5, 32]

export const TABELAS: Record<Anexo, Faixa[]> = {
  I: monta([4, 7.3, 9.5, 10.7, 14.3, 19], [0, 5940, 13860, 22500, 87300, 378000], [
    [5.5, 3.5, 12.74, 2.76, 41.5, 0, 34],
    [5.5, 3.5, 12.74, 2.76, 41.5, 0, 34],
    [5.5, 3.5, 12.74, 2.76, 42, 0, 33.5],
    [5.5, 3.5, 12.74, 2.76, 42, 0, 33.5],
    [5.5, 3.5, 12.74, 2.76, 42, 0, 33.5],
    [13.5, 10, 28.27, 6.13, 42.1, 0, 0],
  ]),
  II: monta([4.5, 7.8, 10, 11.2, 14.7, 30], [0, 5940, 13860, 22500, 85500, 720000], [
    II_PADRAO, II_PADRAO, II_PADRAO, II_PADRAO, II_PADRAO,
    [8.5, 7.5, 20.96, 4.54, 23.5, 35, 0],
  ]),
  III: monta([6, 11.2, 13.5, 16, 21, 33], [0, 9360, 17640, 35640, 125640, 648000], [
    [4, 3.5, 12.82, 2.78, 43.4, 0, 33.5],
    [4, 3.5, 14.05, 3.05, 43.4, 0, 32],
    [4, 3.5, 13.64, 2.96, 43.4, 0, 32.5],
    [4, 3.5, 13.64, 2.96, 43.4, 0, 32.5],
    [4, 3.5, 12.82, 2.78, 43.4, 0, 33.5],
    [35, 15, 16.03, 3.47, 30.5, 0, 0],
  ]),
  IV: monta([4.5, 9, 10.2, 14, 22, 33], [0, 8100, 12420, 39780, 183780, 828000], [
    [18.8, 15.2, 17.67, 3.83, 0, 0, 44.5],
    [19.8, 15.2, 20.55, 4.45, 0, 0, 40],
    [20.8, 15.2, 19.73, 4.27, 0, 0, 40],
    [17.8, 19.2, 18.9, 4.1, 0, 0, 40],
    [18.8, 19.2, 18.08, 3.92, 0, 0, 40],
    [53.5, 21.5, 20.55, 4.45, 0, 0, 0],
  ]),
  V: monta([15.5, 18, 19.5, 20.5, 23, 30.5], [0, 4500, 9900, 17100, 62100, 540000], [
    [25, 15, 14.1, 3.05, 28.85, 0, 14],
    [23, 15, 14.1, 3.05, 27.85, 0, 17],
    [24, 15, 14.92, 3.23, 23.85, 0, 19],
    [21, 15, 15.74, 3.41, 23.85, 0, 21],
    [23, 12.5, 14.1, 3.05, 23.85, 0, 23.5],
    [35, 15.5, 16.44, 3.56, 29.5, 0, 0],
  ]),
}

// Transição da LC 214/2025. Fração do IBS sobre a alíquota de referência;
// o ICMS/ISS no DAS cai na mesma proporção (2027-2028 são anos de teste).
export const ANOS = [2027, 2028, 2029, 2030, 2031, 2032, 2033] as const
export type Ano = (typeof ANOS)[number]

export const FRACAO_IBS_PADRAO: Record<Ano, number> = {
  2027: 0, 2028: 0, 2029: 0.1, 2030: 0.2, 2031: 0.3, 2032: 0.4, 2033: 1,
}
