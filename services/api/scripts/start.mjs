#!/usr/bin/env node
/**
 * Avvio di produzione (Render/Docker).
 *
 * Se `DATABASE_URL` è presente il backend usa PostgreSQL: prima di servire
 * traffico applica le migrazioni con `prisma migrate deploy` (idempotente).
 * Senza `DATABASE_URL` si parte direttamente in modalità in-memory: nessun DB
 * richiesto, ma i dati si azzerano a ogni riavvio.
 *
 * Se le migrazioni falliscono NON avviamo il server: meglio un deploy rosso e
 * visibile che un'istanza che scrive su uno schema disallineato.
 */
import {spawn} from "node:child_process";

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {stdio: "inherit", shell: false});
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} uscito con codice ${code}`))));
  });

if (process.env.DATABASE_URL) {
  console.log("[start] DATABASE_URL presente → applico le migrazioni Prisma…");
  try {
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
    console.log("[start] migrazioni applicate.");
  } catch (err) {
    console.error("[start] migrazioni FALLITE, non avvio il server:", err.message);
    process.exit(1);
  }
} else {
  console.log("[start] nessuna DATABASE_URL → store in-memory (i dati non sopravvivono ai riavvii).");
}

await run("pnpm", ["exec", "tsx", "src/index.ts"]);
