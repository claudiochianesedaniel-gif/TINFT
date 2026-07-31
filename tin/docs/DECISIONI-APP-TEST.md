# TIN — decisioni per l'app di test

> Registro delle decisioni prese a voce, prima di scrivere codice. Ogni voce ha la sua
> ragione, così chi arriva dopo capisce *perché* e non solo *cosa*.
> Dove c'è **[da confermare]** ho messo un default ragionevole che aspetta la tua parola.
>
> Luglio 2026 · le decisioni marcate 🔒 sono vincoli, non preferenze

---

## 0 · Perimetro

| Decisione | Ragione |
|---|---|
| **Soldi simulati.** Nessun PSP, nessun incasso reale: la ricarica accredita TIN direttamente | Permette di costruire e provare ledger, spesa, regalo, settlement e storni senza toccare il perimetro regolatorio. I tre punti bloccanti dell'audit restano da chiudere prima del denaro vero, ma non bloccano il codice |
| Si sviluppa sul branch `tin` di questo repository | Separato da `main`, e `tin` non è collegato ad alcun deploy: la CI gira solo verifiche |
| 🔒 **Nessun deploy** finché non è richiesto esplicitamente | Render ha `autoDeploy: true` su `staging` e sul branch di default. Il branch `tin` non è tra questi |

## 1 · Denaro in entrata — ricarica

| Decisione | Ragione |
|---|---|
| Cambio valuta **solo alla ricarica**, con spread. Tasso bloccato 60s | Come da spec. Dopo la ricarica il saldo è in TIN e non oscilla più |
| Spread **1%** | Tutti gli esempi dei documenti usano l'1%: resta tutto coerente con ciò che è già scritto e disegnato. Configurabile |
| 🔒 **Costo carta**: non deciso, e con soldi simulati non morde | Resta il punto A2 dell'audit. Va chiuso prima del denaro vero: assorbirlo azzera il margine dell'evento |

### Auto-ricarica quando il saldo non basta

Il cliente **non paga mai metà in carta e metà in TIN**. Se il saldo non copre l'importo, la
carta ricarica e poi si paga il 100% in TIN.

> **Perché è la scelta giusta:** la carta tocca solo la ricarica, che è il punto d'ingresso
> già previsto; il punto vendita riceve sempre e solo TIN. L'invariante "il denaro entra una
> volta e esce una volta" resta intatta. Un pagamento misto sarebbe stato *acquiring* — un
> perimetro regolatorio completamente diverso.

Tre modalità, **scelte dall'utente**:

| Modalità | Comportamento | Default |
|---|---|---|
| **Arrotonda a taglio** | Scoperto 4,50 → ricarica **10 TIN**, il resto resta nel wallet | ✅ predefinita |
| **Esatto** | Ricarica esattamente lo scoperto, saldo torna a zero | |
| **Sceglie il cliente** | Mostra lo scoperto e propone dei tagli | |

Modificabile dalle impostazioni **e** dalla schermata di conferma, così chi vuole cambiare lo
fa senza uscire dal flusso.

🔒 **Una sola conferma** per ricarica + pagamento. Un Face ID copre entrambe, con la
scomposizione visibile prima di confermare. Se la ricarica fallisce il pagamento non avviene:
nessuna scrittura, nessun addebito.

## 2 · Denaro che gira — spesa

| Decisione | Ragione |
|---|---|
| **Variante A**: il validatore digita l'importo → QR di richiesta → il cliente scansiona, vede prezzo e punto vendita, conferma con biometria | Come da spec: l'importo lo decide la cassa, meno errori |
| **Importo libero digitato**, nessun listino prodotti | Semplice e veloce. Conseguenza accettata: non si sa *cosa* è stato venduto |
| 🔒 QR **usa-e-getta** a TTL breve; `intent_id` come chiave di idempotenza | Un QR = una transazione. Doppio tap e retry non duplicano mai |

