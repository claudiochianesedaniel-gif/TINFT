# TIN — Wallet a circuito chiuso per eventi TINFT

Secondo prodotto dell'ecosistema TINFT: un **portafoglio prepagato closed-loop** per gli
eventi. Il denaro entra una volta (ricarica), gira come coin dentro il circuito (spesa,
regalo), esce una volta (settlement all'organizzatore).

Questa cartella è la **specifica di riferimento** del progetto, allo stesso modo in cui
[`design_handoff_tinft/`](../design_handoff_tinft/) lo è per il ticketing. Nessun codice
qui dentro: sono documenti e prototipi di design da ricreare nello stack target.

> **Nota:** non costituisce consulenza legale né finanziaria. Il modello va validato da un
> legale fintech prima del go-live.

## Il modello in cinque righe

- **1 TIN = €1,00 fisso.** Non fluttua; il cambio agisce solo alla ricarica (con spread).
- **Tre utenze:** cliente (spende), organizzatore (incassa e converte in fiat),
  validatore (conferma l'incasso, verifica anti-frode, consegna il prodotto).
- **Nessun cash-out per il cliente.** È il confine che tiene TIN fuori dal perimetro EMI.
- **Ricavo principale:** 3% all'organizzatore sul settlement. Regalo P2P a 0%.
- **Solo smartphone**, nessun hardware esterno (vincolo ereditato da TINFT).

## Documenti

| File | Cosa contiene |
|---|---|
| [`TIN - Documento Unico.md`](./TIN%20-%20Documento%20Unico.md) | **Sintesi di tutte le decisioni prese.** Punto di partenza per chiunque. |
| [`AUDIT.md`](./AUDIT.md) | **Revisione incrociata dei documenti**: incoerenze, lacune e cosa chiudere prima di costruire. |
| `TIN - Relazione Modello.dc.html` | Il modello del coin: ancoraggio, commissioni, offline, nodo regolatorio, brand. |
| `TIN - Diagrammi Flussi.dc.html` | I quattro flussi (ricarica, spesa, regalo, settlement) con rami e lato server. |
| `TIN - Relazione Sviluppatore.dc.html` | Architettura, ledger append-only, FX, offline, PSP/KYB, superficie API. |
| `TIN - Brand e Logo.dc.html` | Marchio, varianti d'uso, palette, tipografia. |
| `TIN - Design UI-UX.dc.html` | Le 11 schermate chiave delle tre utenze (tema notte). |
| `TIN - Prototipo App.dc.html` | Prototipo navigabile delle tre utenze. **Non normativo** — vedi `AUDIT.md` §C. |
| `TIN - Business Plan.dc.html` | Problema, modello ricavi, unit economics, go-to-market, roadmap, rischi. |
| `TIN - Presentazione Flussi.dc.html` | Deck dei flussi, 7 slide. |
| `TIN - Policy Breakage.dc.html` | Saldi dormienti: i tre regimi possibili e il default prudente proposto. |

Sono i 9 deliverable elencati al §16 del Documento Unico, al completo.

### Lavoro derivato dall'audit

| File | Cosa contiene |
|---|---|
| [`docs/BRIEF-LEGALE.md`](./docs/BRIEF-LEGALE.md) | Le otto domande da portare al legale fintech, formulate perché la risposta si traduca in una clausola. Q1 è bloccante. |
| [`docs/LEDGER-STORNI.md`](./docs/LEDGER-STORNI.md) | Modello dei movimenti di storno (chargeback, rimborsi, contestazioni) e le tre opzioni sul prezzo della ricarica, coi numeri. |

I `.dc.html` sono documenti design-component: si aprono in browser e usano i runtime
`support.js`, `doc-page.js` (documenti stampabili) e `deck-stage.js` (deck) presenti in
questa stessa cartella — vanno tenuti accanto ai documenti, i riferimenti sono relativi.

## Vincoli non negoziabili

- **Il ledger è la verità.** Saldo = somma di movimenti immutabili append-only, mai un
  campo mutabile.
- **Importi in centesimi interi** (`1450` = 14,50 TIN). Mai float; formattazione solo in UI.
- **Ogni transazione atomica e idempotente:** doppio tap, retry di rete o QR riusato non
  duplicano mai un movimento. L'`intent_id` è la chiave di idempotenza sulla spesa.
- **Denaro fuori solo ai due estremi:** ricarica e settlement. In mezzo i TIN non toccano
  circuiti di pagamento.
- **Niente cash-out cliente e niente vendita P2P a pagamento** in Fase 1: sono ciò che
  farebbe scattare l'obbligo di licenza e-money.
- Fondi **custoditi presso il PSP**; payout organizzatore bloccato finché il KYB non è
  completo.

## Stato

Documentazione e design **completi**: tutti e 9 i deliverable del §16 sono presenti.

La revisione incrociata ([`AUDIT.md`](./AUDIT.md)) ha però trovato **tre punti da chiudere
prima di scrivere codice**:

1. **Rimborso contro "niente cash-out"** — le due regole si contraddicono, e la seconda è il
   pilastro su cui poggia l'esenzione dalla licenza. Serve il legale.
2. **Costo carta sulla ricarica** — dichiarato "ribaltato sul cliente", ma assente dalla UI:
   così ogni ricarica in EUR è in perdita.
3. **Storni nel ledger** — non esiste un tipo `refund`/`reversal`, quindi chargeback,
   rimborsi e pagamenti contestati non sono rappresentabili. Tocca il modello dati.

Restano poi i due **bloccanti a tempi lunghi**, da avviare in parallelo:

1. **Legale fintech** — conferma dell'esenzione closed-loop nei Paesi del pilota e stesura
   dei Termini (inclusa la clausola breakage).
2. **PSP** — incasso multivaluta, conto di salvaguardia, payout con KYB, **e** un percorso
   verso l'e-money per la Fase 3.

Decisioni ancora aperte: quali Paesi per il pilota; se esiste già un contatto legale/PSP o
va preparata una shortlist.
