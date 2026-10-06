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

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/ (site estático)
npx vitest run   # testes do parser de NF-e e da importação
```

Regras de cálculo em `src/lib/calculo.ts`; tabelas do Simples (LC 123/2006, redação LC 155/2016) em `src/lib/tabelas.ts`. Amostras fictícias de XML e planilha em `amostras/`.

## Premissas

Alíquotas de referência de CBS (8,8%) e IBS (17,7%) são estimativas e editáveis. Não trata o teto de 5% do ISS na 5ª faixa; a alíquota efetiva usa o RBT12 informado nos dois cenários. Estimativa para apoio à decisão — valide com a contabilidade.
