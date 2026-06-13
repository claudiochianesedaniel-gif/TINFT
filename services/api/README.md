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

## Comandi
```bash
pnpm --filter @tinft/api typecheck
pnpm --filter @tinft/api test
```

## Prossimi step M6
- Attivazione runtime: `PrismaClient` + PostgreSQL (docker-compose), migrazioni.
- API REST per i 4 profili (eventi, biglietti, trasferimenti, account) sopra al modello dati.
- Job: `pagamento→mint` e settlement escrow (si aggancia ai contratti M1–M5).
- Integrazione CI con un servizio Postgres per i test e2e.

Stack previsto: NestJS + Prisma + Redis/BullMQ (cfr. README di progetto).
