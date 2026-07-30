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
- **Prevendita 10% sul pulsante di acquisto**: il pulsante mostrava il prezzo base; ora mostra il **totale con prevendita** (es. €26,40) + breakdown "Prezzo + prevendita 10% → a TINFT". Il backend addebitava già il 10% (`presaleCommissionCents`, `totalCents = base*1.10`); era solo la label.

## 5 · NFT Signature "a sorpresa" (nuova feature)
- Se l'organizzatore imposta **NFT speciali > 0**, l'evento attiva i **signature drops**.
- A sorpresa il **1° acquirente**, quello a **metà** capienza e **l'ultimo** ricevono un **NFT Signature 1/1** (da collezione, mai bruciato). Il cliente **non sa** se sarà lui.
- Backend gated (`Event.signatureDrops`) → nessun impatto sui test. **Verificato e2e** (cap 3, 1° acquisto → Signature ricevuto).
- App: reveal a sorpresa ("🎁 …") + badge Signature 1/1.
- **Per la demo**: crea evento con **capienza piccola** (es. 3) e NFT speciali ≥ 1 → al 1° acquisto scatta subito.

## 6 · Onboarding Stripe organizzatore
- **Backend**: onboarding Stripe Connect reale (`/clubs/:id/stripe/onboarding-link`) + split fee. Richiede `STRIPE_SECRET_KEY` test su Render per essere reale.
- **App**: card "Pagamenti · Stripe Connect" nella dashboard con **onboarding simulato** (demo, senza chiavi).

## 6-bis · Audit finale (riga per riga) — correzioni economiche
- Lista info: **"4% commissione sul primario"** → **"10% prevendita sul primario (solo TINFT)"** (residuo di vecchia tariffa).
- **Ricevute**: totale calcolato `×1.04` → **`×1.10`** (coerente con la fee 10% mostrata nella stessa riga).
- Copy rivendita (scheda evento, pannello rivendita, FAQ): non dice più "royalty all'organizzatore" sul secondario **prima** dell'evento. Ora: **1% tutta a TINFT prima**; **0,5% + 0,5% dopo**.
- Stat org-facing ("Royalty · 721C", "Royalty secondario"): **0,5%** (royalty organizzatore, solo post-evento).
- Verificato: **nessun residuo** `+10%` / "royalty 10%" in nessuna pagina di `apps/web`.

## 6-ter · @username, locandina, Signature on-chain, Postgres (ultimo blocco)

### @username = l'etichetta dell'utente (clienti e organizzatori)
- **Univoco** e case-insensitive: 3-20 caratteri tra minuscole, cifre, `.` e `_`. Niente omonimi.
- **Registrazione**: il campo "USERNAME PUBBLICO (@)" ora viene salvato davvero; se è già preso o mal formato l'utente lo vede subito (prima l'errore era silenzioso). Obbligatorio per i clienti (se manca viene derivato dall'email), opzionale per gli organizzatori.
- **Profilo**: `@handle` mostrato sotto l'email, per cliente e organizzatore.
- **Regalo/invio biglietto**: si indica il **@username** del destinatario e il biglietto cambia proprietario **sul server** (prima era finto/locale). Consentito solo su biglietto ATTIVO.
- **Verifica manuale al varco**: lo staff cerca per **@username** e vede se quella persona ha un titolo per *quel* varco e se **è già entrata**.
- Handle demo: **@marco**, **@giulia**, **@clubastra**.
- Endpoint: `GET /users/@:username`, `GET /users/username-available?u=`, `POST /accounts/:id/username`, `POST /tickets/:id/transfer`, `GET /gate/lookup?code&username`.

### Locandina
Salvata **nel backend** insieme all'evento (data URL, max 2 MB): sopravvive al refresh e si vede su ogni dispositivo. Formati non immagine o oltre 2 MB vengono rifiutati.

### Signature on-chain
I drop a sorpresa ora sono **NFT reali** coniati con `TinftTicket.mintSpecial` (fuori dal limite 3/evento, mai bruciati). Verificato in live: token 19 `isSpecial=true`.
> **Bug risolto**: due transazioni ravvicinate dallo stesso wallet fallivano (nonce non allineato sull'RPC) — il Signature nasceva senza token on-chain e il burn subito dopo un mint era fragile. Ora le scritture sono serializzate, con nonce esplicito e retry.

### Postgres su Render
Il blueprint crea il database **free** `tinft-db`; le migrazioni girano allo start (`prisma migrate deploy`) e il server non parte se falliscono. **I dati ora sopravvivono ai deploy** (prima si azzeravano). ⚠️ Il piano free di Render viene **eliminato dopo 30 giorni**: per un uso oltre la demo va scelto un piano a pagamento.

## 7 · Test
- Contratti **92/92** · API **213 passed** (+4 test d'integrazione Postgres, verdi su DB reale). Sintassi app verificata (`node --check`).

---

## Cosa resta a design/committente
- Rifinire graficamente le 3 aree mantenendo il design system Netlify (già condiviso da tutti i ruoli).
- Per Stripe reale: chiavi test su Render. Per burn on-chain sui biglietti demo: comprarli dall'app (mint on-chain).
- Postgres su Render: il piano **free scade dopo 30 giorni** → passare a un piano a pagamento se la demo dura di più.
