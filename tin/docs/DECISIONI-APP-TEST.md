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
| **Nessun tetto** al saldo né alla ricarica giornaliera | Decisione presa. Vedi il riquadro sotto |

> **Tetti: decisione presa con riserva scritta.** Il tetto **esiste nel codice**, in
> `rules-tin.ts`, impostato su *nessun limite*. Accenderlo domani è cambiare un numero, non
> scrivere una funzionalità.
>
> Va agli atti perché senza tetto: l'esenzione «rete limitata» perde una delle poche difese
> concrete mostrabili a un'autorità — le soglie di valore per strumento sono uno dei criteri —
> e la piattaforma custodisce importi arbitrari per conto di persone non verificate.
> Introdurlo in seguito significherebbe bloccare clienti che hanno già saldi sopra soglia.
> Aggiunto alla Q2 del [`BRIEF-LEGALE.md`](./BRIEF-LEGALE.md): se nei Paesi del pilota una
> soglia è obbligatoria, lo dirà il legale.

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
| 🔒 QR **usa-e-getta**, `intent_id` come chiave di idempotenza | Un QR = una transazione. Doppio tap e retry non duplicano mai |
| **TTL 90 secondi**, ma la conferma **iniziata in tempo viene onorata** | La scadenza si blocca al momento della scansione: il cliente che sta già guardando il Face ID non si vede rifiutare il pagamento per due secondi di troppo. Il nonce resta monouso |
| Il punto vendita incassa **solo a evento aperto** | L'organizzatore apre e chiude. Un validatore che si tiene l'app aperta non incassa il giovedì successivo, e la chiusura dà un punto netto per il settlement |

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

🔒 **Solo storni totali.** 80,00 sbagliati si stornano interi, poi si incassano gli 8,00
giusti: due movimenti invece di uno, ma il ledger resta leggibile — ogni movimento ha
esattamente un contrario — e il doppio storno è impedito da un **vincolo del database**
(indice unico su `ref.reverses`) invece che da un calcolo di quanto è già stato stornato.

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
| 🔒 L'@handle **non è modificabile** dopo la registrazione | Vedi il riquadro sotto |
| Limiti residui **sempre visibili** nella schermata regalo | «Puoi ancora regalare 90 TIN oggi, a 3 persone diverse». I limiti sono una difesa antiabuso, non un segreto: chi vuole aggirarli li scopre in tre tentativi, chi è in buona fede resta solo bloccato senza capire — davanti agli amici, mentre offre da bere |
| Tetto per singolo regalo | **50 TIN** |
| Tetto giornaliero complessivo | **150 TIN** |
| Destinatari distinti al giorno | **5** |

> **Perché l'handle non si cambia.** I regali si indirizzano con l'@handle. Se un handle liberato potesse essere ripreso da un altro, chiunque potrebbe prendersi quello di una persona conosciuta e incassare i regali destinati a lei: in un'app di denaro un handle riciclato è un furto d'identità già pronto.
>
> **Verificato:** TINFT si comporta già così. `reserveUsername` è chiamato solo alla creazione dell'account, non esiste un percorso di modifica, e la validazione di formato (3–20 caratteri, minuscole, cifre, punto, underscore) con controllo di disponibilità live è già scritta. TIN eredita, non costruisce.

> **Perché tre limiti e non uno.** Il tetto per regalo da solo si aggira spezzettando
> l'importo; quello giornaliero lo copre. Ma il segnale che distingue davvero un regalo da
> una vendita è il **numero di destinatari**: si offre da bere a chi è con noi, si vende
> credito a sconosciuti. I limiti sono anche ciò che rende difendibile la posizione della
> piattaforma: il divieto di vendita è una regola scritta, i limiti sono un controllo.

Tutti configurabili, si alzano coi dati del pilota.

🔒 **Il «giorno» è una finestra mobile di 24 ore**, non la mezzanotte solare.

> Un evento va dalle 22:00 alle 4:00. Col giorno di calendario il tetto **si azzererebbe a
> mezzanotte, in mezzo alla serata**: chi vuole aggirarlo aspetta trenta minuti e ricomincia,
> e in una notte il limite vale il doppio proprio nelle ore in cui serve. Con la finestra
> mobile non esiste nessun momento in cui il contatore riparte da solo, e l'app può dire
> «torni a poter regalare alle 01:30» — una risposta precisa, non un rimprovero.

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

### Identità, accesso, sicurezza

