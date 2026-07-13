# TINFT — Ticketing con biglietti-NFT

Piattaforma di biglietteria in cui **ogni biglietto è un NFT nominativo** su L2 EVM.
Vincolo di prodotto fondante: ogni processo (acquisto, validazione, trasferimento,
controllo accessi) avviene **solo via app proprietaria TINFT**, senza device esterni.

## Stato

Fase di **avvio (Livello 2)**: dal prototipo di design all'implementazione reale
(smart contract + backend + pagamenti). La specifica funzionale 1:1 è il bundle di
design, committato qui sotto.

## Specifica (fonte di verità)

La cartella [`design_handoff_tinft/`](./design_handoff_tinft/) contiene la spec 1:1:

- `README.md` — overview prodotto, regole economiche, data model, design tokens.
- `TINFT - Handoff Tecnico Contratto.dc.html` — architettura smart contract (§1–§10).
- `TINFT - Roadmap e Checklist.dc.html` — stato e checklist completa.
- `TINFT - Prototipo App.dc.html` / `Sito Web` / `Console Web` — prototipi UI ad alta fedeltà
  (riferimenti di design da ricreare nello stack target, **non** codice da copiare).
- `PROMPT_CLAUDE_CODE.md` — brief di sviluppo e Definition of Done per milestone.

## Vincoli non negoziabili

- Fee di rivendita **1%** del prezzo originale, a carico del compratore, *enforced* on-chain:
  **biglietto attivo** → 100% a TINFT; **mero NFT** (post-evento) → split **0,5% TINFT + 0,5% organizzatore**.
- Prevendita **10%** sul primo acquisto (solo TINFT, a carico del compratore).
- **Burn all'ingresso**: entrare (VALID) brucia il biglietto normale (ticket+NFT); i **Signature 1/1** no.
- **Escrow** sul P2P a pagamento: lock → pay atomico → reclaim a timeout.
- Tetto rivendita **+5%** per passaggio; fee di rivendita 1% (**biglietto attivo → tutta a TINFT**; post-evento split 0,5/0,5); **max 3 biglietti/evento per identità** (`hash(CF)`).
- **Export** post-evento a scelta: (A) rilascio con fee 25% / (B) enforced con royalty perpetua.
- Custodia **custodial** (account abstraction): niente seed/gas per l'utente.

## Piano di implementazione

Decisioni tecniche prese (delegate dal committente — "la migliore per noi, più sicura
e più semplice per il cliente"):

- **Catena L2**: **Base** (testnet Base Sepolia) — rollup Ethereum (sicurezza ereditata da L1),
  ecosistema account-abstraction + on-ramp euro più maturo, Transfer Validator ERC-721C disponibile.
- **Custodia/wallet**: custodial con **account abstraction (ERC-4337)** — Turnkey + smart account
  (Kernel) + Paymaster, login biometrico, niente seed/gas; recovery legato a SPID. Fallback MVP: Privy.
- **Stack**: monorepo TypeScript (pnpm + Turborepo); contratti Solidity/Foundry (OpenZeppelin +
  Limit Break ERC-721C); backend NestJS + PostgreSQL/Prisma + Redis; app React Native (Expo);
  sito/console Next.js; pagamenti Stripe (poi Nexi); identità SPID via OIDC/aggregatore.

Prima di scrivere il codice di produzione è stata fatta una **verifica 1:1 dei prototipi**
(logica letta riga per riga): vedi [`docs/SPEC-VERIFICATA.md`](./docs/SPEC-VERIFICATA.md) —
regole economiche R1–R10 con riferimenti `file:riga`, macchine a stati, modello dati,
incongruenze rilevate (Q1–Q8) e nodi legali.

Stato attuale: **verifica completata, in attesa di via libera** per avviare M0 (scaffolding + CI)
e M1 (contratto core ERC-721/ERC-721C).
