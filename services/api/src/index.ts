import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {buildServer} from "./http/server";
import {MemoryStore, type StoreSnapshot} from "./repo/memory";
import {TicketingService} from "./services/ticketing";
import {seedDemo} from "./seed";

// Avvio del backend. Persistenza su file (snapshot JSON) per il prototipo: i dati
// sopravvivono ai riavvii. In produzione l'adapter Postgres (schema già pronto,
// vedi docs/PERSISTENCE.md) sostituisce questo livello senza cambiare l'API HTTP.
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const persistOn = process.env.PERSIST !== "0";
const persistFile = process.env.PERSIST_FILE ?? join(process.cwd(), ".tinft-data.json");

const store = new MemoryStore();

let restored = false;
if (persistOn && existsSync(persistFile)) {
  try {
    store.restore(JSON.parse(readFileSync(persistFile, "utf8")) as StoreSnapshot);
    restored = true;
    console.log(`Dati ripristinati da ${persistFile} (${store.events.size} eventi)`);
  } catch (err) {
    console.warn(`Snapshot non leggibile (${persistFile}): riparto pulito.`, (err as Error).message);
  }
}

// Seed del mondo demo solo se non ho ripristinato dati e il seed non è disattivato.
if (!restored && process.env.SEED_DEMO !== "0") {
  const {seeded} = seedDemo(store, new TicketingService(store));
  if (seeded) console.log("Seed demo caricato (org@tinft.io / cli@tinft.io · password demo123)");
}

// Persistenza: salvataggio periodico + alla chiusura (SIGINT/SIGTERM).
function save(): void {
  if (!persistOn) return;
  try {
    writeFileSync(persistFile, JSON.stringify(store.snapshot()));
  } catch (err) {
    console.warn("Salvataggio snapshot fallito:", (err as Error).message);
  }
}
const saveTimer = persistOn ? setInterval(save, 3000) : undefined;
if (saveTimer && typeof saveTimer.unref === "function") saveTimer.unref();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    save();
    if (saveTimer) clearInterval(saveTimer);
    process.exit(0);
  });
}

buildServer({store})
  .listen({port, host})
  .then((addr) => console.log(`TINFT API in ascolto su ${addr} — Sito: ${addr}/sito.html`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
