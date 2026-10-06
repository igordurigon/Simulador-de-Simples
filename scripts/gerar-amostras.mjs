// Gera amostras FICTÍCIAS de NF-e (XML) e de planilha de compras em ./amostras
// Uso: node scripts/gerar-amostras.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import writeXlsxFile from 'write-excel-file/node'

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const pasta = join(raiz, 'amostras')
const xmlDir = join(pasta, 'xml')
rmSync(xmlDir, { recursive: true, force: true })
mkdirSync(xmlDir, { recursive: true })

const EMPRESA = { cnpj: '11222333000181', nome: 'Empresa Exemplo Ltda' }
const FILIAL = { cnpj: '11222333000262', nome: 'Empresa Exemplo Ltda' }

const dv = (s43) => {
  let peso = 2, soma = 0
  for (let i = s43.length - 1; i >= 0; i--) { soma += Number(s43[i]) * peso; peso = peso === 9 ? 2 : peso + 1 }
  const r = soma % 11
  return r < 2 ? 0 : 11 - r
}
const chaveDe = (cnpj, mod, nNF, aamm, cNF) => {
  const s = `42${aamm}${cnpj}${mod}001${String(nNF).padStart(9, '0')}1${cNF}`
  return s + dv(s)
}
const n2 = (n) => n.toFixed(2)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function nfe({ nNF, emit, dest, data, vNF, tpNF = 1, finNFe = 1, crt = 3, ibs = null, mod = 55, destDoc = 'CNPJ' }) {
  const aamm = data.slice(2, 4) + data.slice(5, 7)
  const chave = chaveDe(emit.cnpj ?? emit.cpf, mod, nNF, aamm, String(10000000 + nNF * 7).slice(0, 8))
  const emitDoc = emit.cnpj ? `<CNPJ>${emit.cnpj}</CNPJ>` : `<CPF>${emit.cpf}</CPF>`
  const destTag = dest.cnpj ? `<CNPJ>${dest.cnpj}</CNPJ>` : `<CPF>${dest.cpf}</CPF>`
  const ibscbs = ibs
    ? `<IBSCBSTot><vBCIBSCBS>${n2(vNF)}</vBCIBSCBS><gIBS><vIBS>${n2(ibs.vIBS)}</vIBS></gIBS><gCBS><vCBS>${n2(ibs.vCBS)}</vCBS></gCBS></IBSCBSTot>`
    : ''
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>42</cUF><cNF>${chave.slice(35, 43)}</cNF><natOp>${finNFe === 4 ? 'Devolucao de mercadoria' : tpNF === 1 && emit.cnpj === EMPRESA.cnpj ? 'Venda de mercadoria' : 'Compra para comercializacao'}</natOp>
        <mod>${mod}</mod><serie>1</serie><nNF>${nNF}</nNF>
        <dhEmi>${data}T10:30:00-03:00</dhEmi><tpNF>${tpNF}</tpNF><idDest>1</idDest><cMunFG>4205407</cMunFG>
        <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(43)}</cDV><tpAmb>1</tpAmb><finNFe>${finNFe}</finNFe>
        <indFinal>0</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>1.0</verProc>
      </ide>
      <emit>
        ${emitDoc}<xNome>${esc(emit.nome)}</xNome>
        <enderEmit><xLgr>Rua das Palmeiras</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>4205407</cMun><xMun>Florianopolis</xMun><UF>SC</UF><CEP>88010000</CEP></enderEmit>
        ${emit.cnpj ? '<IE>255000000</IE>' : ''}${crt ? `<CRT>${crt}</CRT>` : ''}
      </emit>
      <dest>
        ${destTag}<xNome>${esc(dest.nome)}</xNome>
        <enderDest><xLgr>Avenida Central</xLgr><nro>500</nro><xBairro>Centro</xBairro><cMun>4205407</cMun><xMun>Florianopolis</xMun><UF>SC</UF><CEP>88015000</CEP></enderDest>
        <indIEDest>1</indIEDest>
      </dest>
      <det nItem="1">
        <prod><cProd>001</cProd><xProd>Mercadoria de teste</xProd><NCM>96081000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>${n2(vNF / 10)}</vUnCom><vProd>${n2(vNF)}</vProd><uTrib>UN</uTrib><qTrib>10.0000</qTrib><vUnTrib>${n2(vNF / 10)}</vUnTrib><indTot>1</indTot></prod>
        <imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>
      </det>
      <total>
        <ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${n2(vNF)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${n2(vNF)}</vNF></ICMSTot>
        ${ibscbs}
      </total>
      <transp><modFrete>9</modFrete></transp>
      <pag><detPag><tPag>15</tPag><vPag>${n2(vNF)}</vPag></detPag></pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>SVRS</verAplic><chNFe>${chave}</chNFe><dhRecbto>${data}T10:31:00-03:00</dhRecbto><nProt>342000000000000</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>
`
  return { xml, chave }
}

const gravar = (nome, xml) => writeFileSync(join(xmlDir, nome), xml, 'utf8')

const ALFA = { cnpj: '44555666000110', nome: 'Distribuidora Alfa Ltda' }
const BETA = { cnpj: '33444555000199', nome: 'Industria Beta S.A.' }
const GAMA = { cnpj: '55666777000120', nome: 'Comercial Gama ME' }
const MEI = { cnpj: '66777888000130', nome: 'Jose da Silva Reparos' }
const DELTA = { cnpj: '22333444000155', nome: 'Transportadora Delta Ltda' }
const EPSILON = { cnpj: '77888999000140', nome: 'Papelaria Epsilon ME' }
const ZETA = { cnpj: '88999000000150', nome: 'Logistica Zeta Eireli' }
const CLIENTE = { cnpj: '99000111000160', nome: 'Cliente Varejo S.A.' }
const OUTRA = { cnpj: '12345678000195', nome: 'Outra Empresa Comercio Ltda' }
const PRODUTOR = { cpf: '12345678909', nome: 'Joao Produtor Rural' }

const a1 = nfe({ nNF: 1001, emit: ALFA, dest: EMPRESA, data: '2026-03-10', vNF: 52300 })
gravar('nfe-1001-alfa.xml', a1.xml)
gravar('nfe-1002-alfa.xml', nfe({ nNF: 1002, emit: ALFA, dest: EMPRESA, data: '2026-05-18', vNF: 28750.5 }).xml)
gravar('nfe-1003-alfa.xml', nfe({ nNF: 1003, emit: ALFA, dest: EMPRESA, data: '2026-08-22', vNF: 31000 }).xml)
const g1 = nfe({ nNF: 2001, emit: GAMA, dest: EMPRESA, data: '2026-05-05', vNF: 12400.5, crt: 1 })
gravar('nfe-2001-gama.xml', g1.xml)
gravar('nfe-2001-gama-copia.xml', g1.xml) // mesma chave em dois arquivos
gravar('nfe-3001-mei.xml', nfe({ nNF: 3001, emit: MEI, dest: EMPRESA, data: '2026-06-12', vNF: 3200, crt: 4 }).xml)
gravar('nfe-4001-venda-propria.xml', nfe({ nNF: 4001, emit: EMPRESA, dest: CLIENTE, data: '2026-06-20', vNF: 88000, crt: 3 }).xml)
gravar('nfe-1004-devolucao-alfa.xml', nfe({ nNF: 1004, emit: ALFA, dest: EMPRESA, data: '2026-09-02', vNF: 4500, finNFe: 4 }).xml)
const b1 = nfe({ nNF: 5001, emit: BETA, dest: EMPRESA, data: '2026-07-14', vNF: 18000 })
gravar('nfe-5001-beta-cancelada.xml', b1.xml)
gravar('evento-cancelamento-5001.xml', `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento versao="1.00"><infEvento Id="ID110111${b1.chave}01"><cOrgao>42</cOrgao><tpAmb>1</tpAmb><CNPJ>${BETA.cnpj}</CNPJ><chNFe>${b1.chave}</chNFe><dhEvento>2026-07-15T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>342000000000001</nProt><xJust>Cancelamento por erro de digitacao</xJust></detEvento></infEvento></evento>
  <retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${b1.chave}</chNFe><tpEvento>110111</tpEvento></infEvento></retEvento>
</procEventoNFe>
`)
gravar('nfe-6001-filial-delta.xml', nfe({ nNF: 6001, emit: DELTA, dest: FILIAL, data: '2026-09-15', vNF: 6800 }).xml)
gravar('nfe-7001-epsilon-2027.xml', nfe({ nNF: 7001, emit: EPSILON, dest: EMPRESA, data: '2027-01-12', vNF: 10000, crt: 1, ibs: { vIBS: 0, vCBS: 120 } }).xml)
gravar('nfe-8001-zeta-2027.xml', nfe({ nNF: 8001, emit: ZETA, dest: EMPRESA, data: '2027-01-20', vNF: 20000, crt: 1, ibs: { vIBS: 3600, vCBS: 1600 } }).xml)
gravar('nfe-9001-entrada-propria.xml', nfe({ nNF: 9001, emit: EMPRESA, dest: PRODUTOR, data: '2026-10-05', vNF: 7400, tpNF: 0, crt: 3 }).xml)
gravar('nfe-9002-outra-empresa.xml', nfe({ nNF: 9002, emit: ALFA, dest: OUTRA, data: '2026-10-08', vNF: 9000 }).xml)
gravar('catalogo-produtos.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<catalogo><produto id="1"><nome>Caneta</nome></produto></catalogo>\n')
gravar('corrompido.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc><NFe><infNFe Id="NFe123"><ide><mod>55</mod>')
writeFileSync(join(xmlDir, 'leia-me.txt'), 'Este arquivo nao e XML e deve ser ignorado.\n')

// ---- planilha e CSV de compras
const linhas = [
  ['Distribuidora Alfa Ltda', 'Mercadoria para revenda', 'Regular', 'Sim', 420000, null],
  ['Industria Beta S.A.', 'Mercadoria para revenda', 'Contribuinte do regime regular', 'Sim', 180000, null],
  ['Comercial Gama ME', 'Mercadoria para revenda', 'Simples por dentro', 'Sim', 150000, 0.013],
  ['Concessionaria de energia', 'Energia eletrica', 'Regular', 'Sim', 36000, null],
  ['Transportadora Delta', 'Frete', 'Simples por fora', 'Sim', 30000, null],
  ['Locador pessoa fisica', 'Aluguel do imovel', 'Nao contribuinte', 'Nao', 48000, null],
  ['Fornecedor sem valor', 'Linha que deve ser ignorada', 'Regular', 'Sim', null, null],
  ['Fornecedor tipo estranho', 'Tipo nao reconhecido', 'Cooperativa', 'Sim', 2500, null],
]
const neg = (v) => ({ value: v, fontWeight: 'bold' })
await writeXlsxFile(
  [[neg('Fornecedor'), neg('Descrição'), neg('Tipo de fornecedor'), neg('Gera crédito'), neg('Valor pago no ano'), neg('% na nota')],
    ...linhas.map((l) => l.map((c, i) => (typeof c === 'number' ? { value: c, type: Number, format: i === 5 ? '0.0%' : '#,##0.00' } : c)))],
  { sheet: 'Compras' },
).toFile(join(pasta, 'compras-exemplo.xlsx'))

const br = (n) => (n === null ? '' : n.toFixed(2).replace('.', ','))
const csv = ['Fornecedor;Descrição;Tipo de fornecedor;Gera crédito;Valor pago no ano;% na nota',
  ...linhas.map((l) => [l[0], l[1], l[2], l[3], l[4] === null ? '' : br(l[4]), l[5] === null ? '' : `${(l[5] * 100).toFixed(1).replace('.', ',')}%`].join(';'))].join('\r\n')
writeFileSync(join(pasta, 'compras-exemplo.csv'), '﻿' + csv + '\r\n', 'utf8')
console.log('Amostras geradas em', pasta)
