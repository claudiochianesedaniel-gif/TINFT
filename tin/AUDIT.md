# TIN — Audit della documentazione

> Revisione incrociata dei 9 deliverable + Documento Unico, Luglio 2026.
> Ogni rilievo è verificato sul testo; i riferimenti sono `file:riga`.
> Non è una revisione legale: i punti regolatori vanno portati al legale fintech.

**Sintesi:** l'aritmetica dei documenti è corretta in ogni esempio. I problemi sono di
**coerenza tra documenti** e di **buchi nel modello** — tre dei quali vanno chiusi prima
di scrivere codice.

---

## A · Da chiudere prima di costruire

### A1 — "Rimborso sempre possibile" contro "niente cash-out per il cliente"

Il pilastro regolatorio di tutto il modello è che il cliente **non può riconvertire TIN in
denaro** (`TIN - Documento Unico.md:28`, `:203`). La Policy Breakage però stabilisce che il
**rimborso è sempre possibile su richiesta** finché il saldo esiste
(`TIN - Policy Breakage.dc.html:68`, ripreso in `TIN - Documento Unico.md:159`).

Un rimborso in denaro **è** una riconversione. Le due affermazioni non possono stare
entrambe in piedi senza una distinzione esplicita.

La distinzione esiste ed è nota — "funzione di prodotto" contro "diritto del consumatore
esercitato per eccezione" — ma non è scritta da nessuna parte, e in diversi inquadramenti è
proprio la **rimborsabilità** a qualificare uno strumento come moneta elettronica. Va
formulata dal legale e poi riportata identica in entrambi i documenti: chi può chiedere il
rimborso, in quali casi, con quale procedura, e perché questo non apre il perimetro EMI.

**È il rilievo più importante dell'audit**: tocca la scelta da cui dipende se serve una licenza.

### A2 — La ricarica in EUR è in perdita: il costo carta non è ribaltato nella UI

Tre documenti dicono che il costo di incasso carta è **ribaltato sul cliente**
(`TIN - Documento Unico.md:68`, `TIN - Relazione Modello.dc.html:154`,
`TIN - Business Plan.dc.html:77`), e le unit economics ci contano sopra: la voce "Costo
incasso carta" vale **€0** proprio perché ribaltata (`TIN - Business Plan.dc.html:89`).

Ma nelle due UI il costo carta **non compare**. Il riepilogo della ricarica ha tre righe —
Cambio, Spread 1%, Addebito — e nient'altro (`TIN - Design UI-UX.dc.html:109-111`,
`TIN - Prototipo App.dc.html:94-96`).

Per una ricarica in valuta estera il problema è mascherato: lo spread dell'1% assorbe parte
del costo. Per una **ricarica in EUR lo spread è zero per definizione**, quindi il cliente
paga esattamente €50,00 per 50 TIN e la piattaforma incassa €50,00 pagando il PSP:

| PSP | Costo su una ricarica da 50 TIN | Margine piattaforma |
|---|---|---|
| 1,5% + €0,25 | €1,00 | **−€1,00** |
| 2,9% + €0,25 | €1,70 | **−€1,70** |

Su un evento da €900.000 di GMV, se anche solo il 70% è ricaricato in EUR, la perdita è
dell'ordine di **€12.000–20.000** — contro un margine dichiarato di €25.200. È esattamente
l'errore che la Relazione Modello mette in guardia dal fare
(`TIN - Relazione Modello.dc.html:150`), ripetuto nel prodotto.

Va deciso e reso coerente ovunque: o una riga "Commissione di ricarica" nel riepilogo, o un
minimo di ricarica che diluisca il fisso, o l'assorbimento del costo con le unit economics
riscritte di conseguenza.

### A3 — Nessuna gestione dello storno: chargeback, rimborsi, pagamenti contestati

Il ledger è **append-only** e i tipi di movimento sono cinque:
`topup | spend | gift | settlement | fee` (`TIN - Relazione Sviluppatore.dc.html:79`,
`TIN - Documento Unico.md:138`). **Non esiste un tipo `refund` o `reversal`.**

Conseguenza: non c'è modo di rappresentare
- un **chargeback** — il cliente ricarica con carta rubata, spende i TIN, la banca storna
  l'addebito. I TIN sono già dell'organizzatore, il denaro torna al titolare della carta,
  la perdita resta alla piattaforma;
- il **rimborso** promesso dalla Policy Breakage (A1);
- un pagamento contestato al punto vendita (prodotto mai consegnato dopo l'incasso — uno
  scenario che i documenti stessi prevedono, visto che la consegna avviene *dopo* il
  pagamento).

Il rischio frode-carta non compare neanche fra i rischi R1–R4
(`TIN - Documento Unico.md:192-195`), che coprono regolatorio, connettività, adozione e
fiducia. Manca un R5.

Serve almeno: un tipo di movimento di storno, la regola su cosa succede se il saldo è già
stato speso, ed eventualmente un ritardo o una riserva sul payout dell'organizzatore a
copertura della finestra di chargeback (che con le carte arriva a mesi).

