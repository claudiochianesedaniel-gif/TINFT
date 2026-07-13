# ✅ Checklist DESIGN — TINFT (da allegare ai file di handoff)

> Cosa disegnare/rifinire, ordinato. Il **backend è pronto** per tutto ciò che segue e
> `apps/web/app-live.html` è il **riferimento funzionante** (comportamenti reali già cablati).
> Regole di prodotto e token: vedi `DESIGN-HANDOFF.md`. Non toccare: regole economiche,
> ruoli, "solo-app per la validazione", obbligo P.IVA, e la regola **burn**.

## 0 · Setup (una volta)
- [ ] Aprire i `.dc.html` nell'ambiente Design Component (serve `support.js`, incluso).
- [ ] Per il wiring live del *Prototipo App*: `tinft-api.js` è incluso; impostare l'URL API con
      `window.TINFT_API_BASE` (o `?api=`) — default `http://localhost:3001`.
- [ ] Reintegrare i poster demo mancanti: `assets/ev-vol4.png` · `ev-live.png` · `ev-jazz.png`
      (senza, si vede il gradiente di fallback — ok per il design puro).

## 1 · Regole economiche nuove (copy da aggiornare ovunque)
- [ ] Prevendita **10%** sul primo acquisto (solo TINFT) — breakdown nel checkout.
- [ ] Fee di rivendita **1%**: biglietto **ATTIVO** → tutta a **TINFT**; **mero NFT** post-evento → **0,5% + 0,5%**.
- [ ] Tetto rivendita **+5%** (non più +10%): etichette, stepper prezzo, messaggi d'errore.
- [ ] Export libero **fee 25%** (solo per il mero NFT sopravvissuto, vedi §4).

## 2 · Staff / Varco (validatore) — solo-app, solo-online
- [ ] Schermata **aggancio per CODICE** (input codice varco, mai una lista eventi).
      Codici demo: `NOTTE-7K2` · `JAZZ-9R3` · `OPEN-5X1`.
- [ ] Banner **"Varco collegato a {evento} · {codice}"** + azione "Scollega".
- [ ] Stato **codice errato/revocato** → errore chiaro.
- [ ] **5 esiti scansione** con stati visivi distinti: **VALIDO ✓** · **DUPLICATO** (già entrato) ·
      **SCREENSHOT** (QR scaduto) · **ESCROW** (in vendita/trasferimento) · **FALSO**.
- [ ] Stato **"offline — validazione sospesa"** (mai un VALIDO offline).
- [ ] QR possessore = token a **rotazione ~30s** (motion/countdown).

## 3 · Burn all'ingresso (regola NUOVA, vincolante)
- [ ] Dopo l'ingresso (VALIDO) mostrare stato **"Bruciato al varco"** (pill spenta).
- [ ] Banner: *"Hai usato questo titolo per entrare: ticket e NFT bruciati al varco"*.
- [ ] **Nascondere** ogni azione su un biglietto bruciato (Rivendi / Esporta / Regala).
- [ ] Distinguere gli stati biglietto: **Attivo · In vendita · Usato** (Signature) **· Bruciato · Esportato**.
- [ ] **Signature (1/1)**: badge "collectible", NON si brucia, resta trasferibile anche dopo l'uso.
- [ ] Creazione evento: nota "i biglietti normali si bruciano all'ingresso; gli NFT Signature no".

## 4 · Cliente — biglietti & mercato
- [ ] "I miei biglietti": QR animato + countdown; stati sopra; azioni contestuali.
- [ ] Rivendita possibile **solo prima della validazione** (dopo il burn niente).
- [ ] Mercato: **Re-Selling** (biglietti attivi) vs **Collection** (meri NFT post-evento) — copy fee diverso.
- [ ] Export "NFT ricordo": disponibile **solo** per chi NON è entrato, a evento concluso.
- [ ] Stati vuoti curati (nessun biglietto / mercato vuoto).

## 5 · Organizzatore (console)
- [ ] **Onboarding Stripe** del club: stati "in attesa" (eventi non pubblicabili) → CTA "Completa onboarding" → "attivo".
- [ ] Crea evento → Pubblica; **fasce prezzo** (tier); **codice varco** generato/mostrato.
- [ ] **Accessi/Varchi**: per ogni evento il codice con **Ruota** (nuovo, il vecchio scade) e **Revoca**.
- [ ] **Promemoria email** ai possessori (feedback `inviati/destinatari`).
- [ ] **Concludi evento** ("Fine evento"): da qui i non-usati diventano meri NFT esportabili.
- [ ] Dashboard: incassi (lordo/commissioni/netto), ingressi live, holder.

## 6 · Onboarding & login
- [ ] Selezione ruolo chiara.
- [ ] Form organizzatore con **P.IVA + fatturazione** (validazioni inline, P.IVA 11 cifre).
- [ ] **Login veloce**: bottoni **Sign in with Apple** e **Google** accanto a email+password.
- [ ] **SPID** per verifica identità/età 18+ al primo acquisto (non al login).

## 7 · Trasversale
- [ ] **Sito ↔ App speculari** (stessi flussi, tranne la validazione che è solo-app).
- [ ] Responsive/mobile; accessibilità **AgID/WCAG**; microcopy IT (+ i18n).
- [ ] Errori e loading curati; coerenza iconografica; motion del QR.
- [ ] Email transazionali (se si disegnano): conferma d'ordine + promemoria evento.

---
*Riferimento comportamentale: `apps/web/app-live.html` (aprire col backend attivo). Regole complete: `DESIGN-HANDOFF.md`.*
