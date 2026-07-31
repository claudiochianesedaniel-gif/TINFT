# TIN — brief per il legale fintech

> Documento da consegnare al legale insieme a `TIN - Documento Unico.md`.
> Serve a ottenere risposte utilizzabili, non un parere generico: ogni domanda è formulata
> in modo che la risposta si traduca in una scelta di prodotto o in una clausola.
>
> Stato: **bozza da inviare** · Luglio 2026

---

## Come leggere questo brief

TIN è un portafoglio prepagato per eventi. Il meccanismo in una riga: **il denaro entra una
volta e esce una volta.** Entra quando il cliente ricarica (fiat → TIN, fondi custoditi
presso il PSP), esce quando l'organizzatore chiede il payout (TIN → fiat, meno il 3%). Fra i
due estremi i TIN sono scrittura contabile interna: quando un cliente paga un drink o regala
credito a un amico, nessun euro si muove.

L'intero impianto è costruito per restare dentro l'**esenzione "rete limitata"** (PSD2 art. 3
lett. k / EMD2) ed evitare la licenza di moneta elettronica. Il confine che lo tiene in piedi
è uno solo: **il cliente non può mai riconvertire i TIN in denaro.**

Le domande sotto sono in ordine di importanza. **Q1 è bloccante**: senza risposta non si può
redigere i Termini, e senza Termini non si può fare il pilota.

---

## Q1 · Il rimborso al cliente rompe il circuito chiuso? **[BLOCCANTE]**

**Il problema.** Il modello afferma due cose che, lette insieme, non stanno in piedi:

- *"Non è un cash-out per il cliente"* — è il pilastro su cui poggia l'esenzione.
- *"Rimborso sempre possibile su richiesta finché il saldo esiste"* — è il default proposto
  nella policy sui saldi dormienti, pensato per essere prudente verso il consumatore.

Un rimborso in denaro **è** una riconversione da TIN a fiat operata a favore del cliente. Se
è una funzione ordinaria del prodotto, il "niente cash-out" è falso. Se non esiste affatto,
il cliente resta esposto e in diversi ordinamenti la clausola sarebbe comunque inefficace.

**Cosa ci serve sapere.**

