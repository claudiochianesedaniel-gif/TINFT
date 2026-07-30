#!/usr/bin/env node
/**
 * Impedisce che una chiave finisca nel repository.
 *
 * Cerca chiavi private, API key e token nei file tracciati da git. I placeholder di
 * documentazione (es. `sk_live_…`) e le chiavi note di test (account #0 di anvil) sono
 * esclusi: sono pubblici per definizione e servono agli esempi.
 *
 * Uso: node scripts/check-secrets.mjs
 */
import {execFileSync} from "node:child_process";
import {readFileSync, statSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Chiavi pubbliche note: sono negli esempi apposta, non sono segreti. */
const ALLOWLIST = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // anvil #0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // anvil #1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // anvil #2
];

const PATTERNS = [
  {
    name: "chiave privata (32 byte esadecimali)",
    // 0x + 64 hex: esclude gli hash (che compaiono come parametri o in test) tramite contesto
    re: /\b0x[0-9a-fA-F]{64}\b/g,
    skipIf: (line) =>
      /hash|topics|keccak|digest|root|salt|proof|commit|blob|0x0{40}/i.test(line),
  },
  {name: "chiave segreta Stripe", re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/g},
  {name: "webhook secret Stripe", re: /\bwhsec_[A-Za-z0-9]{16,}/g},
  {name: "API key Resend", re: /\bre_[A-Za-z0-9]{24,}/g},
  {name: "URL RPC con chiave", re: /https:\/\/[a-z0-9-]+\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]{10,}/g},
  {name: "token GitHub", re: /\bgh[pous]_[A-Za-z0-9]{30,}/g},
  {name: "chiave privata PEM", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g},
  {name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g},
];

const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$|\/lib\/|node_modules|\.(png|jpg|jpeg|gif|ico|pdf|zip|woff2?)$/;

const files = execFileSync("git", ["ls-files"], {cwd: ROOT, encoding: "utf8"})
  .split("\n")
  .filter((f) => f && !SKIP_FILES.test(f));

const findings = [];
for (const file of files) {
  const full = join(ROOT, file);
  try {
    if (statSync(full).size > 2_000_000) continue; // file enormi: non sono sorgenti
  } catch {
    continue;
  }
  const lines = readFileSync(full, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const {name, re, skipIf} of PATTERNS) {
      re.lastIndex = 0;
      const hits = line.match(re);
      if (!hits) continue;
      for (const hit of hits) {
        if (ALLOWLIST.includes(hit)) continue;
        if (skipIf?.(line)) continue;
        findings.push({file, line: i + 1, name, hit: hit.slice(0, 24) + "…"});
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`✗ Possibili segreti nel repository (${findings.length}):\n`);
  for (const f of findings) console.error(`  • ${f.file}:${f.line} — ${f.name}: ${f.hit}`);
  console.error("\nI segreti vanno SOLO nelle variabili d'ambiente (dashboard Render), mai nel repo.");
  console.error("Se è un valore pubblico di test, aggiungilo alla ALLOWLIST di questo script.\n");
  process.exit(1);
}

console.log(`✓ Nessun segreto trovato (${files.length} file tracciati analizzati)`);