**Consegna del prodotto.** Senza catalogo la schermata non può elencare cosa consegnare (nei
mockup dice «1× Cocktail · 1× Birra»). Al suo posto un **campo note libero e opzionale**: il
validatore scrive «2 birre» mentre digita l'importo e se lo ritrova sulla conferma. Serve
quando chi incassa non è chi serve al banco.

> Il testo è scritto a mano, quindi **non produce statistiche**: la dashboard mostrerà
> incassi, transazioni e scontrino medio, mai «prodotti più venduti». È il prezzo accettato
> per la velocità dell'importo libero.

### Annullo di un incasso sbagliato

Con l'importo libero, «80,00» al posto di «8,00» è un errore frequente. Il ledger è
append-only, quindi si corregge con uno **storno** (§6), mai cancellando il movimento.

| Chi | Può |
|---|---|
| **Validatore** | **Segnalare** l'incasso come errato, subito, col cliente ancora davanti. Non storna |
| **Organizzatore** | **Eseguire** lo storno, sempre e senza limiti di tempo |

> **Perché il validatore non può stornare.** Chi ha il potere di annullare incassi in cassa
> può annullare anche quelli veri e tenersi il contante: è l'ammanco classico, reso invisibile
> dal fatto che i conti tornano. Nessuna finestra temporale, per quanto breve, elimina il
> problema — lo rimpicciolisce soltanto.
>
> **Perché però può segnalare.** Senza segnalazione, il cliente a cui sono stati presi 72 TIN
> di troppo resta bloccato finché qualcuno in ufficio non se ne accorge da solo. La
> segnalazione porta l'errore in cima alla dashboard dell'organizzatore nel momento in cui
> accade, senza dare a nessuno in cassa un potere nuovo.

### Anti-frode

| Decisione | Valore |
|---|---|
| Soglia sopra cui serve verifica | **Configurabile per evento**, default **120 TIN** |
| Controlli | Saldo capiente · QR valido · foto profilo = cliente |
| Esito | Approva / Rifiuta, con il nome del validatore che ha deciso |

Configurabile perché un festival da 20.000 persone e un club non possono usare lo stesso
numero. La verifica sopra soglia è una decisione umana e **deve avere un responsabile**: è la
ragione per cui il validatore è una persona con account (§4).

## 3 · Denaro che gira — regalo P2P

| Decisione | Valore |
|---|---|
| Commissione | 🔒 **0%** |
| Destinatario | Risolto con l'@handle — il campo `username` esiste già nel database, già usato «per ricerca, regali, varco» |
| Tetto per singolo regalo | **50 TIN** |
| Tetto giornaliero complessivo | **150 TIN** |
| Destinatari distinti al giorno | **5** |

> **Perché tre limiti e non uno.** Il tetto per regalo da solo si aggira spezzettando
> l'importo; quello giornaliero lo copre. Ma il segnale che distingue davvero un regalo da
> una vendita è il **numero di destinatari**: si offre da bere a chi è con noi, si vende
> credito a sconosciuti. I limiti sono anche ciò che rende difendibile la posizione della
> piattaforma: il divieto di vendita è una regola scritta, i limiti sono un controllo.

Tutti configurabili, si alzano coi dati del pilota.

🔒 **Vendita P2P a pagamento: esclusa.** È l'unico punto che obbliga alla licenza EMI. Fase 3.

## 4 · Chi opera in cassa

| Decisione | Ragione |
|---|---|
| Il validatore è una **persona con account** | Ogni incasso porta il nome di chi l'ha fatto. Necessario per l'anti-frode sopra soglia, che è una decisione umana |
| **Più validatori per punto vendita, per serata** | Un bar ha tre persone il venerdì e due il sabato |

**Conseguenza sul modello dati:** l'assegnazione è una **relazione a tre** — persona × punto
vendita × serata — non un campo sul validatore. Il modello `Validator` esistente è legato
all'evento e ha solo un `code`, senza persona né punto vendita: va esteso.

Il **punto vendita** è un concetto nuovo, che il ticketing non ha: `Bar Centrale`,
`Food Truck`, `Merch` appartengono all'evento.

## 4bis · Registrazione — una per ruolo

