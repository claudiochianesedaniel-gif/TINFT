# Persistenza dati — TINFT API

## Stato attuale
- **Runtime di default: in-memory** (`services/api/src/repo/memory.ts`). È completamente coperto dai test (vitest) ed è la sorgente di verità per CI e sviluppo locale rapido. Affidabile e deterministico.
- **Persistenza Postgres: pronta e verificata a livello di schema.**
  - Schema: `services/api/prisma/schema.prisma` — validato con `prisma validate` ✅.
  - Client tipizzato: generabile con `prisma generate` ✅ (`@prisma/client` è già in dipendenze).
  - Migrazione iniziale: `services/api/prisma/migrations/0_init/migration.sql` — generata da Prisma (11 enum + 14 tabelle + indici + 16 foreign key), applicabile con `prisma migrate deploy`.

## Avviare Postgres in locale
```bash
# 1) DB via docker compose (dalla root del repo)
docker compose up -d db                     # Postgres 16 su localhost:5432 (tinft/tinft)

# 2) applica lo schema
cd services/api
export DATABASE_URL=postgresql://tinft:tinft@localhost:5432/tinft
pnpm prisma:deploy                          # esegue prisma/migrations
pnpm prisma:studio                          # (opzionale) ispeziona i dati
```
Le stesse variabili sono in `.env.example` (`DATABASE_URL`).

## Passo finale per far persistere l'app su Postgres
I servizi applicativi (`src/services/*.ts`) oggi leggono/scrivono sullo store **in modo sincrono** (Map in memoria), mentre Prisma è **asincrono**. Per far sì che l'app usi davvero Postgres serve:
1. estrarre un'interfaccia `Store` (già di fatto implementata da `MemoryStore`);
2. implementare un `PrismaStore` che la soddisfa con query Prisma;
3. rendere **async** i metodi dei servizi (e gli handler già lo sono) e aggiornare i test;
4. selezionare lo store da `DATABASE_URL` (presente → `PrismaStore`, assente → `MemoryStore`).

È un refactor ampio e va fatto **con il DB attivo e i test eseguiti contro Postgres** (non alla cieca), per non intaccare l'affidabilità del runtime in-memory già testato. Lo schema, la migrazione e il client sono già pronti, quindi il lavoro residuo è il cablaggio del repository + la conversione async.
