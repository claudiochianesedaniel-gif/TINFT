# TINFT — Handoff DESIGN (rifiniture UX/UI del sito)

Tutto il necessario per rifinire UX/UI **senza toccare la logica**. Le pagine sono HTML
autosufficienti (CSS+JS inline): si aprono col **doppio clic** e funzionano **offline** (dati
finti). Rifinisci pure l'estetica/UX; le **regole di prodotto** qui sotto vanno rispettate.

## File in questo pacchetto
- `apps/web/tinft-demo.html` — **SPA unica più aggiornata** (3 ruoli, aree per ruolo, P.IVA/fatturazione, QR rotante). È il riferimento attuale da rifinire.
- `apps/web/sito.html` — landing/sito vetrina · `app-live.html` — web app cliente · `console.html` — console organizzatore · `registrazione.html`, `demo.html`, `index.html` (launcher).
- `apps/web/tinft.css`, `i18n.js`, `assets/` (`tinft-logo.png`, `mesh.jpg`), `manifest.webmanifest`, `icon.svg`.
- `design_handoff_tinft/` — i **prototipi originali** (`*.dc.html`: Sito, Web App, Console, Prototipo App) = riferimento visivo di partenza, + README/Specifica/Roadmap.

## Design tokens (v2 — già applicati)
- Sfondo `#0a0a0a`; superfici `#131313` / `#1c1c1c`; bordo `#2a2a2a`.
- Testo `#e8e6e0`; muto `#8a8682`; tenue `#5a5754`.
- Blu `#4472c4` → `#6f9eff` (gradiente primario); verde `#00cc88`; arancio `#ff9900`.
- Font **Quicksand** (400/500/600/700). Raggio **13px**. Stile **flat** (niente ombre pesanti).

## Regole di PRODOTTO da rispettare (non estetiche)
1. **Tre ruoli**: **Cliente**, **Organizzatore**, **Validatore** (validatore = solo ingresso).
2. **"Solo in app" = SOLO la VALIDAZIONE.** Tutto il resto (acquisto, biglietti, mercato, console) è **speculare**: c'è sia su sito che su app.
3. **Organizzatore**: registrazione e creazione club richiedono **P.IVA + dati di fatturazione** (ragione sociale, sede legale, PEC, SDI, IBAN) — obbligatori.
4. **Regole economiche** (mostrarle con chiarezza nei flussi):
   - Prevendita **10%** sul **primo** acquisto (solo TINFT, a carico del compratore).
   - Rivendita: royalty **1%** (0,5% TINFT + 0,5% organizzatore) sul prezzo originale.
   - Tetto rivendita **+10%** · **max 3 biglietti/evento** per identità · export libero **fee 25%**.
5. Biglietto **nominativo** con **QR rotante** (~30s) — anti-screenshot.

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