**Un solo motore, quattro porte.** Il motore è quello del ticketing e non si riscrive: OTP a
6 cifre via email (`PendingRegistration`), login Apple/Google (`oidc.ts`), password scrypt
(`auth/password.ts`), anagrafica completa. Cambiano i campi richiesti e cosa succede dopo.

| Ruolo | Come si registra | Campi | Dopo |
|---|---|---|---|
| **Cliente** | Da solo, dall'app | Anagrafica completa del ticketing: nome, cognome, CF, nascita, indirizzo, telefono, @handle | Attivo subito. Può ricaricare e spendere |
| **Validatore** | Da solo, dall'app | Stessi campi del cliente | Resta **non assegnato** finché un organizzatore non lo mette su un punto vendita. Fino ad allora non incassa nulla |
| **Organizzatore** | Da solo | Anagrafica + **dati azienda**: ragione sociale, P.IVA, conto di accredito | KYB in stato `PENDING`. Può creare evento e punti vendita, **ma il payout è bloccato** finché la piattaforma non approva |
| **Punto vendita** | **Lo crea l'organizzatore** | Nome, evento di appartenenza | Nessuna credenziale: non fa login. Chi entra è sempre una persona |

**Perché il cliente ha l'anagrafica completa.** Un solo modulo di registrazione per tutto
l'ecosistema, account già pronto a comprare biglietti, nessun codice nuovo. Il prezzo è
l'attrito nel momento peggiore — la fila davanti al bar — che i documenti classificano come
rischio R3. Se in prova si rivelasse un ostacolo, la via d'uscita è chiedere il minimo e
completare i dati quando servono davvero.

**Perché il validatore si registra da solo.** L'account è della persona, non
dell'organizzatore: resta suo se cambia evento o datore di lavoro, e l'organizzatore non si
ritrova a gestire password altrui. L'organizzatore lo cerca per @handle e lo assegna — che è
poi la relazione a tre del §4.

**Perché l'organizzatore si registra da solo, pur essendo Fase 2 nella spec.** Perché è dove
il prodotto va comunque, e perché è l'unico modo di provare davvero il blocco del payout su
KYB incompleto: inserendo gli organizzatori a mano con KYB già verde, quella difesa non la
verifica nessuno.

**Perché il punto vendita non ha credenziali.** Le credenziali su un'entità condivisa sono la
strada più breve al codice che gira per tutto lo staff e che non si revoca più senza fermare
la cassa. E soprattutto: l'approvazione sopra soglia (§2) deve avere **un nome**, non una
postazione.

> ⚠️ Un punto vendita **non** può registrarsi da solo come azienda terza. Se un food truck
> esterno incassasse per conto proprio, il denaro non andrebbe più tutto all'organizzatore e
> cadrebbe la tesi «vende beni propri» su cui poggia l'esenzione. Se in futuro servisse, è
> una domanda per il legale, non una feature.

## 5 · Denaro in uscita — settlement

| Decisione | Valore |
|---|---|
| Commissione | 🔒 **3%** trattenuto al payout |
| Gate | **KYB completo**, altrimenti payout bloccato. L'organizzatore si registra da solo (§4bis) e parte in `PENDING`: il blocco si prova davvero |
| Soglia minima | **500 TIN** accumulati |
| Riserva sul payout | **Non nell'app di test.** Si aggiunge coi soldi veri, per coprire la finestra di chargeback |

## 6 · Il ledger

🔒 **Il ledger è la verità.** Saldo = somma di movimenti immutabili append-only, mai un campo
mutabile. Importi in **centesimi interi**, mai float; formattazione solo in UI.

Tipi di movimento: `topup` · `spend` · `gift` · `settlement` · `fee` · `reversal`.

> `PlatformLedger`, che esiste già nel repository, **non è un ledger**: sono quattro contatori
> mutabili per le fee del ticketing. Per TIN serve un ledger vero, costruito nuovo.

Lo storno è una **nuova entry che punta all'originale** (`ref.reverses`), mai una modifica.
Modello completo in [`LEDGER-STORNI.md`](./LEDGER-STORNI.md).

