import {buildServer} from "./http/server";
import {MemoryStore} from "./repo/memory";
import {TicketingService} from "./services/ticketing";
import {seedDemo} from "./seed";

// Avvio del backend (in-memory). L'adapter Prisma/PostgreSQL si innesta nel
// prossimo step di M6 senza cambiare l'interfaccia HTTP.
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

// Mondo demo coerente (organizzatore + club + eventi + vendite) così il prototipo
// è subito usabile. Disattivabile con SEED_DEMO=0.
const store = new MemoryStore();
if (process.env.SEED_DEMO !== "0") {
  const {seeded} = seedDemo(store, new TicketingService(store));
  if (seeded) console.log("Seed demo caricato (org@tinft.io / cli@tinft.io · password demo123)");
}

buildServer({store})
  .listen({port, host})
  .then((addr) => console.log(`TINFT API in ascolto su ${addr} — Sito: ${addr}/sito.html`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
