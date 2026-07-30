#!/usr/bin/env node
/**
 * Guardia sulle regole economiche: i numeri mostrati all'utente devono coincidere con
 * quelli enforced da contratti e backend.
 *
 * Perché serve: le percentuali vivono in tre posti (contratti Solidity, rules.ts, testi
 * dell'app). Un audit manuale ha già trovato in produzione "4% commissione sul primario",
 * "royalty 10%" e ricevute calcolate con ×1.04. Questo script rende impossibile ripeterlo.
 *
 * Uso: node scripts/check-economics.mjs
 */
import {readFileSync, readdirSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

const errors = [];
const ok = [];
const check = (label, condition, detail = "") => {
  if (condition) ok.push(label);
  else errors.push(`${label}${detail ? " — " + detail : ""}`);
};

// ---------------------------------------------------------------- 1. costanti
const rules = read("services", "api", "src", "domain", "rules.ts");
const ticket = read("contracts", "src", "TinftTicket.sol");
const escrow = read("contracts", "src", "TinftEscrow.sol");

check("cap rivendita +5% in rules.ts", /RESALE_CAP_BPS\s*=\s*10_500/.test(rules));
check("cap rivendita +5% in TinftEscrow.sol", /RESALE_CAP_BPS\s*=\s*10_500/.test(escrow));
check("royalty 1% in rules.ts", /ROYALTY_BPS\s*=\s*100\b/.test(rules));
check("royalty 1% in TinftTicket.sol", /ROYALTY_BPS\s*=\s*100\b/.test(ticket));
check("fee export 25% in rules.ts", /EXIT_FEE_BPS\s*=\s*2_?500/.test(rules));
check("fee export 25% in TinftTicket.sol", /EXIT_FEE_BPS\s*=\s*2500/.test(ticket));
check("max 3 biglietti/evento in rules.ts", /MAX_PER_EVENT\s*=\s*3\b/.test(rules));
check("max 3 biglietti/evento in TinftTicket.sol", /MAX_PER_EVENT\s*=\s*3\b/.test(ticket));
check("prevendita 10% in rules.ts", /PRESALE_COMMISSION_BPS\s*=\s*1_?000/.test(rules));

// ------------------------------------------------------ 2. testi mostrati all'utente
// Valori vietati: appartengono a tariffe vecchie o sbagliate.
const FORBIDDEN = [
  {re: /\+10\s*%/g, why: 'tetto di rivendita: deve essere "+5%"'},
  {re: /royalty\s*(di\s*)?10\s*%/gi, why: 'royalty: è 1% (0,5%+0,5% dopo l\'evento), mai 10%'},
  {re: /royalty\s*(di\s*)?4\s*%/gi, why: "royalty: tariffa inesistente"},
  {re: /commissione\s*(del\s*)?4\s*%/gi, why: "commissione primario: è 10%"},
  // "4%" accostato al primario/commissione anche a distanza (es. {k:'4%',v:'commissione…'})
  {re: /['"]4\s*%['"][^}\n]{0,40}(commissione|primario)/gi, why: "commissione primario: è 10%"},
  {re: /(commissione|primario)[^}\n]{0,40}['"]4\s*%['"]/gi, why: "commissione primario: è 10%"},
  {re: /\*\s*1\.04\b/g, why: "totale con prevendita: il moltiplicatore è 1.10"},
  {re: /RESALE_CAP_BPS\s*[=:]\s*11000/g, why: "cap errato (+10%): deve essere 10500"},
];

const webDir = join(ROOT, "apps", "web");
for (const file of readdirSync(webDir).filter((f) => /\.(html|js)$/.test(f))) {
  const src = readFileSync(join(webDir, file), "utf8");
  for (const {re, why} of FORBIDDEN) {
    const hits = src.match(re);
    if (hits) errors.push(`apps/web/${file}: trovato "${hits[0]}" (${hits.length}x) — ${why}`);
  }
}

// --------------------------------------------- 3. presenza dei valori corretti nell'app
const app = read("apps", "web", "app.html");
check("app: prevendita 10% dichiarata", /prevendita\s*10\s*%/i.test(app));
check("app: tetto +5% dichiarato", /\+5\s*%/.test(app));
check("app: royalty organizzatore 0,5%", /0,5\s*%/.test(app));
check("app: stato 'Bruciato al varco'", /Bruciato al varco/.test(app));
check("app: badge 'Signature 1/1'", /Signature 1\/1/.test(app));

// ------------------------------------------------------------------------ esito
for (const line of ok) console.log(`  ✓ ${line}`);
if (errors.length > 0) {
  console.error(`\n✗ Regole economiche incoerenti (${errors.length}):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error("\nI valori corretti sono: prevendita 10% · fee secondario 1% (0,5+0,5 post-evento)");
  console.error("· tetto +5% · export 25% · max 3 biglietti per evento.\n");
  process.exit(1);
}
console.log(`\n✓ Regole economiche coerenti su contratti, backend e interfaccia (${ok.length} controlli)`);
