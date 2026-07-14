# TINFT — Changelog modifiche (per DESIGN)

> Stato: **live su Render** `https://tinft-api.onrender.com` (backend + app) e su `https://tinft.netlify.app` (stessa app, stesso backend).
> Root di Render = **launcher**: scegli **Console Organizzatore** o **App** (Cliente/Validatore). L'app diretta è su `/app.html`.
> Login demo (`demo123`): `cli@tinft.io`, `cli2@tinft.io`, `org@tinft.io`. Contratto con burn su Base Sepolia: `0x0ecaf2e665256bbc86f8c7c992cbd3d44843db5d`.

## Dove sta il codice
- **App reale (quella che vince)**: `apps/web/app.html` — il Prototipo App di Netlify (Space Grotesk, 3 ruoli) **cablato al backend** via `apps/web/tinft-api.js` (`window.TINFT_API`, BASE = Render).
- **Launcher**: `apps/web/index.html`.
- **Backend**: `services/api` (Fastify + TS). **Contratti**: `contracts` (Foundry).
- I `.dc.html` in questa cartella sono il **riferimento di design system**; l'implementazione viva è `apps/web/`.

---

## 1 · Regole economiche (correnti, enforced)
- **Prevendita 10%** sul 1° acquisto (solo TINFT).
- **Tetto rivendita +5%** (`RESALE_CAP_BPS = 10_500`).
- **Fee rivendita 1%**: biglietto **attivo** → tutta a **TINFT**; **NFT post-evento** → 0,5% TINFT + 0,5% organizzatore.
- **Export libero 25%** (solo NFT sopravvissuto, a evento concluso).
- **Max 3 biglietti/evento** per identità.

## 2 · Burn all'ingresso
- Contratto `TinftTicket.markUsed` → `_burn` dei biglietti **normali** su VALID (`ownerOf` reverte). **Signature esenti**.
- Backend: stato `BURNED` per i normali, `USED` per i Signature.
- **Provato on-chain live**: normale → `ownerOf` reverte; Signature → resta.

## 3 · UI unificata (Netlify) su Render
- Render serve **gli stessi file** dell'app di Netlify → una sola app, 3 ruoli, stesso design system, same-origin verso l'API (no CORS).
- Launcher su root per scegliere **Console** o **App**.

## 4 · Fix applicati all'app (`app.html`)
- **Mercato/rivendita**: leggeva il campo prezzo sbagliato → mostrava €0. Ora legge `askPriceCents` → **prezzo reale** (es. €24), **Commissione TINFT 1%**, tetto +5%. Rimosso "Acquisto simulato" → "Trasferimento in escrow".
- **Burn lato cliente**: stato `BURNED` → badge **"Bruciato al varco"**, spariscono Rivendi/Esporta. **Polling 7s** → il cliente lo vede in tempo reale dopo la validazione (senza refresh).
- **Regala**: un biglietto bruciato/usato/esportato/in vendita **non è più trasferibile**.
- **Codice varco nuovi eventi**: l'app passa il `gateCode` reale al backend (createEvent) e lo legge da `/events`; il validatore ricarica gli eventi → **trova subito i codici nuovi**. (Verificato e2e.)
- **Locandina**: l'immagine caricata dall'organizzatore ora è conservata (data URL) e **mostrata** come arte dell'evento.
- **Ricerca manuale al varco**: riferita allo **username TINFT** (@utente) per evitare omonimi.
- **Dashboard**: "Royalty · 721C" 10% → **1%**; badge stati biglietto: Attivo · In vendita · **Signature 1/1** · **Bruciato al varco** · Usato(Signature) · Esportato.

## 5 · NFT Signature "a sorpresa" (nuova feature)
- Se l'organizzatore imposta **NFT speciali > 0**, l'evento attiva i **signature drops**.
- A sorpresa il **1° acquirente**, quello a **metà** capienza e **l'ultimo** ricevono un **NFT Signature 1/1** (da collezione, mai bruciato). Il cliente **non sa** se sarà lui.
- Backend gated (`Event.signatureDrops`) → nessun impatto sui test. **Verificato e2e** (cap 3, 1° acquisto → Signature ricevuto).
- App: reveal a sorpresa ("🎁 …") + badge Signature 1/1.
- **Per la demo**: crea evento con **capienza piccola** (es. 3) e NFT speciali ≥ 1 → al 1° acquisto scatta subito.

## 6 · Onboarding Stripe organizzatore
- **Backend**: onboarding Stripe Connect reale (`/clubs/:id/stripe/onboarding-link`) + split fee. Richiede `STRIPE_SECRET_KEY` test su Render per essere reale.
- **App**: card "Pagamenti · Stripe Connect" nella dashboard con **onboarding simulato** (demo, senza chiavi).

## 7 · Test
- Contratti **92/92** · API **194 passed + 4 skip** (Postgres-gated). Sintassi app verificata (`node --check`).

---

## Cosa resta a design/committente
- Rifinire graficamente le 3 aree mantenendo il design system Netlify (già condiviso da tutti i ruoli).
- Per Stripe reale: chiavi test su Render. Per burn on-chain sui biglietti demo: comprarli dall'app (mint on-chain).
- Signature on-chain (ora il drop è a livello store): opzionale, `mintSpecial` sul contratto esiste già.
