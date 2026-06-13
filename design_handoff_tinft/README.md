# Handoff: TINFT — Ticketing NFT (App, Sito, Console)

## Overview
TINFT è una piattaforma di biglietteria in cui ogni biglietto è un **NFT nominativo** su blockchain L2. Vincolo di prodotto fondante: **ogni processo** (acquisto, validazione, trasferimento, controllo accessi) avviene **solo via smartphone con l'app proprietaria TINFT** — nessun lettore o device esterno. Il modello di custodia scelto è **chiuso/enforced** durante la vita "viva" del biglietto, con uscita opzionale dopo l'evento.

Questo pacchetto serve a portare i prototipi di design e le regole di prodotto in un'implementazione reale (Livello 2): smart contract + backend + pagamenti.

## About the Design Files
I file `.dc.html` in questo bundle sono **riferimenti di design realizzati in HTML** — prototipi che mostrano look e comportamento previsti, **non codice di produzione da copiare**. Il compito è **ricreare questi design nell'ambiente del codebase target** (React/Vue/SwiftUI/native) usando i suoi pattern e librerie; se non esiste ancora un ambiente, scegliere il framework più adatto. La logica economica e i flussi modellati nei prototipi vanno tradotti 1:1 in contratto + backend.

Per aprire i prototipi servono `support.js`, `tinft-data.js` e la cartella `assets/` (inclusi). Mondo condiviso demo via `localStorage['tinft_world']` + `BroadcastChannel('tinft_world')` (solo per la demo; in produzione lo sostituisce il backend).

## Fidelity
**High-fidelity.** Colori, tipografia, spaziature e interazioni sono definitivi. Ricreare le UI fedelmente con le librerie del codebase.