| Decisione | Ragione |
|---|---|
| **Età minima 18 anni**, dichiarata alla registrazione | L'anagrafica chiede già la data di nascita: è un controllo, non un campo nuovo. Uno strumento prepagato è un contratto, e i punti vendita vendono alcolici. Resta una **dichiarazione**, non una verifica: l'età al bancone la controlla il validatore |
| Conferma del pagamento con **biometria**, e dove manca o fallisce un **PIN di TIN** | Nessuno resta escluso — telefoni senza sensore, dito bagnato dopo una birra. Il PIN vale **solo dentro TIN** e non è mai la password dell'account, che non deve essere digitata in un locale affollato dove chiunque può guardare |
| **Telefono perso:** si rientra da un altro telefono, il vecchio si disconnette all'istante | Coerente con «un solo dispositivo attivo». Il saldo è sul server, non nel telefono: non c'è nulla da recuperare, solo da riprendere. Nessuna superficie di blocco in più da proteggere |
| **Ricerca per @handle solo esatta**, nessuna ricerca parziale | Per regalare bisogna già sapere a chi: handle intero o scansione del suo QR. Nessuno può estrarre la lista degli utenti tre lettere alla volta, e nessuno riceve regali da sconosciuti che l'hanno trovato per caso |

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
> (`BRIEF-LEGALE.md` Q2.5). Vederlo funzionare presto vale più che semplificare.

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

## 13 · Il wallet del cliente

### 🔒 Il saldo TIN vive nel ledger, non sulla blockchain

Il cliente **ha già** uno smart account on-chain: `Account.walletAddress` esiste e il
ticketing lo usa per coniare i biglietti-NFT su Base. È naturale pensare che i TIN vadano lì.
Non devono.

> **Un token ancorato 1:1 all'euro e trasferibile su blockchain è un e-money token ai sensi
> del MiCA, emettibile solo da istituti di moneta elettronica o banche autorizzate.** Non è
> una complicazione tecnica in più: è esattamente la licenza che tutto l'impianto esiste per
> evitare, ottenuta per scelta di architettura.

E anche mettendo da parte il MiCA, on-chain si romperebbero quattro decisioni già prese:

| Cosa si rompe | Perché |
|---|---|
| Il circuito chiuso | Un token va a qualsiasi indirizzo, quindi anche a un exchange: è cash-out per costruzione, e nessun limite sul regalo lo ferma |
| Gli storni | L'organizzatore deve poter annullare un incasso sbagliato (§2). Su blockchain non si annulla: si spera che il destinatario restituisca |
| L'offline | Tetto e voucher firmati presuppongono un server che riconcilia. Senza rete non si scrive su catena |
| La coda | Aspettare la conferma di un blocco per una birra |

**Un account, due cose diverse:** i biglietti vivono on-chain perché devono essere posseduti e
rivenduti; i TIN vivono nel ledger perché devono essere spendibili, stornabili e offline.

> **Nota sulla valutazione futura.** La decisione registrata è «off-chain ora, on-chain da
> valutare». Va messo agli atti che quella porta non dà su una migrazione tecnica: dà su un
> **cambio di natura giuridica del prodotto** e su una licenza EMI. È una domanda per il
> legale (`BRIEF-LEGALE.md`), non per gli sviluppatori.

### Come si presenta

**TIN e biglietti separati, stesso login.** Due sezioni distinte — «Wallet» per i TIN,
«Biglietti» per gli NFT — con una sola registrazione. Coerente con i due prodotti non
comunicanti (§7), e più facile da difendere: il perimetro di TIN resta visibilmente netto.

**Un solo dispositivo attivo per volta.** Entrando da un telefono nuovo, il precedente si
disconnette. Il saldo è sul server, quindi non si perde nulla e il cambio telefono è un login.

> La ragione vera è l'offline: ogni dispositivo riserva una quota di saldo spendibile senza
> rete. **Due dispositivi attivi = due riserve sullo stesso denaro**, cioè doppia spesa per
> progetto, non per attacco. Va deciso ora anche se l'offline arriva dopo, perché toglierlo in
> seguito significa disconnettere utenti che ci si erano abituati.

### Cosa fa il wallet

| Funzione | Perché |
|---|---|
| Saldo e movimenti | Il minimo |
| **Ricevuta per ogni transazione** | Importo, punto vendita, evento, data, e le note del validatore. Con l'importo libero è l'unica prova di cosa è stato pagato: serve al cliente per contestare e all'organizzatore per rispondere |
| **Filtro per evento** | Con un saldo riutilizzabile tra eventi, senza filtro lo storico è illeggibile dopo la seconda serata |
| **Saldo negativo spiegato** | Se uno storno porta sotto zero, il wallet dice perché e cosa serve per rientrare, invece di mostrare 0,00 o un errore. Senza, il cliente vede solo un'app rotta |
| **Notifiche push** | Vedi l'elenco sotto |

## 14 · Dove si possono spendere i TIN

