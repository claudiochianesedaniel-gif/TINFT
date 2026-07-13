# TINFT — Script di presentazione investitori (5 minuti)

> Apri il sito Netlify (o `app-live.html` su Render per la demo in tempo reale).
> Login demo: `cli@tinft.io` / `org@tinft.io` — password `demo123`.
> Regola d'oro: **una frase per schermata**, lascia parlare la demo. Ogni numero mostrato è la regola reale, non un mockup.

---

## 0 · Apertura (20s)
"TINFT è biglietteria dove ogni biglietto è un NFT nominativo. Tutto — acquisto, ingresso, rivendita — passa **solo dall'app**, senza lettori o tornelli esterni. Ve lo faccio vedere dal vivo."

## 1 · Acquisto + prevendita 10% (60s) — "Sito pubblico" → "Web App" (Cliente)
- Scegli un evento → Acquista.
- **Punto chiave:** "Sul primo acquisto c'è una prevendita del **10%**, che va solo a TINFT. È il nostro ricavo primario, trasparente nel checkout."
- Mostra il breakdown Prezzo + Prevendita 10% + Totale.
- "Il limite è **3 biglietti per evento** per identità (verificata via SPID): anti-bagarinaggio dalla base."

## 2 · Il biglietto e il QR anti-screenshot (45s) — "I miei biglietti"
- Apri il biglietto → mostra il **QR che ruota ogni ~30 secondi**.
- "Uno screenshot non serve a nulla: il codice scade in secondi. Il biglietto è nominativo e vive nel wallet dell'utente."

## 3 · Ingresso + BURN (le due frasi più importanti) (60s) — profilo Validatore
- Aggancia il varco per **codice** (es. `NOTTE-7K2`) — "lo staff non sceglie da una lista, si collega al varco con un codice; niente hardware dedicato."
- Scansiona il QR → **VALID**.
- **Frase chiave:** "All'ingresso il biglietto normale viene **bruciato**: ticket e NFT distrutti. Non è più rivendibile né duplicabile. È la fine del secondary market illecito."
- Torna al biglietto del cliente → ora è **"Bruciato al varco"**, senza più i bottoni Rivendi/Esporta.
- Mostra rapidamente gli altri esiti scansione: **DUPLICATO · SCREENSHOT · ESCROW · FALSO** + "offline = validazione sospesa, mai un valido offline."

## 4 · Rivendita controllata + commissioni (60s) — Mercato
- Metti in vendita un biglietto attivo.
- **Punti chiave:**
  - "Tetto di rivendita **+5%** sul prezzo pagato: niente prezzi gonfiati."
  - "Fee di rivendita **1%**: su un biglietto **attivo** va **tutta a TINFT**; su un NFT da collezione **dopo** l'evento si divide **0,5% TINFT + 0,5% organizzatore**."
  - "Il trasferimento avviene in **escrow**: il compratore paga, il token si sblocca in un'unica transazione. Zero fiducia richiesta tra sconosciuti."
- "Signature 1/1 dell'organizzatore: **non si bruciano mai**, restano da collezione. Nuovo ricavo per i club."

## 5 · Lato organizzatore (40s) — Console
- Dashboard incassi: **lordo / commissioni / netto**.
- Varchi: codice per evento con **Ruota** e **Revoca** + **promemoria email** ai possessori.
- Onboarding **Stripe** del club (eventi pubblicabili solo a onboarding completo).

## 6 · Chiusura (30s)
"Riassumo i ricavi: prevendita 10%, royalty 1% enforced on-chain, fee export 25%, più i Signature. Il contratto è **già deployato su Base Sepolia**, il backend è testato (**contratti 92 test, API 194 test** verdi). Quello che avete visto non è un mockup: è la logica reale."

---

## Domande probabili + risposta secca
- **"Serve che l'utente capisca di crypto/wallet?"** No — wallet **custodial**, login biometrico, niente seed né gas. Paga in euro con carta.
- **"Come guadagnate?"** Prevendita 10% + royalty 1% + fee export 25% + Signature. Tutto enforced dal contratto, non aggirabile.
- **"E il bagarinaggio?"** Tetto +5%, max 3/evento per identità SPID, e soprattutto **burn all'ingresso**: il biglietto usato sparisce.
- **"È pronto?"** Testnet sì, oggi. Per il mainnet mancano SPID reale, wallet custodial di produzione e audit — settimane, non mesi.

## Note pratiche
- **Netlify** (statico): gira in **demo offline** con dati simulati — perfetta per il pitch, nessun server da svegliare, sempre reattiva. NON mostra il burn in tempo reale tra ruoli.
- **Backend su Render** (`app-live.html`): dati **persistenti e condivisi** tra i ruoli — il validatore vede l'acquisto del cliente e il burn appare live. Consigliata per la scena "Bruciato al varco".
- Render piano free va in **sleep**: apri l'URL 1-2 minuti prima del pitch, o passa a Starter per quel giorno.
- Di' esplicitamente che siamo su **testnet Base Sepolia** (transazioni reali, denaro finto).

> ⚠️ **Nota go-live prima del pitch**: la versione oggi online su Render (`tinft-api.onrender.com`) è
> **intermedia** — senza burn e con tetto +10%. La scena "Bruciato al varco" e il "+5%" sono corretti
> solo **dopo** il redeploy dal branch canonico e il redeploy del contratto con burn (vedi `GO-LIVE-UNIFICAZIONE.md` §3).
