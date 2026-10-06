import type { Usuario } from '../api'
import { Menu } from './Menu'

/** Menu do usuário logado, no cabeçalho do simulador e da administração. */
export function MenuUsuario({ usuario, onTrocarSenha, onAdministrar, onSair }: {
  usuario: Usuario
  onTrocarSenha: () => void
  onAdministrar?: () => void
  onSair: () => void
}) {
  return (
    <Menu
      className="botao menu-usuario"
      ariaLabel={`Menu do usuário ${usuario.nome}`}
      rotulo={<><span className="menu-usuario-nome">{usuario.nome}</span><span className="menu-seta" aria-hidden="true" /></>}
      itens={[
        { texto: 'Trocar senha', onClick: onTrocarSenha },
        { texto: 'Administrar usuários', onClick: () => onAdministrar?.(), oculto: usuario.perfil !== 'admin' || !onAdministrar },
        { texto: 'Sair', onClick: onSair },
      ]}
    />
  )
}