## 7 · Confini col ticketing TINFT

| Decisione | Ragione |
|---|---|
| I due prodotti **non si toccano** nell'app di test: account e identità condivisi, saldi separati | Il perimetro di TIN resta netto |
| Il modello dati però **resta compatibile** | Quando si vorrà comprare un biglietto in TIN sarà un movimento in più, non una riscrittura |
| 🔒 Un biglietto comprato in TIN nasce **non rivendibile** | Vedi sotto |

> **⚠️ Il buco che questo chiude.** Il biglietto TINFT è un NFT rivendibile. Senza questa
> regola: *ricarico 200 TIN → compro un biglietto → lo rivendo per euro* = cash-out del
> cliente in tre mosse tutte legittime prese singolarmente. Lo stesso buco della vendita P2P,
> che passa però attraverso il prodotto gemello. Nessuno dei documenti l'aveva notato, perché
> nessuno guardava i due prodotti insieme.
>
> La regola è netta e non ambigua **grazie alla scelta fatta al §1**: siccome si paga sempre
> il 100% in TIN, un biglietto è comprato tutto in TIN o tutto in euro. Non esistono ibridi.

## 8 · Cosa NON entra nell'app di test

| Fuori | Quando |
|---|---|
| **Spesa offline** con tetto e voucher firmati | Dopo che l'online è solido. In `apps/mobile` esiste già `offline-queue.ts` scritto per il ticketing |
| **NFC** (Variante C) | Fase 2 della spec |
| **Riserva sul payout** | Coi soldi veri |
| **Acquisto biglietti in TIN** | Solo il campo nel modello dati |
| **Breakage** | Serve prima la policy per giurisdizione |

## 9 · Il mondo dell'app di test

**Due organizzatori, due eventi**, ciascuno con qualche punto vendita e qualche validatore.

> Il minimo per provare la cosa che nessun documento ha mai verificato: il saldo ricaricato
> all'evento A e speso all'evento B **di un altro organizzatore**. È la promessa del prodotto
> — saldo riutilizzabile — ed è anche il punto più fragile dell'esenzione "rete limitata"
> (`BRIEF-LEGALE.md` Q2.4). Vederlo funzionare presto vale più che semplificare.

## 10 · Disciplina sulle regole economiche

🔒 Le costanti — `1 TIN = €1`, il 3%, lo 0% sul regalo, lo spread, i limiti sul regalo, la
soglia anti-frode, il taglio di arrotondamento — vivono in **un solo modulo**, e la CI
impedisce che UI e backend si allontanino.

> Il repository ha già `scripts/check-economics.mjs`, che fa esattamente questo per il
> ticketing. Il commento in testa dice che un audit manuale aveva trovato in produzione «4%
> commissione sul primario» e «royalty 10%» — la stessa classe di divergenza che l'audit di
> TIN ha trovato nei documenti. Va esteso, non reinventato.

---

## 11 · Come si costruisce

### Dove vive il codice

| Pezzo | Dove | Perché |
|---|---|---|
| Backend | `services/api` — Fastify + Prisma + PostgreSQL | Ci sono già account, ruoli, eventi, OTP, OIDC, webhook idempotenti |
| Regole economiche | `services/api/src/domain/rules-tin.ts`, guardato da `scripts/check-economics.mjs` | Il ticketing fa già così, e la CI lo verifica a ogni push |
| Interfaccia di prova | `apps/web` — pagine statiche, una per ruolo | Vedi sotto |
| App mobile | `apps/mobile` (Expo) | **Dopo.** Serve per biometria e fotocamera, non per provare i flussi |

### Perché il web prima del mobile, anche se il prodotto è solo-smartphone

Sembra sbagliato: la spec dice «solo smartphone, nessun hardware esterno». Ma per **provare**
un pagamento servono **due schermi accesi insieme** — la cassa che genera il QR e il cliente
che lo conferma — e su web sono due schede del browser aperte affiancate. Su mobile servono
due telefoni, due build, due sessioni. Il web accorcia il giro di prova da minuti a secondi,
e `apps/web` ospita già pagine di questo tipo (`demo.html`, `app.html`, `tinft-demo.html`).

