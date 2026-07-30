#!/usr/bin/env node
/**
 * Controlla la sintassi degli script inline delle pagine in apps/web.
 *
 * Perché serve: l'app (apps/web/app.html) è una singola pagina con ~97 KB di logica
 * inline e non esiste una suite di test frontend. Senza questo controllo, un errore di
 * sintassi introdotto da una modifica arriverebbe dritto in produzione.
 *
 * Uso: node scripts/check-web-syntax.mjs
 */
import {readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");

/** Estrae il contenuto degli <script> senza attributo src. */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), "tinft-syntax-"));
let checked = 0;
const errors = [];

try {
  const files = readdirSync(WEB).filter((f) => f.endsWith(".html") || f.endsWith(".js"));
  for (const file of files) {
    const full = join(WEB, file);
    const source = readFileSync(full, "utf8");
    const chunks = file.endsWith(".js") ? [source] : inlineScripts(source);

    chunks.forEach((code, i) => {
      // Gli script inline delle pagine non sono moduli: li verifichiamo come script classici.
      const path = join(tmp, `${file.replace(/[^\w.-]/g, "_")}.${i}.js`);
      writeFileSync(path, code);
      try {
        execFileSync(process.execPath, ["--check", path], {stdio: "pipe"});
        checked++;
      } catch (e) {
        errors.push(`${file} (script #${i + 1}):\n${e.stderr?.toString().trim() ?? e.message}`);
      }
    });
  }
} finally {
  rmSync(tmp, {recursive: true, force: true});
}

if (errors.length > 0) {
  console.error("✗ Errori di sintassi negli script di apps/web:\n");
  for (const e of errors) console.error(e + "\n");
  process.exit(1);
}

console.log(`✓ Sintassi valida: ${checked} script controllati in apps/web`);
