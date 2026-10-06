# Simulador IBS/CBS no Simples Nacional

Compara, para uma empresa do Simples Nacional, os dois caminhos da Reforma Tributária (LC 214/2025):

- **Por dentro** — IBS/CBS recolhidos dentro do DAS; sem crédito sobre compras.
- **Por fora** — IBS/CBS apurados no regime regular (débito − crédito); o DAS perde a parcela de CBS/IBS e o cliente contribuinte se credita do valor cheio.

Mostra lucro, tributos, preço e crédito para clientes B2B e B2C em cada cenário, a recomendação e a diferença ano a ano na transição (2027–2033).

## Recursos

- Cálculo ao vivo no navegador; dados salvos no `localStorage`.
- Compras: cadastro manual, colar do Excel, importar planilha (.xlsx/.csv, com modelo para baixar) e importar a pasta de **XML de NF-e** (classifica o fornecedor pelo CRT, descarta vendas próprias, devoluções, canceladas e duplicadas). Toda importação passa por prévia.
- Exportar/importar a simulação em JSON e imprimir relatório.

## Rodar

Requer Node 24 (usa `node:sqlite`).

```bash
npm install
npm run dev:server   # API + banco em http://localhost:3000 (dados em ./.dados)
npm run dev          # front em http://localhost:5173, com proxy de /api para a 3000
npm run build        # front (dist/) + servidor compilado (server/dist/)
npm start            # sobe o servidor de produção na porta 3000 (serve dist/ e a API)
npx vitest run       # testes do cálculo, do parser de NF-e e do servidor
```

No primeiro `dev:server` com banco vazio, defina o admin inicial:
`ADMIN_EMAIL=voce@empresa.com ADMIN_SENHA=uma-senha-forte npm run dev:server`.

Regras de cálculo em `src/lib/calculo.ts`; tabelas do Simples (LC 123/2006, redação LC 155/2016) em `src/lib/tabelas.ts`. Amostras fictícias de XML e planilha em `amostras/`.

## Autenticação e usuários

O acesso exige login. Um único processo Node (Fastify) serve o site (`dist/`) e a API em `/api`; `GET /saude` responde `ok` sem autenticação.

- **Banco:** SQLite (`node:sqlite`) em `DATA_DIR/simulador.db`, com migração automática na inicialização. Tabelas `usuarios` e `sessoes`.
- **Senhas:** `scrypt` com salt aleatório (`scrypt$N$r$p$salt$hash`), mínimo de 8 caracteres.
- **Sessão:** cookie `sid` httpOnly, SameSite=Lax, 12 h deslizantes (renova depois da metade); só o hash do token fica no banco. `Secure` é aplicado quando a requisição chega por HTTPS (respeita `X-Forwarded-Proto`, então funciona atrás do Nginx Proxy Manager, inclusive em HTTP).
- **Força bruta:** 5 falhas por IP + e-mail em 15 min bloqueiam novas tentativas por 15 min (em memória; reiniciar o contêiner zera).
- **CSRF:** a API só aceita `application/json` nas requisições que alteram dados e confere o `Origin` contra o `Host`.
- **Perfis:** `admin` (gerencia usuários, em *Administrar usuários* no menu do nome) e `usuario`. Não é possível excluir, desativar ou rebaixar o último admin ativo, nem o admin excluir/desativar a si mesmo. Desativar o usuário ou redefinir a senha derruba as sessões dele. Senha definida por admin força a troca no próximo acesso.
- **Esqueci a senha:** não há e-mail; o admin redefine em *Administrar usuários* e repassa a senha gerada.
- **Simulações:** continuam no `localStorage`, agora por usuário (`simulador-ibs-cbs:v1:<id>`). A simulação antiga (sem id) é migrada para o primeiro usuário que entrar naquele navegador.

### Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `DATA_DIR` | `/data` (produção) ou `./.dados` (dev) | Pasta do banco SQLite. Em Docker, monte um volume aqui. |
| `PORT` | `3000` | Porta do servidor. |
| `HOST` | `0.0.0.0` | Endereço de escuta. |
| `ADMIN_EMAIL` | — | E-mail do primeiro admin (só usado com o banco vazio). |
| `ADMIN_NOME` | `Administrador` | Nome do primeiro admin. |
| `ADMIN_SENHA` | — | Senha do primeiro admin (mín. 8). Com banco vazio e sem ela, o servidor não sobe. |
| `STATIC_DIR` | `../../dist` | Pasta do build do front (raramente precisa mudar). |

### Criar o primeiro admin

Com o banco vazio (volume `dados` novo), defina `ADMIN_EMAIL`, `ADMIN_SENHA` e, se quiser, `ADMIN_NOME` nas variáveis da stack e suba. O admin é criado no primeiro boot; depois disso essas variáveis são ignoradas (pode remover `ADMIN_SENHA` da stack). Entre, abra *Administrar usuários* e crie os demais usuários.

## Deploy (Docker / Portainer)

`docker-compose.yml` faz o build do `Dockerfile` (Node 24 alpine, roda os testes no build, usuário não-root). O volume nomeado `dados` guarda o banco em `/data`: não o apague, ou os usuários se perdem.

**A porta interna é 3000** (antes, com nginx, era 80). O proxy host do Nginx Proxy Manager deve apontar para `simulador-simples:3000`.

## Premissas

Alíquotas de referência de CBS (8,8%) e IBS (17,7%) são estimativas e editáveis. Não trata o teto de 5% do ISS na 5ª faixa; a alíquota efetiva usa o RBT12 informado nos dois cenários. Estimativa para apoio à decisão — valide com a contabilidade.
