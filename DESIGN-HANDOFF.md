# TINFT — Handoff DESIGN (rifiniture UX/UI del sito)

Tutto il necessario per rifinire UX/UI **senza toccare la logica**. Le pagine sono HTML
autosufficienti (CSS+JS inline): si aprono col **doppio clic** e funzionano **offline** (dati
finti). Rifinisci pure l'estetica/UX; le **regole di prodotto** qui sotto vanno rispettate.

## File in questo pacchetto
- `apps/web/tinft-demo.html` — **SPA unica più aggiornata** (3 ruoli, aree per ruolo, P.IVA/fatturazione, QR rotante). È il riferimento attuale da rifinire.
- `apps/web/sito.html` — landing/sito vetrina · `app-live.html` — web app cliente · `console.html` — console organizzatore · `registrazione.html`, `demo.html`, `index.html` (launcher).
- `apps/web/tinft.css`, `i18n.js`, `assets/` (`tinft-logo.png`, `mesh.jpg`), `manifest.webmanifest`, `icon.svg`.
- `design_handoff_tinft/` — i **prototipi** (`*.dc.html`: Sito, Web App, Console, **Prototipo App aggiornato**) + `support.js` (runtime DC, NON modificare), `tinft-data.js`, `assets/`.

> ⚠️ **Per far girare il "Prototipo App" collegato all'API reale** servono due file NON nel repo
> (li ha l'ambiente dev/design): `design_handoff_tinft/tinft-api.js` (il wrapper `window.TINFT_API`,
> 27 chiamate) e i poster demo `design_handoff_tinft/assets/ev-vol4.png` · `ev-live.png` · `ev-jazz.png`.
> **Senza di essi il prototipo si apre lo stesso** (support.js + dati mock) per il lavoro di
> **design/UX**; le chiamate live degradano su mock e i poster mostrano il gradiente di fallback.
> Per il collaudo wired-to-backend, reintegrare quei due file.

## Design tokens (v2 — già applicati)
- Sfondo `#0a0a0a`; superfici `#131313` / `#1c1c1c`; bordo `#2a2a2a`.
- Testo `#e8e6e0`; muto `#8a8682`; tenue `#5a5754`.
- Blu `#4472c4` → `#6f9eff` (gradiente primario); verde `#00cc88`; arancio `#ff9900`.
- Font **Quicksand** (400/500/600/700). Raggio **13px**. Stile **flat** (niente ombre pesanti).

## Regole di PRODOTTO da rispettare (non estetiche)
1. **Tre ruoli**: **Cliente**, **Organizzatore**, **Validatore** (validatore = solo ingresso).
2. **"Solo in app" = SOLO la VALIDAZIONE.** Tutto il resto (acquisto, biglietti, mercato, console) è **speculare**: c'è sia su sito che su app.
3. **Organizzatore**: registrazione e creazione club richiedono **P.IVA + dati di fatturazione** (ragione sociale, sede legale, PEC, SDI, IBAN) — obbligatori.
4. **Regole economiche** (mostrarle con chiarezza nei flussi — AGGIORNATE 2026-07):
   - Prevendita **10%** sul **primo** acquisto (solo TINFT, a carico del compratore).
   - Fee di rivendita **1%** sul prezzo originale, **condizionale allo stato del token**:
     **biglietto ATTIVO** (prima della Fine evento — Market Re-Selling) → **tutta a TINFT**;
     **mero NFT** (dopo la Fine evento / già usato — Market Collection) → 0,5% TINFT + 0,5% organizzatore.
   - Tetto rivendita **+5%** (era +10%) · **max 3 biglietti/evento** per identità · export libero **fee 25%**.
5. Biglietto **nominativo** con **QR rotante** (~30s) — anti-screenshot.
6. **Burn all'ingresso (NUOVO, vincolante)**: entrare al varco (esito VALIDO) **brucia** il
   biglietto normale — ticket **e** NFT distrutti: non più rivendibile, collezionabile né
   esportabile. Conseguenze UI: dopo l'uso mostrare il banner *"Hai usato questo titolo per
   entrare: ticket e NFT bruciati al varco"* e **nascondere** ogni azione (Rivendi/Esporta).
   La **rivendita è possibile solo PRIMA della validazione** (non solo "prima della fine evento").
   I **Signature (1/1 speciali)** dell'organizzatore **non si bruciano mai** — restano
   collectible trasferibili anche dopo l'uso. Solo il **mero NFT sopravvissuto** (chi NON è
   entrato, a evento concluso) è esportabile come ricordo.

