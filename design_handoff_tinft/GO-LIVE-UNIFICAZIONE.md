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

## 3 · Pipeline GO-LIVE (stato e blocchi)

### ✅ Fatto in questo branch (`claude/new-session-gbkhk3`)
1. **Branch unificato**: la logica aggiornata (burn + tetto +5%) e i **file di deploy**
   (`Dockerfile`, `.dockerignore`, `render.yaml` docker, `deployments/84532.json`) ora vivono
   **sullo stesso branch**. Prima erano separati (logica sul default, deploy solo su `main`).
2. **`apps/web/` = versione aggiornata** (Prototipo App 315 KB, non i 200 KB di `main`).
3. **Test verdi**: contratti **92/92**, API **194 passed + 4 skip** (i 4 skip sono i test
   d'integrazione Postgres, che girano solo con `DATABASE_URL`).

### ⛔ Bloccato — richiede segreti/account del committente (NON eseguibile da qui)
| Passo | Perché è bloccato | Cosa serve |
|---|---|---|
| **Redeploy contratto** con burn su Base Sepolia | l'attuale `0x8704…1F37` NON ha il burn | `CHAIN_RPC_URL` (Alchemy Base Sepolia) + `CHAIN_PRIVATE_KEY` (owner del contratto) → poi `scripts/deploy-base-sepolia.sh` |
| **Aggiornare `TICKET_ADDRESS`** su Render (e in `render.yaml`) | dipende dal redeploy sopra | il nuovo indirizzo del contratto con burn |
| **Deploy su Render** dal branch canonico | serve l'account Render collegato al repo | account Render → New → Blueprint → branch canonico; segreti `sync:false` in dashboard |
| **Push su `main`** (Render auto-deploy) | è un deploy **live** verso l'esterno | conferma esplicita del committente su quale branch far servire a Render+Netlify |

> **Nota deploy live**: pushare su `main` fa partire un auto-deploy pubblico su Render. Per questo il lavoro è stato preparato sul branch canonico `claude/new-session-gbkhk3` e **non** è stato pushato su `main` senza tua conferma. Quando dai l'ok, il fast-forward di `main` sul branch canonico è immediato.

### Ordine consigliato per il go-live
1. Redeploy contratto con burn → annota nuovo `TICKET_ADDRESS`.
2. Aggiorna `render.yaml` + env Render col nuovo indirizzo.
3. Fai servire a **Render e Netlify lo stesso branch/file** → UI identica su entrambi.
4. Esegui il Task 5 di auto-verifica (vedi `SCRIPT-PRESENTAZIONE.md` e la checklist "tempo reale").

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