Il mobile arriva quando i flussi sono fermi e serve provare quello che il browser non fa:
Face ID e scansione della fotocamera. Nessuna riga di logica viene buttata: sta tutta
nell'API.

### Ordine: fette verticali, non strati orizzontali

Ogni fetta è **funzionante e visibile**, dal database allo schermo. Nessuna fase in cui c'è
molto codice e niente da guardare.

| # | Fetta | Cosa deve funzionare alla fine |
|---|---|---|
| **0** | **Fondamenta** | Ledger append-only, `rules-tin.ts` con tutte le costanti, guardia CI estesa, seed di 2 organizzatori e 2 eventi. Nessuna UI: si verifica coi test |
| **1** | **Registrazione e wallet** | Le quattro porte del §4bis. Un cliente si registra, entra, vede saldo 0,00 |
| **2** | **Ricarica** | Scelta valuta, preventivo con cambio e spread, tasso bloccato 60s, accredito simulato. Il saldo sale e il movimento compare |
| **3** | **Spesa in cassa** | L'organizzatore crea Bar Centrale e assegna un validatore; il validatore digita 8,00 e genera il QR; il cliente conferma; i TIN passano. Con auto-ricarica se il saldo non basta |
| **4** | **Anti-frode** | Sopra 120 TIN il validatore vede la checklist e approva o rifiuta, col suo nome sull'esito |
| **5** | **Regalo** | Trasferimento per @handle a costo zero, coi tre limiti che scattano davvero |
| **6** | **Dashboard e settlement** | Incassi live per punto vendita; payout bloccato finché il KYB è `PENDING`, sbloccato dopo l'approvazione, meno il 3% |
| **7** | **Casi storti** | Storno di una ricarica già spesa → saldo negativo, spesa e regalo bloccati, la ricarica successiva estingue il debito |

L'offline (§8) si innesta dopo la fetta 7.

### Quando una fetta è "fatta"

1. 🔒 **Il ledger quadra.** Test automatico: dopo qualunque sequenza di operazioni, la somma
   dei saldi di tutti i conti è uguale alla somma dei movimenti. Se non torna, la fetta non è
   finita.
2. 🔒 **Idempotenza provata.** Ogni operazione ripetuta due volte con la stessa chiave
   produce una scrittura sola. Vale per ricarica, spesa, regalo, storno.
3. **Nessun float.** Un test cerca `toFixed`, `parseFloat` e divisioni sui saldi.
4. **Le costanti coincidono** fra `rules-tin.ts`, API e UI — verificato dalla CI.
5. Si può fare a mano, in due schede, senza istruzioni.

### Cosa non facciamo

Nessun deploy. Nessun merge su `main` o `staging`. Niente PSP, niente chiavi vere, niente
dati reali. L'app di test vive sul branch `tin` e si prova in locale.

## 11bis · Come viaggia il pagamento — QR e NFC

🔒 **Il trasporto non è il protocollo.** QR e NFC portano lo **stesso `intent_id`**. Il server
non sa e non deve sapere quale dei due è stato usato: cambia solo come una quarantina di
caratteri passa da un telefono all'altro. Supportare entrambi costa **zero** al backend —
tutto il costo sta nel client e nelle prove su dispositivi veri.

### Il vincolo che decide tutto

> **iOS non può emulare un tag NFC** (HCE) per il peer-to-peer: un iPhone può *leggere*, ma
> non può *presentarsi* a un altro telefono. Android fa entrambe le cose.

Non è aggirabile scrivendo codice migliore. Apple ha aperto le API NFC per il contactless
in-app, ma richiedono un entitlement dedicato e un accordo commerciale con Apple, riservato a
chi fa pagamenti di mestiere. È già documentato in `apps/mobile/src/nfc.ts`, scritto per il
ticketing, che risolve lo stesso problema.

### Perché nella Variante A questo si può girare a favore

