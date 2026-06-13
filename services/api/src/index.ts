import {buildServer} from "./http/server";

// Avvio del backend (in-memory). L'adapter Prisma/PostgreSQL si innesta nel
// prossimo step di M6 senza cambiare l'interfaccia HTTP.
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

buildServer()
  .listen({port, host})
  .then((addr) => console.log(`TINFT API in ascolto su ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
