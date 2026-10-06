import { useId, useState } from 'react'

/** Campo de texto no padrão do sistema: caixa arredondada com rótulo interno. */
export function CampoTexto({ rotulo, valor, onChange, tipo = 'text', autoComplete, autoFocus, senha, required, ajuda, className, readOnly }: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  tipo?: 'text' | 'email' | 'password'
  autoComplete?: string
  autoFocus?: boolean
  /** Mostra o botão Mostrar/Ocultar e começa oculto. */
  senha?: boolean
  required?: boolean
  ajuda?: string
  className?: string
  readOnly?: boolean
}) {
  const id = useId()
  const [visivel, setVisivel] = useState(false)
  const tipoReal = senha ? (visivel ? 'text' : 'password') : tipo
  return (
    <label className={`caixa campo campo-texto ${className ?? ''}`} htmlFor={id}>
      <span className="rotulo" id={`${id}r`}>{rotulo}</span>
      <span className="campo-linha">
        <input
          id={id}
          type={tipoReal}
          className="valor"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="none"
          aria-labelledby={`${id}r`}
          aria-describedby={ajuda ? `${id}a` : undefined}
        />
        {senha && (
          <button type="button" className="campo-acao" aria-pressed={visivel} onClick={() => setVisivel((v) => !v)}>
            {visivel ? 'Ocultar' : 'Mostrar'}
            <span className="so-leitor"> senha</span>
          </button>
        )}
      </span>
      {ajuda && <span id={`${id}a`} className="nota-caixa">{ajuda}</span>}
    </label>
  )
}
