import { mascaraCnpj, brl, pct } from '../format'
import { ANEXOS, ANOS, LIMITE_SIMPLES, SUBLIMITE, type Anexo, type Ano } from '../lib/tabelas'
import type { Entrada, Resultado } from '../lib/calculo'
import { Alerta, Caixa, CampoMoeda, CampoSelect, CampoTexto, Interruptor } from './Campos'

interface Props {
  entrada: Entrada
  r: Resultado
  atualizar: (p: Partial<Entrada>) => void
}

export function AbaEmpresa({ entrada, r, atualizar }: Props) {
  const s = r.simples
  const p = s.partilha
  const rem = r.aliquotas.icmsIssRemanescente

  const fatias = [
    { nome: 'IRPJ', v: p.irpj, dentro: false, cor: '#8493A5' },
    { nome: 'CSLL', v: p.csll, dentro: false, cor: '#A9B5C3' },
    { nome: 'PIS e Cofins (viram CBS)', v: p.pis + p.cofins, dentro: true, cor: '' },
    { nome: 'CPP', v: p.cpp, dentro: false, cor: '#6D7C8F' },
    { nome: 'IPI', v: p.ipi, dentro: false, cor: '#C4CDD7' },
    { nome: 'ICMS/ISS que permanece', v: p.icmsIss * rem, dentro: false, cor: '#98A5B5' },
    { nome: 'ICMS/ISS que vira IBS', v: p.icmsIss * (1 - rem), dentro: true, cor: '' },
  ].filter((f) => f.v > 0.00001)

  return (
    <div className="aba-corpo">
      <div className="grade c3">
        <CampoTexto rotulo="Empresa" valor={entrada.empresa} onChange={(empresa) => atualizar({ empresa })} className="span2" />
        <CampoTexto rotulo="CNPJ" valor={entrada.cnpj} placeholder="00.000.000/0000-00" inputMode="numeric"
          onChange={(v) => atualizar({ cnpj: mascaraCnpj(v) })} />
        <CampoSelect<Ano> rotulo="Ano de referência" valor={entrada.ano} onChange={(ano) => atualizar({ ano })}
          opcoes={ANOS.map((a) => ({ valor: a, nome: String(a) }))} />
        <CampoMoeda rotulo="Receita dos últimos 12 meses (RBT12)" valor={r.rbt12} disabled={!entrada.rbt12Manual}
          onChange={(rbt12) => atualizar({ rbt12 })} />
        <CampoSelect<Anexo> rotulo="Anexo" valor={entrada.anexo} onChange={(anexo) => atualizar({ anexo })}
          opcoes={ANEXOS.map((a) => ({ valor: a.id, nome: a.nome }))} />
      </div>

      <Interruptor rotulo="RBT12 igual ao faturamento anual" ligado={!entrada.rbt12Manual}
        onChange={(v) => atualizar(v ? { rbt12Manual: false } : { rbt12Manual: true, rbt12: entrada.faturamento })}
        ajuda={entrada.rbt12Manual
          ? 'Desligado: a faixa do Simples usa o RBT12 digitado, mesmo que o faturamento mude.'
          : 'Ligado: ao mudar o faturamento na aba Vendas, a faixa e a alíquota do Simples acompanham.'} />

      <div className="grade c4 espaco">
        <Caixa rotulo="Faixa">{s.faixa === null ? 'Acima do limite' : `${s.faixa}ª faixa`}</Caixa>
        <Caixa rotulo="Alíquota nominal">{pct(s.nominal)}</Caixa>
        <Caixa rotulo="Parcela a deduzir">{brl(s.deducao)}</Caixa>
        <Caixa rotulo="Alíquota efetiva" destaque>{pct(s.efetiva)}</Caixa>
      </div>

      {s.situacao === 'sublimite' && (
        <Alerta>
          A receita passa do sublimite de {brl(SUBLIMITE)}. Nessa faixa, ICMS e ISS são recolhidos fora do DAS,
          e este simulador não trata esse caso. Os resultados valem só como referência.
        </Alerta>
      )}
      {s.situacao === 'excede' && (
        <Alerta>
          A receita passa do limite de {brl(LIMITE_SIMPLES)} do Simples Nacional. O cálculo usa a última faixa
          da tabela apenas como referência.
        </Alerta>
      )}

      <section className="partilha" aria-labelledby="t-partilha">
        <h3 id="t-partilha">Partilha do DAS</h3>
        <p className="apoio">
          Em destaque, as fatias que viram CBS e IBS em {entrada.ano}. No cenário por fora, elas saem do DAS.
        </p>
        <div className="barra-partilha" role="img"
          aria-label={fatias.map((f) => `${f.nome}: ${pct(f.v)}`).join('; ')}>
          {fatias.map((f) => (
            <span key={f.nome} className={f.dentro ? 'fatia dentro' : 'fatia'}
              style={{ flexGrow: f.v, background: f.dentro ? undefined : f.cor }} />
          ))}
        </div>
        <ul className="legenda-partilha">
          {fatias.map((f) => (
            <li key={f.nome}>
              <span className="amostra" style={{ background: f.dentro ? 'var(--dentro)' : f.cor }} aria-hidden="true" />
              <span>{f.nome}</span>
              <span className="num">{pct(f.v)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