Nella Variante A **chi presenta è la cassa**, non il cliente. Il validatore digita l'importo e
mostra qualcosa; il cliente legge. E il telefono della cassa è l'unico dispositivo che si può
**imporre**: è staff dell'organizzatore, non pubblico.

| Decisione | Conseguenza |
|---|---|
| 🔒 **Android obbligatorio in cassa** | Un solo comportamento in tutto il circuito: nessuna postazione di serie B, e il validatore non deve mai spiegare perché al bar 1 il tap funziona e al bar 2 no |
| **Requisito dichiarato nell'onboarding organizzatore** | «Serve un dispositivo Android per postazione». Va detto prima della firma, non scoperto al primo evento |
| **L'app in modalità cassa rifiuta iOS** | Meglio un blocco chiaro all'accesso che una funzione che manca a metà serata |

> **Il costo va guardato in faccia:** è attrito nell'acquisizione, e nella fase iniziale
> l'acquisizione è la cosa più preziosa che c'è. Un organizzatore con iPhone in mano deve
> comprare qualcosa. Parliamo però di telefoni da poche centinaia di euro per postazione,
> contro le migliaia di un sistema RFID — che è esattamente ciò che il modello elimina.

### Sul telefono del cliente

**NFC in automatico dove c'è, QR sempre raggiungibile.** Se entrambi i dispositivi supportano
il tap, l'app apre direttamente la modalità tap con un «usa il QR» ben visibile sotto.

- Un tocco in meno nel caso frequente, nessuna via chiusa nel caso raro.
- 🔒 **L'NFC si offre solo dopo il capability check.** `nfc.ts` lo fa già: interroga il
  dispositivo e restituisce `supported: false` con la ragione. Un pulsante che a un iPhone non
  fa niente è peggio di non averlo — il cliente pensa che l'app sia rotta e il validatore si
  prende la colpa.
- Il cliente non deve sapere cosa sia l'HCE per bere una birra.

### Perché non nell'app di test

Non è una priorità rimandata, è un'**impossibilità tecnica**: `react-native-nfc-manager` è un
modulo nativo, non gira in Expo Go né sul web, richiede una dev build — e per provarlo servono
due telefoni fisici in mano insieme. L'app di test è web (§11).

Si costruisce quando esiste l'app mobile, dopo la fetta 7. Ma l'API si progetta **da subito**
perché il trasporto sia indifferente: l'intent nasce già trasportabile in entrambi i modi,
così aggiungere il tap sarà una schermata e non una riscrittura.

## 12 · Cosa vede l'organizzatore dei suoi clienti

🔒 **Solo ciò che è successo al suo evento**: le transazioni al suo evento, col nome del
cliente. **Non** il saldo complessivo, **non** cosa il cliente ha speso altrove.

> È il minimo necessario a gestire l'anti-frode sopra soglia e le contestazioni, e niente di
> più. Il saldo di una persona è il suo patrimonio, e mostrarlo a un esercente non serve: il
> rifiuto per saldo insufficiente arriva comunque dal server, senza che nessuno in cassa debba
> sapere quanto c'è nel wallet.
>
> Rafforza anche l'argomento del circuito ristretto: ogni organizzatore vede la propria fetta
> e nessuno ha una vista d'insieme sui clienti.

---

## Restano aperti — ma non bloccano l'app di test

| Questione | Perché non blocca | Dove si chiude |
|---|---|---|
| Rimborso al cliente contro «niente cash-out» | Con soldi simulati non esiste rimborso | `BRIEF-LEGALE.md` Q1 |
| Chi paga il costo di incasso carta | Nessuna carta viene addebitata | `LEDGER-STORNI.md` parte 2 |
| Riserva sul payout per i chargeback | Nessun chargeback possibile | Coi soldi veri |
| Breakage sui saldi dormienti | L'app di test non vive abbastanza | Policy per giurisdizione |
| Cancellazione account con saldo residuo | Stesso nodo del rimborso | `BRIEF-LEGALE.md` Q1 |
| Lingue dell'interfaccia | Si parte in italiano; `apps/web/i18n.js` esiste già | Prima del pilota |