## NUOVI FLUSSI da disegnare (backend già pronto — riferimento funzionante: `apps/web/app-live.html`)

> Aggiornamento 2026-07: questi flussi esistono e funzionano nell'API e in `app-live.html`
> (aprire con il backend attivo, o in demo offline). Vanno portati nei prototipi `.dc.html`.

1. **Staff / varco — aggancio per CODICE** (mai una lista di eventi): schermata con input
   codice varco (es. `NOTTE-7K2`) → banner "Varco collegato a {evento} · {codice}" + scollega.
   Codice errato/revocato → errore. Demo: `NOTTE-7K2` · `JAZZ-9R3` · `OPEN-5X1`.
2. **Esiti scansione** (5 stati da disegnare): VALIDO ✓ · DUPLICATO (già entrato) ·
   SCREENSHOT (QR scaduto) · ESCROW (in trasferimento) · FALSO. Più lo stato
   "offline — validazione sospesa" (MAI un valido offline).
3. **Console organizzatore — Accessi/Varchi**: codice varco per evento con azioni
   **Ruota** (nuovo codice, il vecchio smette di valere) e **Revoca**; bottone
   **Promemoria email** ai possessori (mostra `inviati/destinatari`).
4. **Onboarding Stripe del club**: stato "in attesa di onboarding" (eventi NON pubblicabili
   finché non completo), CTA "Completa l'onboarding Stripe" (link guidato), stato "attivo".
5. **Login veloce**: bottoni **Sign in with Apple** e **Google** accanto a email+password.
   SPID resta per la verifica identità/18+ al primo acquisto (non al login).
6. **Mercato — copy fee**: sul biglietto attivo la fee 1% va a TINFT; sul collectible
   post-evento 0,5/0,5. Tetto +5% ovunque (etichette, stepper prezzo, errori).
7. **Email transazionali** (se si disegnano template): conferma d'ordine (evento, quantità,
   totale, "QR in app, niente stampe") e promemoria evento.
8. **Biglietto BRUCIATO (stato nuovo)**: nella lista "I miei biglietti" un titolo usato per
   entrare va mostrato come **"Bruciato al varco"** (pill spenta), con banner esplicativo e
   **senza** bottoni Rivendi/Esporta. Distinguere visivamente: Attivo · In vendita · Usato
   (Signature/collectible) · **Bruciato** · Esportato. Riferimento in `apps/web/app-live.html`
   (pill + banner già implementati).

## Aree da rifinire (suggerimenti UX/UI)
- **Onboarding**: selezione ruolo chiara; form organizzatore con fatturazione (validazioni inline, P.IVA 11 cifre); SPID come opzione.
- **Cliente**: lista biglietti + dettaglio con QR animato e countdown; flusso acquisto con breakdown prezzo+10%; mercato (vendi col tetto +10%, compra con royalty), stati vuoti curati.
- **Organizzatore (console)**: dashboard con metriche; club & dati fiscali; creazione evento/tier; incassi (lordo/commissioni/netto); accessi/varchi (con nota "validazione in app").
- **Validatore (web)**: schermata che comunica "validazione solo nell'app", elenco varchi in sola lettura.
- **Trasversale**: responsive/mobile, accessibilità (AgID/WCAG), microcopy IT (+ i18n), errori e loading, coerenza iconografica, motion del QR.

## Come lavorarci
Apri i file col doppio clic (o servili con un qualsiasi static server). Login demo: `cli@tinft.io`,
`org@tinft.io`, `val@tinft.io` (password `demo123`). Niente backend richiesto per il design.

> Da non modificare: regole economiche, ruoli, "solo-app per la validazione", obbligo P.IVA.
> Da rifinire: layout, spaziature, tipografia, motion, copy, componenti, responsive, accessibilità.