---

## B · Contraddizioni tra documenti

### B1 — La vendita P2P a pagamento è Fase 2 o Fase 3?

| Documento | Dice |
|---|---|
| `TIN - Relazione Modello.dc.html` | **Fase 2** — 6 occorrenze, nessuna "Fase 3" (`:159`, `:188`, `:212`) |
| `TIN - Documento Unico.md` | **Fase 3** (`:73`, `:186`, `:205`) |
| `TIN - Relazione Sviluppatore.dc.html` | **Fase 3** (`:145`) |
| `TIN - Presentazione Flussi.dc.html` | **Fase 3** |
| `TIN - Business Plan.dc.html` | **entrambe** — "Fase 2" nella tabella ricavi (`:78`) e nel go-to-market (`:100`), "Fase 3" nella roadmap (`:109`) |

La Relazione Modello è la versione precedente, rimasta indietro rispetto alla decisione
consolidata nel Documento Unico. Il Business Plan si contraddice da solo. Poiché questa è
la fase che **richiede la licenza EMI**, l'ambiguità non è cosmetica: cambia quando scatta
l'obbligo.

### B2 — L'offline è dentro o fuori l'MVP? Tre documenti si contraddicono al proprio interno

| Documento | Dice "dentro" | Dice "fuori" |
|---|---|---|
| `TIN - Documento Unico.md` | §7 "Offline (nell'MVP — **confermato**)"; §12 MVP include "offline con tetto" (`:184`) | §15.3 "Scope MVP congelato (**solo online**, …)" (`:218`) |
| `TIN - Relazione Modello.dc.html` | `:214` "Offline: **confermato nell'MVP**" | `:180` "Per l'MVP puoi partire **solo online**" |
| `TIN - Business Plan.dc.html` | `:107` roadmap MVP: "offline con tetto" | `:99` pilota: "**solo online**, tetti offline bassi" — frase che si contraddice in sé stessa |

L'offline è la parte più rischiosa dell'MVP: introduce l'unico scenario di doppia spesa che
i documenti ammettono di non poter azzerare. Averlo dentro o fuori cambia il costo e il
profilo di rischio del primo rilascio. Va deciso una volta e propagato.

### B3 — Il logo descritto non è il logo disegnato

Il Documento Unico descrive il marchio come *"cerchio con gradiente azzurro→verde,
monogramma **T** con taglio diagonale in negativo"* (`TIN - Documento Unico.md:120`).

Il logo reale — nel documento di brand e in **ogni** SVG di **ogni** documento — è un
**triangolo equilatero con un punto al centro**, in negativo sul cerchio
(`TIN - Brand e Logo.dc.html:41`, `:49`, `:76`). Nessuna "T", nessun taglio diagonale.

Va riscritta la descrizione nel Documento Unico. La motivazione registrata per la scelta
("volutamente diverso dal glifo ₮ di Tether") resta valida per il marchio reale.

### B4 — La Relazione Modello pone come aperte tre domande già chiuse

Il suo §"Da confermare prima di costruire" chiede ancora: la commissione è ~3%? la vendita
P2P resta fuori dall'MVP? il nome è TIN o Tabo? (`TIN - Relazione Modello.dc.html:211-213`).

Tutte e tre sono decise nel Documento Unico: 3% **confermato**, TIN **scelto** (Tabo
scartato), P2P rimandato. Entrambi i documenti portano la data "Luglio 2026 · v1", quindi
un lettore non ha modo di capire quale sia il più recente.

---

## C · Lacune di prodotto

### C1 — Il regalo P2P non ha limiti, ed è la via d'uscita dal circuito chiuso

Il regalo è **gratuito, atomico e senza tetti** — nessun limite di importo o di frequenza
compare in alcun documento. Il divieto di *vendita* è affermato correttamente, ma è una
regola scritta, non un controllo: nulla impedisce a due persone di trasferirsi TIN nell'app
e regolare il denaro fuori dall'app. È il cash-out che tutto il modello esiste per impedire,
ottenuto in due passaggi.

Servono limiti espliciti (importo massimo per regalo, tetto giornaliero, numero di
destinatari distinti, velocity) e il loro monitoraggio. Il motore anti-frode è già previsto
in architettura, ma **solo sul percorso di spesa** (`TIN - Relazione Sviluppatore.dc.html:69`).

### C2 — Evento annullato o organizzatore insolvente: non è trattato

Se un festival salta, i clienti hanno saldi ricaricati e l'organizzatore ha incassi già
liquidati. Chi rimborsa, con che fondi, in quanto tempo? Non compare in nessun documento.
Con i fondi in custodia presso il PSP la risposta esiste, ma va scritta — è anche la
domanda che farà il primo organizzatore serio.

### C3 — Il prototipo non copre l'anti-frode sopra soglia

