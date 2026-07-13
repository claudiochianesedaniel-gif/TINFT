# TINFT — GO-LIVE · Unificazione UI + logica (handoff DESIGN)

> Documento operativo per la demo investitori. Riassume **cosa è già pronto nel repo**,
> **cosa deve fare Design**, e **cosa resta bloccato su segreti/account** (azione del committente).
> Da leggere insieme a `DESIGN-HANDOFF.md` (regole) e `CHECKLIST-DESIGN.md` (cosa disegnare).

---

## 0 · La regola d'oro dell'UI — Netlify è la fonte di verità

L'interfaccia ufficiale voluta dal committente è quella online su **`https://tinft.netlify.app`**
(Console organizzatore: Dashboard incassi, Eventi & Vendite, Accessi, nav mobile in basso).
**Quella UI/UX vince su tutto** — prototipi `.dc.html` e versione attuale di Render inclusi.

**La STESSA UI/UX di Netlify va usata per TUTTI E TRE i ruoli — Cliente, Organizzatore, Validatore.**
Non tre interfacce diverse: **una sola app, tre aree di contenuto**. Stesso design system ovunque:

- stessi **colori** e **tipografia** (Quicksand, palette scura `--bg #0a0a0a` / blu `--blue2 #6f9eff` / verde `--green #00cc88` / oro `--gold #ffcf80`);
- stessi **componenti**: card, stat, **pill di stato**, bottoni, tabelle;
- stessa **navigazione** (bottom nav mobile) e stesse **spaziature**;
- stesso **motion** e **microcopy** (IT).

Se oggi Cliente/Validatore hanno un aspetto diverso dalla Console di Netlify, vanno **riportati** a quello stile. **Vince Netlify.**

> Riferimento tecnico dei token colore/tipografia: `apps/web/index.html` (`:root{--bg…}`) e i `.dc.html`.

---

## 1 · La logica è GIÀ pronta e testata (non va reinventata)

Design applica solo l'**UI**; la **logica** è già nel branch canonico e verde ai test.

| Regola | Stato nel repo | Dove si vede in UI |
|---|---|---|
| **Prevendita 10%** (solo TINFT) sul 1° acquisto | ✅ contratti + backend | breakdown nel checkout |
| **Tetto rivendita +5%** (`RESALE_CAP_BPS = 10_500`) | ✅ `TinftEscrow.sol` + `rules.ts` | stepper prezzo, label, errori "+5%" |
| **Fee rivendita 1%** (attivo → tutta TINFT; NFT post-evento → 0,5/0,5) | ✅ contratti + backend | copy fee in Mercato |
| **Burn all'ingresso** (`markUsed`→`_burn` sui normali; Signature esenti) | ✅ `TinftTicket.sol` + backend | stato "Bruciato al varco" |
| **Export 25%** (solo NFT sopravvissuto, a evento concluso) | ✅ | azione Export |
| **Max 3 biglietti/evento** per identità | ✅ | limite in acquisto |

### Stati biglietto da distinguere visivamente (pill)
`Attivo` · `In vendita` · `Usato` (solo **Signature**) · **`Bruciato`** · `Esportato`.

- Dopo il **VALID** al varco, il biglietto **normale** → **"Bruciato al varco"** (pill spenta) e
  **spariscono Rivendi/Esporta/Regala**. Banner: *"Hai usato questo titolo per entrare: ticket e NFT bruciati al varco."*
- I **Signature (1/1)** NON si bruciano: badge "collectible", restano trasferibili → stato `Usato`, non `Bruciato`.

---

## 2 · Collegamento al backend reale (validatore in tempo reale)

Per la demo "tempo reale" (il validatore scansiona → il cliente vede subito **"Bruciato al varco"**)
serve il **backend su Render**, NON il Netlify statico.

- Pagina connessa: **`apps/web/app-live.html`** (già cablata al server).
- Wrapper API pronto: **`tinft-api.js`** → espone `window.TINFT_API`.
  URL API configurabile via `window.TINFT_API_BASE`, `<meta name="tinft-api-base">` o `?api=`.
