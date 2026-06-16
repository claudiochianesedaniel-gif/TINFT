# Persistenza dati — TINFT API

Il backend dipende da un'unica interfaccia **`Store`** (async, `services/api/src/repo/store.ts`) con **due implementazioni**:

| Modalità | Quando | Persistenza |
|---|---|---|
| **In-memory** (`MemoryStore`) | default (`pnpm dev` senza `DATABASE_URL`) | snapshot JSON su file (`.tinft-data.json`), salvataggio periodico + alla chiusura; sopravvive ai riavvii |
| **PostgreSQL** (`PrismaStore`) | quando `DATABASE_URL` è impostata | relazionale su Postgres via Prisma |

`index.ts` sceglie lo store da `DATABASE_URL`. Il percorso in-memory non carica nemmeno `@prisma/client` (import lazy), quindi il prototipo gira senza DB.

## Avviare con PostgreSQL
```bash
# 1) Postgres (docker oppure locale). Esempio docker:
docker compose up -d db                       # vedi docker-compose.yml (tinft/tinft)

# 2) applica le migrazioni + genera il client
cd services/api
export DATABASE_URL=postgresql://tinft:tinft@localhost:5432/tinft
pnpm prisma:deploy                            # applica prisma/migrations (0_init, 1_add_password_hash)
pnpm prisma:generate                          # (postinstall lo fa già su pnpm install)

# 3) avvia in modalità Postgres
DATABASE_URL=$DATABASE_URL pnpm dev           # log: "store: PostgreSQL"
```

## Verificato
- Suite completa su MemoryStore: **87 test** (+ test di integrazione PG saltato senza `DATABASE_URL`).
- Test di integrazione **contro Postgres reale** (`src/repo/prisma-store.it.test.ts`, attivo con `DATABASE_URL`): flusso completo account→club→evento+tier→ordine (prevendita 10%)→pay/mint→mercato (royalty 1%)→validazione→console, con verifica delle righe nel DB.
- Smoke server in modalità Postgres: dati realmente persistiti nelle tabelle (`Account`, `Event`, `Order`, `Ticket`, `Transfer`…); login email/password via colonna `passwordHash`.

## Limitazioni note del percorso Postgres (TODO produzione)
Lo schema relazionale copre le entità di dominio. Restano **in memoria di processo** anche in modalità PG (non ancora mappati su tabelle): **ledger** ricavi piattaforma (derivabile), **pagamenti PSP**, **registrazioni email OTP in attesa**, **dedup webhook**. Sono operativi/transitori; aggiungerli come tabelle dedicate è il passo successivo. I biglietti **Fidelity** (senza evento) non sono supportati sul percorso PG (FK evento obbligatoria).
