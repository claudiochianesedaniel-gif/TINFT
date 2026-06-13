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

- Royalty trasferimento **1%** del prezzo originale, a carico del compratore,
  split **0,5% TINFT + 0,5% organizzatore**, *enforced* on-chain.
- **Escrow** sul P2P a pagamento: lock → pay atomico → reclaim a timeout.
- Tetto rivendita **+5%** per passaggio; **max 2 biglietti/evento per identità** (`hash(CF)`).
- **Export** post-evento a scelta: (A) rilascio con fee 25% / (B) enforced con royalty perpetua.
- Custodia **custodial** (account abstraction): niente seed/gas per l'utente.

## Piano di implementazione

Lo stack, la struttura del repo, la scelta L2 e il piano a milestone sono in proposta
e **in attesa di approvazione** prima di iniziare a scrivere il codice di produzione.