🔒 **Ovunque dentro il circuito TIN:** qualsiasi evento, di qualsiasi organizzatore
convenzionato, a qualsiasi suo punto vendita. Il saldo non è legato a un evento e si riusa
per sempre. È anche la ragione per cui il regalo ha senso: si regala credito che il
destinatario potrà spendere davvero, non un buono per una serata sola.

> **Attenzione a due estensioni che *suonano* uguali e non lo sono.** «Spendibili ovunque»
> dentro il circuito è ciò che abbiamo progettato e resta circuito chiuso. Ma:
>
> - **Spenderli fuori dagli eventi** (locali e negozi convenzionati tutto l'anno) trasforma il
>   circuito in una rete di pagamento generalista: l'esenzione «rete limitata» regge molto
>   meno. Da chiedere al legale **prima**, non dopo.
> - **Spenderli con chiunque, cioè fra persone in cambio di beni o servizi**, è cash-out del
>   venditore: money transmission, licenza EMI, KYC su tutti i clienti, AML. È la Fase 3, ed è
>   ciò che hai già deciso di tenere fuori.
>
> La decisione registrata è la prima. Se l'intenzione era più larga, va detto ora perché
> cambia il perimetro regolatorio, non una schermata.

## 14bis · Organizzatore sospeso

Se un organizzatore viene sospeso — KYB revocato, frode, fallimento — **si spengono le sue
casse, e i saldi dei clienti restano spendibili altrove**.

> È il vantaggio nascosto del saldo universale (§14): i TIN del cliente non sono «di» quel
> organizzatore, quindi restano spendibili a ogni altro evento del circuito. Nessun cliente
> perde nulla, e il problema resta dove deve stare — fra piattaforma e organizzatore.
>
> L'alternativa, congelare tutto, punirebbe migliaia di persone estranee per il
> comportamento di una: è il tipo di episodio che distrugge la fiducia sui fondi, cioè il
> rischio R4 dei documenti.

## 15 · Migliorie adottate

### Prevenire l'errore, non solo ripararlo

Il modello sa correggere bene (segnalazione, storno, contestazione) ma quasi nulla impediva
all'errore di accadere. Queste quattro chiudono il buco a monte.

| Miglioria | Perché |
|---|---|
| **Conferma sull'importo anomalo in cassa** | Se il validatore digita un importo molto fuori scala rispetto allo scontrino medio di quel punto vendita, l'app chiede conferma. Toglie alla radice l'errore che ci ha fatto progettare segnalazione e storno |
| **Riconciliazione continua del ledger** | L'invariante che nei test è condizione di completamento — somma dei saldi = somma dei movimenti — va verificata anche in esercizio, con allerta. Se non torna lo sai in minuti, non quando l'organizzatore chiede il payout su cifre sbagliate |
| **Evento di prova per lo staff** | Un evento finto dove il validatore si allena senza toccare denaro. Il giorno vero nessuno impara sul cliente in fila — ed è anche come si mostra il prodotto a un organizzatore prima che firmi |
| **Doppio tocco = «già pagato»** | L'idempotenza c'è nel ledger, ma va vista nell'interfaccia: chi tocca due volte legge «questo pagamento è già andato a buon fine», non un errore che lo spinge a ritentare o a discutere col validatore |

### In cassa

| Miglioria | Perché |
|---|---|
| **Importi rapidi personalizzabili** | Tre o quattro scorciatoie sopra il tastierino, impostate dall'organizzatore per punto vendita. **Non è un listino:** nessun prodotto, nessun catalogo, solo gli importi che ricorrono. Riduce tempi ed errori di battitura, che sono la causa degli storni |
| **Blocco della cassa dopo inattività** | Il telefono di servizio lasciato sul bancone si blocca da solo. È il dispositivo più facile da perdere di vista in tutta la serata, ed è l'unico che può generare richieste di incasso |
| **Il cliente vede chi lo sta incassando** | Sulla conferma compare il nome del validatore oltre al punto vendita. Chi incassa sa di essere identificato, e il cliente sa con chi ha parlato se qualcosa non torna |
| **Tetto per singola transazione** | Oltre una cifra alta la cassa non incassa senza sblocco dell'organizzatore. È la rete sotto la conferma dell'importo anomalo: se il validatore confermasse per distrazione, il danno ha comunque un limite |

### Lato cliente

| Miglioria | Perché |
|---|---|
| **Sezione «Eventi» con chi accetta TIN** | La scheda esiste già nei mockup e oggi non fa nulla: diventa l'elenco degli eventi del circuito. È la risposta a «a cosa mi servono i 40 TIN che mi restano» — cioè ciò che rende il saldo riutilizzabile un valore invece di un residuo |
| **Codice ricevuta breve e pronunciabile** (`TIN-4821-KX`) | Serve a dirlo a voce al banco: nessuno detta un identificativo di trentasei caratteri sopra la musica. Senza, ogni contestazione parte già male |
| **Regala il residuo a fine serata** | Chi resta con 3,50 TIN riceve la proposta di regalarli. Era già scritto nei documenti come mitigazione del rischio adozione e non era mai stato implementato. Riduce anche il breakage, che è un debito verso il cliente |
| **Avviso su accesso da un nuovo dispositivo** | Entrando da un altro telefono il vecchio si disconnette: chi lo subisce deve saperlo via email. È la difesa contro le credenziali rubate — senza avviso, il proprietario scopre il furto quando prova a pagare |

### Lato organizzatore e validatore

| Miglioria | Perché |
|---|---|
| **Chiusura di turno con riepilogo** | Il validatore chiude e vede quanto ha incassato e in quante transazioni. È il gesto che in ogni bar esiste già col fondo cassa, ed è ciò che dà senso ad avere validatori con nome e cognome |
| **Export contabile dei movimenti** | Il commercialista lo chiederà al primo evento: mezza giornata di lavoro contro settimane di richieste via email |
| **Allerta su comportamenti anomali** | Troppi storni su una stessa cassa, incassi fuori orario, un validatore molto sopra la media. L'antifrode dei documenti guarda solo il cliente; questa guarda dentro |
| **Il validatore vede solo i propri incassi** | Non quelli dei colleghi né il totale del punto vendita. Riduce l'attrito fra il personale e limita cosa vede chi ha in mano il telefono di servizio, che è il dispositivo più facile da perdere. La vista completa del punto vendita resta all'organizzatore |

### Prova di consegna

Il flusso finiva con «consegna il prodotto» e **nessuno registrava se fosse successo**: in una
contestazione non c'era prova né da una parte né dall'altra.

| Chi | Fa |
|---|---|
| **Validatore** | Marca **«consegnato»** con un tocco, dopo aver dato il prodotto |
| **Cliente** | Dalla ricevuta può dire **«non ricevuto»** e aprire la contestazione (§2) |

Un tocco in più in cassa, dopo che il cliente si è già allontanato — quindi non allunga la
coda. Chiude il rischio R4 dei documenti, la fiducia del pubblico sui propri soldi: senza,
in una lite vince sempre chi ha incassato.

### Il saldo in valuta

Sotto i TIN compare l'equivalente nella **valuta del cliente**, non in euro: `128,50 TIN ·
circa $138`. Predefinita la valuta dell'ultima ricarica, modificabile dalle impostazioni.

> Chi ricarica in dollari ragiona in dollari, e con la ricarica multivaluta è buona parte del
> pubblico. Il TIN resta l'unità con cui si paga: l'equivalente è solo un aiuto alla lettura,
> e non intacca l'ancoraggio 1 TIN = €1,00.

### Lingue

**Italiano e inglese** dal primo giorno. La ricarica multivaluta esiste perché il pubblico è
anche straniero: un festival che accetta dollari e sterline e poi parla solo italiano si
contraddice. Aggiungere lingue dopo significa ripassare ogni testo già scritto. In
`apps/web/i18n.js` l'impianto c'è già.

### Quali notifiche

| Notifica | Perché |
|---|---|
| **Movimenti** — pagamenti, ricariche, regali ricevuti | La difesa antifrode più efficace che esista: se qualcuno spende i tuoi TIN lo sai subito, non a fine serata |
| **Accesso da un nuovo dispositivo** | Chi subisce la disconnessione deve saperlo. Senza avviso, il proprietario scopre il furto quando prova a pagare |
| **Storni e contestazioni** | «L'organizzatore ha stornato 80,00 TIN», «la tua contestazione è stata accolta». Sono i momenti in cui il cliente aspetta una risposta sui propri soldi: il silenzio qui è ciò che rovina di più la fiducia |
| **Saldo negativo e come rientrare** | Altrimenti lo si scopre al primo pagamento rifiutato, in fila |

**Fuori:** nessuna notifica promozionale (eventi vicini, offerte) e nessun promemoria push
del residuo. Un'app di denaro che manda pubblicità viene silenziata — e con essa spariscono
anche le quattro notifiche sopra, che servono davvero. La proposta di **regalare il residuo**
resta, ma vive **dentro l'app** a fine serata, non come push.

### Ricarica minima

**10 TIN** per la ricarica manuale — lo stesso taglio dell'auto-ricarica, così è un solo
numero in tutto il prodotto.

> Sotto i 10 il costo fisso della carta pesa più del 4%: sono esattamente le ricariche che
> fanno perdere denaro alla piattaforma (punto A2 dell'audit). Con i soldi simulati non
> cambia nulla, ma la regola va nel codice adesso perché forma la UI.

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
