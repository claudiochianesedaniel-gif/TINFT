# @tinft/api — Backend TINFT (M6+)

Backend per eventi, biglietti, trasferimenti e account dei 4 profili
(cliente · organizzatore · validatore · piattaforma). TypeScript.

## Stato (avvio M6)
- **Modello dati**: [`prisma/schema.prisma`](./prisma/schema.prisma) — derivato da
  `docs/SPEC-VERIFICATA.md` §3, con i collegamenti on-chain (tokenId, collezione, txHash).
- **Regole economiche condivise**: [`src/domain/rules.ts`](./src/domain/rules.ts) — fee di rivendita 1%
  (attivo → TINFT; post-evento split 0,5/0,5), tetto +5%, fee export 25%, prevendita 10%, limite 3/evento, in **centesimi interi** per rispecchiare
  1:1 la matematica dei contratti (test in `rules.test.ts`). È la sorgente unica che evita
  derive tra on-chain e off-chain.
- **Servizio applicativo** ([`src/services/ticketing.ts`](./src/services/ticketing.ts)): i flussi
  dei 4 profili — acquisto primario (prevendita 10%, limite 3/evento), rivendita (tetto +5%, fee 1% condizionale), escrow P2P
  (`createTransfer`/`acceptTransfer`/`reclaimTransfer`), validazione (5 esiti, incl. escrow→accesso negato)
  burn all'ingresso (Signature esenti) ed export del sopravvissuto (free 25% / enforced). Su store in-memory; test in `ticketing.test.ts`.
- **API HTTP** ([`src/http/server.ts`](./src/http/server.ts), Fastify, **CORS** abilitato): account,
  **club ed eventi del club**, **Fidelity del club**, acquisto, biglietti, trasferimenti, validazione,
  export. Testata via `inject` (`server.test.ts`). Modello: organizzatore → più club → eventi;
  Fidelity = carnet del club (consumato dalla validazione).
- **Pagamenti (M7)** ([`src/payments`](./src/payments)): provider PSP-agnostico, checkout in euro e
  **webhook idempotente** che a pagamento riuscito concia il biglietto. Adapter **Stripe reale**
  (`StripeProvider`: `checkout.sessions.create` + verifica firma `constructEvent`, raw body catturato)
  attivabile via `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`; altrimenti `FakeProvider` (CI/dev).
- **Wiring on-chain** ([`src/chain`](./src/chain)): `ChainPort` (+ `FakeChain`). L'acquisto primario
  (`TicketingService.purchasePrimary`, usato da `payOrder` e da `/events/:id/purchase`) e il webhook
  pagamenti eseguono il **mint** e salvano `tokenId`/`txHash` reali sul biglietto. Adapter **reale
  `viem`** (`ViemChain`→`TinftTicket.mint`, `onlyOwner`: il backend firma con la chiave del deployer)
  **verificato con un e2e contro anvil** (`scripts/chain-e2e.sh`: deploy + mint + `ownerOf`). L'API usa
  il mint reale se sono presenti `CHAIN_RPC_URL` / `CHAIN_PRIVATE_KEY` / `TICKET_ADDRESS`, altrimenti il
  fake (default, deterministico per i test). L'`eventId` off-chain è mappato a un `uint` on-chain in
  modo deterministico dall'adapter (`ViemChain.referenceToOnchainId`).
  - **On-chain reale (Base Sepolia)**: 1) deploya i contratti — `forge script contracts/script/Deploy.s.sol
    --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast` (richiede
    `TINFT_PAYEE`/`ORGANIZER_PAYEE`); 2) prendi l'indirizzo `TinftTicket` dai log; 3) avvia il backend con
    `CHAIN_RPC_URL=$BASE_SEPOLIA_RPC_URL`, `CHAIN_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY` (l'owner del contratto)
    e `TICKET_ADDRESS=<indirizzo>`.
- **Identità SPID (M8, fondamenta)** ([`src/identity`](./src/identity)): `IdentityVerifier`
  (+ `FakeSpid`); `POST /identity/spid/verify` lega `hash(CF)` al wallet (on-chain mai il CF in
  chiaro) e abilita il limite 3/evento. Adapter OIDC reale via aggregatore come innesto.

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