## Surfaces / Schermate
1. **App mobile** (`TINFT - Prototipo App.dc.html`) — la superficie principale. Quattro profili:
   - **Cliente**: home/wallet, eventi, acquisto (intestazione nominativa + pagamento), biglietti, check-in con **QR rotante (5s)**, trasferimento P2P, mercato secondario, export NFT, registrazione **SPID + codice fiscale**.
   - **Validatore**: profilo separato (login con codice varco creato dall'organizzatore), **solo scansione**; esiti: valido / screenshot-scaduto / già usato / falso / in-escrow; modalità **offline** con coda di sync tra varchi; storico per telefono.
   - **Organizzatore**: dashboard, crea evento, incassi (con royalty P2P), accessi live, gestione validatori, holder.
   - **TINFT Piattaforma**: console interna ricavi aggregati multi-organizzatore.
2. **Sito Web** (`TINFT - Sito Web.dc.html`) — vetrina pubblica + acquisto che deposita il biglietto nel wallet.
3. **Console Web** (`TINFT - Console Web.dc.html`) — dashboard organizzatore desktop, con barra **LIVE** che riflette il mondo condiviso.

## Regole economiche (da implementare 1:1)
- **Royalty trasferimento: 1% del prezzo originale**, a carico del **compratore**, spaccata **0,5% TINFT + 0,5% organizzatore**. Garantita solo dentro il sistema enforced.
- **Escrow P2P a pagamento**: il token è trattenuto finché il compratore paga; release atomico (token↔fondi); **timeout** → ritorno al venditore.
- **Trasferimento doppio**: Regalo (gratis) / A pagamento (con escrow).
- **Tetto rivendita: +5%** per passaggio sul prezzo pagato dal venditore (base di costo che viaggia col token).
- **Limite acquisto: max 2 biglietti per evento per identità** (legato a `hash(codice fiscale)`).
- **Export post-evento (scelta del cliente, definitiva)**: (A) **rilascio completo** con **fee d'uscita 25%** una tantum → NFT libero, fuori dalla rete royalty; (B) **export enforced** → resta legato alla policy, royalty 1% per sempre.
- **Validazione**: la scansione marca il token come `usato` (collectible). Un token in escrow/trasferimento è **bloccato al varco**.

## Livello 2 — piano di build
### B · Smart contract (L2: Polygon PoS o Base)
- `ERC-721` + **ERC-721C** (Creator Token Standard) con **Transfer Validator** + allowlist operatori → royalty enforced anche su trasferimenti P2P.
- **Split contract** royalty 0,5% / 0,5% (EIP-2981 per i marketplace conformi + enforcement via validator).
- **Escrow contract**: `list()` (lock), `pay()` (release atomico con split royalty), `reclaim()` (timeout).
- Stato per-token: `paid` (base costo), `eventId`, `exportMode`. Controlli on-chain: prezzo ≤ `paid*1.05`; `count(hash(CF), eventId) ≤ 2`.
- `exportFree()` (incassa 25%, rimuove dalla policy → self-custody) / `exportEnforced()` (resta enforced).
- **Audit di sicurezza** prima del mainnet.

### C · Wallet & custodia
- Wallet **custodial** via account abstraction (ERC-4337) o MPC; utente senza seed/gas.
- **Paymaster** per gas sponsorizzato. Recovery account legato a identità SPID.

### D · Pagamenti
- **PSP** (Stripe/Nexi): checkout euro (carta/Apple Pay).
- Backend + **webhook**: pagamento riuscito → mint / release escrow on-chain.
- **Payout venditori** sul secondario (richiede KYC venditore). Rimborsi/chargeback.

### E · Identità & compliance
- Integrazione **SPID reale** (OIDC). CF cifrato off-chain, solo `hash` on-chain. GDPR, AML sui payout.

### F · Legale
- Inquadramento custodia asset; validazione legale del tetto anti-bagarinaggio; fiscale (IVA su royalty/fee).

## Data model (riferimento dal prototipo)
- **Ticket**: `{ id, owner, eventId, type, title, venue, price (face), paid (cost basis), status: attivo|usato|vendita|exported, exportMode: free|enforced, exitFee }`
- **Transfer**: `{ id, fromUser, toUser, mode: regalo|pagamento, prezzo, royalty (royC+royT), status: pending|escrow|done, createdAt, ttl }`
- **Account**: `{ nome, cognome, email, cf, verified (SPID), goodwill }`

## Design tokens
- **Font**: Space Grotesk (display/heading), IBM Plex Sans (UI/body), IBM Plex Mono (label/kicker).
- **Sfondo app/scuro**: `#06070c` / `#0a0c12`; superfici `oklch(0.16 0.015 265)`; bordi `oklch(0.26 0.02 265)`.
- **Accento primario (viola/blu)**: `oklch(0.62 0.17 264)` → `oklch(0.5 0.15 264)`.
- **Semantica**: successo/verde `oklch(0.74 0.16 158)`; warning/ambra `oklch(0.8 0.13 70)`; errore/rosso `oklch(0.72 0.13 25)`; piattaforma/viola `oklch(0.55 0.16 300)`.
- **Radius**: card 16–22px, pill 999px. **Mono label**: 9–11px, letter-spacing 0.1–0.24em.

## Assets
- `assets/tinft-logo.png` — logo TINFT.
- `assets/mesh.jpg` — texture (se usata).
- Immagini evento: nei prototipi sono placeholder a gradiente; in produzione usare artwork reali.

## Files (in questo bundle)
- `TINFT - Prototipo App.dc.html` — app (tutti i profili e flussi).
- `TINFT - Sito Web.dc.html` — sito pubblico.
- `TINFT - Console Web.dc.html` — console organizzatore.
- `TINFT - Handoff Tecnico Contratto.dc.html` — spec architetturale del contratto (dettaglio §1–§10).
- `TINFT - Roadmap e Checklist.dc.html` — stato e checklist completa del progetto.
- `support.js`, `tinft-data.js`, `assets/` — runtime e dati demo necessari ad aprire i prototipi.

> I prototipi sono la **specifica funzionale 1:1**. Partire da contratto (B) e pagamenti (D): sono sul percorso critico e interdipendenti.