1. Un diritto di rimborso **eccezionale** (evento annullato, chiusura del servizio, recesso
   entro N giorni, cessazione dell'account) è compatibile con l'esenzione rete limitata, o è
   proprio la rimborsabilità a qualificare lo strumento come moneta elettronica?
2. Se è compatibile, **come va formulato** perché resti eccezionale: elenco chiuso di casi?
   soglia minima? istruttoria caso per caso invece che un pulsante nell'app?
3. Il rimborso può essere **restituito allo stesso strumento di pagamento** usato per la
   ricarica (che tecnicamente è uno storno, non un trasferimento) invece che con bonifico?
   Cambia l'inquadramento?
4. Esiste un obbligo **minimo inderogabile** di rimborso nei Paesi del pilota, che si applica
   anche se i Termini tacciono?

**Perché è bloccante.** La risposta decide se nell'app esiste un pulsante "chiedi rimborso",
come è scritta la clausola nei Termini, e — nel caso peggiore — se l'intero impianto senza
licenza regge.

---

## Q2 · L'esenzione "rete limitata" regge per questo modello?

**Cosa gli va descritto:**

- L'uso è ristretto ai punti vendita **dentro gli eventi** di organizzatori convenzionati
  (bar, food, merch): beni propri dell'organizzatore, non di terzi.
- Ma: il **saldo è riutilizzabile fra eventi diversi e organizzatori diversi**, e la ricarica
  accetta **10+ valute**. Il circuito quindi non è un singolo esercente né un singolo luogo.
- Non c'è hardware dedicato: tutto passa dall'app.

**Domande.**

1. Un circuito multi-organizzatore, multi-evento e multivaluta rientra ancora in "rete
   limitata di prestatori di servizi", o l'ampiezza lo fa cadere?
2. Quali **soglie quantitative** si applicano nei Paesi del pilota — volume annuo, numero di
   esercenti, valore massimo per strumento, importo massimo caricabile per cliente?
3. Esiste un **obbligo di notifica** all'autorità (in Italia Banca d'Italia; altrove
   l'equivalente) al superamento di una soglia? Quale, entro quando, con quali dati?
4. Il **saldo riutilizzabile fra eventi** è il punto più fragile? Limitare la validità del
   saldo a un evento singolo rafforzerebbe l'esenzione, e a che prezzo?

## Q3 · Il settlement all'organizzatore è davvero pagamento di una fornitura?

L'organizzatore è l'unico a portare denaro fuori dal circuito. La tesi è che non stia facendo
cash-out: sta incassando il prezzo di beni propri venduti al pubblico, e TIN gli gira quel
prezzo trattenendo il 3%.

**Domande.**

1. La tesi regge? Che tipo di contratto serve fra piattaforma e organizzatore perché sia
   inequivoca — mandato all'incasso? contratto di acquiring? altro?
2. La piattaforma sta **detenendo fondi di terzi** nella finestra fra ricarica e payout.
   Basta il conto di salvaguardia del PSP, o serve un assetto proprio?
3. Il 3% va qualificato come commissione di servizio: implicazioni IVA?
4. Chi emette lo **scontrino / documento fiscale** al cliente finale: l'organizzatore, e la
   piattaforma è estranea?

## Q4 · Il regalo P2P: quali limiti servono?

Il trasferimento gratuito di TIN fra clienti è previsto e senza commissione. La vendita a
pagamento è vietata perché sarebbe cash-out del venditore.

**Il problema pratico:** il divieto è una regola scritta, non un controllo tecnico. Due
persone possono trasferirsi TIN nell'app e regolare il denaro fuori dall'app. È il cash-out
che il modello esiste per impedire, ottenuto in due passaggi.

**Domande.**

1. Quali **limiti** rendono difendibile la posizione della piattaforma: importo massimo per
   regalo, tetto giornaliero/mensile, numero di destinatari distinti, divieto verso account
   nuovi?
2. Che obblighi di **monitoraggio** ricadono sulla piattaforma anche restando fuori dal
   perimetro AML pieno? Va tenuto un registro? Va segnalato qualcosa?
3. Un uso sistematico del regalo come vendita mascherata espone la piattaforma a
   responsabilità, se ha adottato limiti e monitoraggio ragionevoli?

## Q5 · Evento annullato, organizzatore insolvente

Se un festival salta, i clienti hanno saldi ricaricati e l'organizzatore può aver già
ricevuto payout.

**Domande.**

1. Chi risponde verso il cliente: l'organizzatore o la piattaforma? Si può contrattualizzare
   la responsabilità in capo all'organizzatore, e regge verso il consumatore?
2. Va trattenuta una **riserva** sul payout a copertura? Per quanto tempo?
3. Cambia qualcosa se il saldo è riutilizzabile ad altri eventi — cioè se il cliente non ha
   perso il valore, solo l'occasione di spenderlo?

## Q6 · Frode carta e chargeback

Ricarica con carta rubata → TIN spesi subito → storno bancario mesi dopo. I TIN sono già
dell'organizzatore, il denaro torna al titolare della carta.

**Domande.**

1. La piattaforma può **rivalersi sull'organizzatore** che ha già incassato, o la perdita
   resta sua?
2. Una **riserva** o un ritardo sul payout a copertura della finestra di chargeback è
   ammissibile verso l'organizzatore? Va dichiarato nei Termini con quale preavviso?
3. Obblighi di verifica sull'identità del ricaricante, anche fuori dal perimetro KYC pieno?

## Q7 · Breakage e saldi dormienti

Vedi il documento *Policy breakage* per la proposta completa. In sintesi il default è: saldo
= passività finché non estinto per legge, inattività minima ≥ 24 mesi, ≥ 2 avvisi, rimborso
possibile, escheatment dove previsto, parametri per giurisdizione.

**Domande.**

1. Per ciascun Paese del pilota: quale dei tre regimi si applica — nessuna scadenza,
   escheatment, decadenza limitata?
2. I 24 mesi sono sufficienti, o il minimo di legge è più alto?
3. Il breakage può essere iscritto a ricavo, e a quali condizioni?
4. Formulazione della clausola nei Termini.

## Q8 · Dati personali

Punti di attenzione emersi dal design:

1. La schermata anti-frode chiede al validatore di confrontare **la foto profilo del cliente
   col cliente stesso** sopra soglia. Che base giuridica, che informativa, e la foto va
   conservata?
2. La conferma di pagamento usa la **biometria del device** (Face ID / impronta): resta sul
   telefono e la piattaforma riceve solo l'esito — va comunque dichiarato?
3. Quanto si conservano i movimenti del ledger, che è **append-only per progetto**? Come si
   concilia l'immutabilità con il diritto alla cancellazione?

---

## Cosa serve indietro, in concreto

1. **Risposta a Q1** — nella forma di un testo di clausola, non di un'opinione.
2. **Semaforo sull'esenzione** per ciascun Paese del pilota: verde / giallo con condizioni /
   rosso.
3. **Soglie e obblighi di notifica** per quei Paesi, con i numeri.
4. **Bozza dei Termini di servizio**, inclusi breakage, rimborso, evento annullato.
5. **Contratto piattaforma–organizzatore**, incluse riserva sul payout e rivalsa.
6. Indicazione se conviene puntare fin da subito a un **partner EMI**, così che la Fase 3
   (vendita P2P a pagamento, cash-out cliente) non imponga di rifare l'architettura.

## Da decidere dalla nostra parte prima dell'incontro

- **Quali Paesi** per il pilota. Il brief non è rispondibile senza questo: le soglie e i
  regimi di breakage cambiano per giurisdizione.
- Se esiste già un contatto legale/PSP o va preparata una shortlist.
- Se il saldo debba restare riutilizzabile fra eventi, sapendo che è il punto più fragile
  dell'esenzione (Q2.4).
