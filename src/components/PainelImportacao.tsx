import { useEffect, useMemo, useRef, useState } from 'react'
import { brl, pct } from '../format'
import { TIPOS_FORNECEDOR } from '../lib/calculo'
import type { Previa } from '../lib/importacao'

interface Props {
  previa: Previa
  temCompras: boolean
  temComprasNfe: boolean
  cnpjAtual: string
  onGravar: (modo: 'adicionar' | 'substituir', preencherCnpj: boolean) => void
  onCancelar: () => void
}

const LIMITE_LINHAS = 200

export function PainelImportacao({ previa, temCompras, temComprasNfe, cnpjAtual, onGravar, onCancelar }: Props) {
  const ref = useRef<HTMLElement>(null)
  const sugere = !!previa.cnpjSugerido && !cnpjAtual.trim()
  const [preencher, setPreencher] = useState(true)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [previa])

  const porMotivo = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const i of previa.ignorados) m.set(i.motivo, [...(m.get(i.motivo) ?? []), i.detalhe])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [previa])

  const total = previa.compras.reduce((a, c) => a + c.valor, 0)
  const nomeTipo = (id: string) => TIPOS_FORNECEDOR.find((t) => t.id === id)?.nome ?? id
  const vazia = previa.compras.length === 0

  return (
    <section ref={ref} tabIndex={-1} className="previa" aria-labelledby="previa-titulo">
      <header>
        <h3 id="previa-titulo">Prévia da importação: {previa.titulo}</h3>
        <p className="apoio">Nada foi gravado ainda. Confira o que será criado e escolha como importar.</p>
      </header>

      <ul className="previa-resumo">
        {previa.resumo.map((r) => <li key={r}>{r}</li>)}
        {previa.ignorados.length > 0 && <li>{previa.ignorados.length} {previa.ignorados.length === 1 ? 'item ficou de fora' : 'itens ficaram de fora'}.</li>}
      </ul>

      {previa.alertas.map((a) => (
        <p key={a} className="previa-alerta" role="note">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path d="M9 2 17 16H1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M9 7v4.2M9 13v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {a}
        </p>
      ))}

      {porMotivo.length > 0 && (
        <div className="previa-ignorados">
          <h4>O que ficou de fora</h4>
          {porMotivo.map(([motivo, itens]) => (
            <details key={motivo}>
              <summary><span className="chip">{itens.length}</span> {motivo.charAt(0).toUpperCase() + motivo.slice(1)}</summary>
              <ul>
                {itens.slice(0, 100).map((d, i) => <li key={i}>{d}</li>)}
                {itens.length > 100 && <li>e mais {itens.length - 100}.</li>}
              </ul>
            </details>
          ))}
        </div>
      )}

      {vazia ? (
        <p className="vazio">Nenhuma compra para importar.</p>
      ) : (
        <>
          <h4>Compras que serão criadas</h4>
          <div className="rolagem tabela-painel">
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th scope="col">Fornecedor</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Gera crédito</th>
                  <th scope="col" className="d">Valor</th>
                  <th scope="col" className="d">% na nota</th>
                  <th scope="col">Atenção</th>
                </tr>
              </thead>
              <tbody>
                {previa.compras.slice(0, LIMITE_LINHAS).map((c) => {
                  const av = previa.avisosPorCompra[c.id]
                  return (
                    <tr key={c.id} className={av ? 'com-aviso' : ''}>
                      <td>{c.fornecedor || '—'}</td>
                      <td>{c.descricao}</td>
                      <td>{nomeTipo(c.tipo)}</td>
                      <td>{c.geraCredito ? 'Sim' : 'Não'}</td>
                      <td className="d num">{brl(c.valor)}</td>
                      <td className="d num">{c.aliquotaNota === null ? '—' : pct(c.aliquotaNota)}</td>
                      <td className="aviso-celula">{av ? av.join(' ') : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><th scope="row" colSpan={4}>Total de {previa.compras.length} {previa.compras.length === 1 ? 'compra' : 'compras'}</th><td className="d num">{brl(total)}</td><td colSpan={2} /></tr>
              </tfoot>
            </table>
          </div>
          {previa.compras.length > LIMITE_LINHAS && <p className="apoio">Mostrando as {LIMITE_LINHAS} maiores; todas serão importadas.</p>}
        </>
      )}

      {sugere && !vazia && (
        <label className="marcar">
          <input type="checkbox" checked={preencher} onChange={(e) => setPreencher(e.target.checked)} />
          Preencher o CNPJ da empresa com {previa.cnpjSugerido}
        </label>
      )}

      <div className="barra-acoes previa-acoes">
        <button type="button" className="botao primario" disabled={vazia} onClick={() => onGravar('adicionar', sugere && preencher)}>Adicionar às compras</button>
        <button type="button" className="botao" disabled={vazia} onClick={() => onGravar('substituir', sugere && preencher)}>Substituir as compras atuais</button>
        <button type="button" className="botao ghost" onClick={onCancelar}>Cancelar</button>
        {temCompras && temComprasNfe && previa.refazer && previa.ignorados.some((i) => i.motivo === 'nota já importada') && (
          <span className="apoio">Substituir traz de volta as notas que já estavam nas compras atuais.</span>
        )}
      </div>
    </section>
  )
}
