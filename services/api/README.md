# @tinft/api — Backend TINFT (M6+)

Backend per eventi, biglietti, trasferimenti e account dei 4 profili
(cliente · organizzatore · validatore · piattaforma). TypeScript.

## Stato (avvio M6)
- **Modello dati**: [`prisma/schema.prisma`](./prisma/schema.prisma) — derivato da
  `docs/SPEC-VERIFICATA.md` §3, con i collegamenti on-chain (tokenId, collezione, txHash).
- **Regole economiche condivise**: [`src/domain/rules.ts`](./src/domain/rules.ts) — royalty 1%,
  split 0,5/0,5, tetto +5%, fee 25%, limite 2/evento, in **centesimi interi** per rispecchiare
  1:1 la matematica dei contratti (test in `rules.test.ts`). È la sorgente unica che evita
  derive tra on-chain e off-chain.
- **Servizio applicativo** ([`src/services/ticketing.ts`](./src/services/ticketing.ts)): i flussi
  dei 4 profili — acquisto primario (limite 2/evento), rivendita (tetto +5%), escrow P2P
  (`createTransfer`/`acceptTransfer`/`reclaimTransfer`), validazione (5 esiti, incl. escrow→accesso negato)
  ed export (free 25% / enforced). Su store in-memory; test in `ticketing.test.ts`.
- **API HTTP** ([`src/http/server.ts`](./src/http/server.ts), Fastify): account, eventi, acquisto,
  biglietti, trasferimenti, validazione, export. Testata via `inject` (`server.test.ts`).

## Comandi
```bash
pnpm --filter @tinft/api typecheck
pnpm --filter @tinft/api test
```

## Prossimi step M6
- Persistenza reale: adapter **Prisma + PostgreSQL** dietro la stessa interfaccia dati
  (lo store in-memory resta per i test), migrazioni, docker-compose, Postgres in CI per gli e2e.
- Autenticazione/ruoli sulle route (cliente/organizzatore/validatore/piattaforma).
- Job `pagamento→mint` e settlement escrow agganciati ai contratti M1–M5 (M7).

> Nota: per il runtime HTTP si è scelto **Fastify** (leggero, testabile via `inject` senza
> rete/DB → CI affidabile). Resta compatibile con l'evoluzione verso una struttura più ricca.
