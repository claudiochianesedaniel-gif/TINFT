import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {buildServer} from "./http/server";
import {MemoryStore, type StoreSnapshot} from "./repo/memory";
import type {Store} from "./repo/store";
import {TicketingService} from "./services/ticketing";
import {seedDemo} from "./seed";

// Avvio del backend. DUE modalità di persistenza:
//   - DATABASE_URL impostata → PostgreSQL via PrismaStore (deploy reale).
//   - altrimenti → MemoryStore con snapshot JSON su file (prototipo: `pnpm dev`,
//     nessun DB richiesto, i dati sopravvivono ai riavvii).
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const usePostgres = !!process.env.DATABASE_URL;
const persistOn = !usePostgres && process.env.PERSIST !== "0";
const persistFile = process.env.PERSIST_FILE ?? join(process.cwd(), ".tinft-data.json");

async function main(): Promise<void> {
  // PrismaStore importato in modo lazy: il percorso in-memory (prototipo) non dipende da @prisma/client.
  const store: Store = usePostgres ? new (await import("./repo/prisma-store")).PrismaStore() : new MemoryStore();

  let restored = false;
  // Persistenza su file SOLO per il MemoryStore (il prototipo); con Postgres i dati stanno nel DB.
  if (!usePostgres && store instanceof MemoryStore && persistOn && existsSync(persistFile)) {
    try {
      store.restore(JSON.parse(readFileSync(persistFile, "utf8")) as StoreSnapshot);
      restored = true;
      console.log(`Dati ripristinati da ${persistFile} (${store.events.size} eventi)`);
    } catch (err) {
      console.warn(`Snapshot non leggibile (${persistFile}): riparto pulito.`, (err as Error).message);
    }
  }

  // Con Postgres assicura i contenuti editoriali (seed idempotente lato adapter).
  if (usePostgres) await store.seedContent();

  // Seed del mondo demo solo se non ho ripristinato dati e il seed non è disattivato.
  if (!restored && process.env.SEED_DEMO !== "0") {
    const {seeded} = await seedDemo(store, new TicketingService(store));
    if (seeded) console.log("Seed demo caricato (org@tinft.io / cli@tinft.io · password demo123)");
  }

  // Persistenza su file: salvataggio periodico + alla chiusura (SIGINT/SIGTERM). Solo MemoryStore.
  const memStore = store instanceof MemoryStore ? store : undefined;
  function save(): void {
    if (!persistOn || !memStore) return;
    try {
      writeFileSync(persistFile, JSON.stringify(memStore.snapshot()));
    } catch (err) {
      console.warn("Salvataggio snapshot fallito:", (err as Error).message);
    }
  }
  const saveTimer = persistOn && memStore ? setInterval(save, 3000) : undefined;
  if (saveTimer && typeof saveTimer.unref === "function") saveTimer.unref();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      save();
      if (saveTimer) clearInterval(saveTimer);
      process.exit(0);
    });
  }

  const addr = await buildServer({store}).listen({port, host});
  console.log(`TINFT API in ascolto su ${addr} — Sito: ${addr}/sito.html (store: ${usePostgres ? "PostgreSQL" : "in-memory"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
