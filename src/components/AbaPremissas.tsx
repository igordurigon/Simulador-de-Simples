import { pct } from '../format'
import { ANOS, type Ano } from '../lib/tabelas'
import { aliquotasDoAno, type Entrada } from '../lib/calculo'
import { CampoPercentual } from './Campos'

interface Props {
  entrada: Entrada
  atualizar: (p: Partial<Entrada>) => void
}

export function AbaPremissas({ entrada, atualizar }: Props) {
  const mudarFracao = (ano: Ano, v: number | null) =>
    atualizar({ fracaoIbs: { ...entrada.fracaoIbs, [ano]: Math.min(1, Math.max(0, v ?? 0)) } })
  return (
    <div className="aba-corpo">
      <div className="grade c3">
        <CampoPercentual rotulo="Alíquota de referência da CBS" valor={entrada.cbsRef} onChange={(v) => atualizar({ cbsRef: v ?? 0 })} />
        <CampoPercentual rotulo="Alíquota de referência do IBS" valor={entrada.ibsRef} onChange={(v) => atualizar({ ibsRef: v ?? 0 })} />
        <CampoPercentual rotulo="Crédito padrão de fornecedor do Simples por dentro" valor={entrada.pctSimplesDentroPadrao}
          onChange={(v) => atualizar({ pctSimplesDentroPadrao: v ?? 0 })} />
      </div>
      <p className="apoio">
        As alíquotas de referência são uma estimativa: substitua pela oficial quando for publicada. O crédito padrão vale
        quando a nota do fornecedor não informa o percentual.
      </p>

      <section aria-labelledby="t-fracao">
        <h3 id="t-fracao">Transição do IBS por ano</h3>
        <div className="rolagem">
          <table className="tabela-simples tabela-fracao">
            <thead>
              <tr>
                <th scope="col">Ano</th>
                <th scope="col" className="d">Fração do IBS</th>
                <th scope="col" className="d">CBS</th>
                <th scope="col" className="d">IBS</th>
                <th scope="col" className="d">ICMS/ISS remanescente</th>
              </tr>
            </thead>
            <tbody>
              {ANOS.map((a) => {
                const al = aliquotasDoAno(entrada, a)
                return (
                  <tr key={a} className={a === entrada.ano ? 'atual' : ''}>
                    <th scope="row">{a}</th>
                    <td className="d">
                      <CampoPercentual semRotulo rotulo={`Fração do IBS em ${a}`} valor={entrada.fracaoIbs[a]}
                        onChange={(v) => mudarFracao(a, v)} className="celula-caixa" />
                    </td>
                    <td className="d num">{pct(al.cbs, 2)}</td>
                    <td className="d num">{pct(al.ibs, 2)}</td>
                    <td className="d num">{pct(al.icmsIssRemanescente, 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premissas-texto" aria-labelledby="t-premissas">
        <h3 id="t-premissas">Premissas e simplificações</h3>
        <ul>
          <li>O teto de 5% do ISS na 5ª faixa não é tratado.</li>
          <li>A alíquota efetiva usa o RBT12 informado nos dois cenários.</li>
          <li>Saldo credor de IBS/CBS aparece como valor negativo, sem ressarcimento nem compensação.</li>
          <li>Alíquotas reduzidas por setor entram pelo campo &quot;% na nota&quot; de cada compra.</li>
          <li>Valide os resultados com a contabilidade antes de decidir.</li>
        </ul>
        <p className="apoio">Fontes: LC 123/2006 (redação da LC 155/2016) e LC 214/2025.</p>
      </section>
    </div>
  )
}