Il Design UI/UX ha 11 schermate, fra cui **Anti-frode** (verifica sopra soglia, checklist,
approva/rifiuta) e **Listino** organizzatore. Il prototipo navigabile ne implementa 11 ma
diverse: aggiunge *Regala* e **omette entrambe**.

L'anti-frode è **uno dei tre compiti documentati del validatore**
(`TIN - Documento Unico.md:38`): è il flusso che decide cosa succede sopra soglia, e non è
provabile.

### C4 — Il prototipo genera un QR di incasso da 0,00 TIN

Il tastierino accetta `0` e la guardia sul pulsante controlla solo che la stringa non sia
vuota (`TIN - Prototipo App.dc.html:365`). Premendo `0` e poi "Genera QR incasso" si ottiene
una richiesta di pagamento da 0,00 TIN. Verificato eseguendo la logica del componente.
La guardia va portata su valore `> 0`, e la stessa regola vale lato server su
`POST /charge/intent`.

### C5 — Il prototipo viola la regola che i documenti mettono per prima

Il saldo del prototipo è un **float** (`balance: 128.50`) e le operazioni sono somme in
virgola mobile con `toFixed(2)` in stampa (`TIN - Prototipo App.dc.html:245-248`). La
Relazione Sviluppatore impone l'esatto contrario: *"importi in centesimi interi. **Mai
float.** Formattazione solo in UI"* (`:87`).

Inoltre pagamento e regalo usano `Math.max(0, saldo − importo)`: con saldo 5,00 TIN un
pagamento da 8,00 **riesce** e azzera il saldo, invece di essere rifiutato. Il controllo di
capienza è il primo della checklist anti-frode.

Sono difetti accettabili in un mock, ma il prototipo è il riferimento che gli sviluppatori
apriranno per primo. Va marcato come non-normativo, con un rimando esplicito alla regola dei
centesimi interi.

---

## D · Minori

| # | Rilievo |
|---|---|
| D1 | Refuso: "saglia anti-frode" → "soglia" (`TIN - Relazione Sviluppatore.dc.html:120`). |
| D2 | Il Brand dichiara "**nessun colore nuovo**", ma i documenti di stampa usano `#2A55C7`/`#1F8A5B` al posto di `#4F7CF0`/`#35CF93`. La scelta è sensata (contrasto su carta bianca) ma non è documentata: la prossima persona ne inventerà altri due. Va aggiunta una palette di stampa al documento di brand. |
| D3 | Il Business Plan calcola il 3% sul **GMV ricaricato**, ma la riga dice "3% del **venduto**" (`:87`). Coincidono solo se il breakage è zero — mentre il breakage è contato come upside. Va scelta una base e dichiarata. |
| D4 | `support.js` (64 KB) è duplicato fra `tin/` e `design_handoff_tinft/` e le **due copie sono già diverse**. Sono runtime di rendering, non logica di prodotto, ma la divergenza crescerà. |

---

## Verificato corretto

Tutta l'aritmetica dei documenti torna:

| Calcolo | Documenti | Esito |
|---|---|---|
| Ricarica 50 TIN @ 1,08 + spread 1% → $54,54 | Modello, Sviluppatore, Design, Deck, Prototipo | ✓ |
| Settlement 14.820 TIN − 3% → €444,60 / €14.375,40 | Documento Unico, Design, Deck, Prototipo | ✓ |
| GMV €900.000 · settlement €27.000 · spread €2.700 · costi €4.500 · margine €25.200 (2,8%) | Business Plan, Documento Unico | ✓ |
| Tetto offline 5000 TIN-cent = 50,00 TIN | Sviluppatore ↔ Modello | ✓ coerente |
| `topup/quote` tin 5000 → fiat_total 5454 | Sviluppatore | ✓ coerente coi centesimi |

Coerenti anche: le tre utenze e i loro compiti; il ciclo di vita a quattro passi; la
Variante A come flusso di spesa raccomandato; la superficie API fra Sviluppatore e Documento
Unico; il 3% e lo 0% sul regalo in tutti i documenti; le 11 schermate del Design UI/UX
rispetto a quanto dichiarato.

---

## Prossimi passi, in ordine

1. **Chiudere A1 col legale** — la formulazione del rimborso. Blocca i Termini di servizio,
   che a loro volta bloccano il pilota.
2. **Decidere A2** — chi paga il costo carta. Cambia la UI di ricarica e le unit economics.
3. **Progettare A3** — storni nel ledger e finestra di chargeback sul payout. Cambia il
   modello dati, quindi va deciso prima della prima riga di codice.
4. **Allineare B1 e B2** su una sola versione, poi correggere B3 e B4. Lavoro di redazione,
   mezza giornata.
5. **Definire i limiti sul regalo P2P** (C1) e la procedura per evento annullato (C2).
6. **Completare il prototipo** con anti-frode e listino (C3), correggere C4 e C5.
7. Minori D1–D4 quando si tocca il documento interessato.

I due bloccanti a tempi lunghi restano quelli già identificati — **legale fintech** e **PSP
con percorso e-money** — e conviene avviarli in parallelo al punto 1.