- `demo.html` / `tinft-demo.html` = modalità **offline** (dati simulati): ok per un pitch senza server, ma **non** mostrano il burn in tempo reale tra ruoli.

> Se il cliente non vede il burn: si sta usando `demo.html` invece di `app-live.html`, oppure il frontend punta a un'altra API (`?api=` / meta).
> CORS: servire il frontend **dallo stesso URL Render** del backend (il `Dockerfile` lo fa già: serve `apps/web` da `WEB_DIR`).

---

## 3 · Pipeline GO-LIVE — **COMPLETATA** ✅

### ✅ Fatto e LIVE
1. **Branch unificato**: logica aggiornata (burn + tetto +5%) + file di deploy
   (`Dockerfile`, `.dockerignore`, `render.yaml` docker, `deployments/84532.json`)
   sullo stesso branch; `main` = branch canonico.
2. **Contratto rideployato CON burn** su Base Sepolia (chain 84532):
   - **TinftTicket** = `0x0ecaf2e665256bbc86f8c7c992cbd3d44843db5d`
   - TinftEscrow = `0xd67976f3fd7f66655768fbfac7c812d2ec97de36`
   - TinftTransferValidator = `0x67d2a46f41a211509c5f7a8ed8f9c88b435f70c9`
   - TinftRoyaltySplit = `0x82ffea524da8935039fa0479e41ac6ce0c2c6280`
3. **Render live** (`https://tinft-api.onrender.com`): env `TICKET_ADDRESS`,
   `CHAIN_RPC_URL`, `CHAIN_PRIVATE_KEY` impostate → mint/burn on-chain reali attivi.
4. **Stessa UI di Netlify su Render**: Render serve gli stessi file dell'app di
   `tinft.netlify.app` (Prototipo App, 3 ruoli, stesso design system), same-origin verso l'API.
5. **Launcher** sulla root di Render: scelta **Console Organizzatore** o **App** per la demo
   (l'app unificata resta su `app.html`).
6. **Test verdi**: contratti **92/92**, API **194 passed + 4 skip** (Postgres-gated).

### ✅ Prova on-chain (Task 5, punto 7) — DIMOSTRATA sul contratto live
- Biglietto **normale**: dopo `markUsed` → `_burn` → `ownerOf` **reverte** (`ERC721NonexistentToken`), `used=true`.
- Biglietto **Signature**: dopo `markUsed` → `used=true` ma **NON bruciato** (`ownerOf` resta valido).

### Facoltativo (a cura del committente)
- Collegare il progetto **Netlify** al branch `main` se si vuole che Netlify serva dal repo
  (non necessario: la `tinft-api.js` di Netlify punta già al backend Render, quindi è già coerente).
- Passare Render al piano **Starter** il giorno del pitch per togliere il cold-start del free.

---

## 4 · Cosa consegno a Design (contenuto cartella)

- `TINFT - Prototipo App.dc.html` (315 KB, aggiornato: burn, +5%, stati, niente workaround)
- `TINFT - Web App.dc.html`, `TINFT - Sito Web.dc.html`, `TINFT - Console Web.dc.html`
- `TINFT - Specifica Tecnica.dc.html`, `TINFT - Handoff Tecnico Contratto.dc.html`, `TINFT - Roadmap e Checklist.dc.html`
- `tinft-api.js` (wrapper API reale), `support.js`, `tinft-data.js`, `assets/`
- `DESIGN-HANDOFF.md` (regole), `CHECKLIST-DESIGN.md` (cosa disegnare)
- **questo file** `GO-LIVE-UNIFICAZIONE.md` (unificazione UI 3 ruoli + pipeline)
- `SCRIPT-PRESENTAZIONE.md` (script pitch 5 min, numeri test corretti)

> **Priorità Design #1**: portare Cliente e Validatore allo **stesso design system della Console Netlify**.
> Tutto il resto (regole, copy, stati) è già specificato: la logica non si tocca, si veste.
