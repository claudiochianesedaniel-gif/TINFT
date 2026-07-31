# TIN — storni nel ledger e prezzo della ricarica

> Proposta tecnica per i due punti che l'audit segnala come da chiudere **prima della prima
> riga di codice**, perché cambiano il modello dati e la UI.
> Da leggere dopo `TIN - Relazione Sviluppatore.dc.html`.
>
> Stato: **proposta da approvare** · Luglio 2026

---

# Parte 1 · Storni

## Il problema

Il ledger è append-only e ha cinque tipi di movimento: `topup`, `spend`, `gift`,
`settlement`, `fee`. Nessuno di questi può rappresentare denaro che **torna indietro**. Ma
almeno tre scenari lo richiedono, e sono tutti previsti dai documenti stessi:

| Scenario | Come nasce | Perché è inevitabile |
|---|---|---|
| **Chargeback** | Ricarica con carta rubata o contestata; la banca storna mesi dopo | Il rischio esiste su qualsiasi incasso con carta |
| **Rimborso** | La Policy Breakage promette il rimborso su richiesta | È scritto nel modello |
| **Pagamento contestato** | Il cliente paga, il validatore non consegna | La consegna avviene **dopo** il pagamento, per progetto |

Senza un modo di rappresentarli, l'unica via che resterebbe a uno sviluppatore è modificare
un movimento esistente o cancellarlo — cioè rompere l'append-only, che è il primo dei
principi non negoziabili.

## La regola

> **Uno storno non è una modifica: è una nuova entry che punta a quella originale.**

Il movimento originale resta lì per sempre, immutabile. Lo storno è un movimento uguale e
contrario, con un riferimento a quello che annulla. Il saldo continua a essere la somma di
tutto, senza eccezioni:

```
saldo(acct) = Σ(amount dove to == acct) − Σ(amount dove from == acct)
```

## Modello dati

```
Entry {
  id: uuid,
  ts: timestamp,
  type: "topup" | "spend" | "gift" | "settlement" | "fee" | "reversal",
  from_account: id,
  to_account: id,
  amount_tin: int,              // centesimi interi, sempre positivo
  idempotency_key: string,      // unico a livello di tabella
  ref: {
    event_id?, pos_id?, nonce?, fx_quote_id?,
    reverses?: uuid,            // id dell'entry stornata — solo su type=reversal
    reason?: "chargeback" | "refund" | "dispute" | "correction",
    external_ref?: string       // id del caso presso il PSP
  }
}
```

Tre vincoli da mettere nel database, non nel codice applicativo:

1. `type = 'reversal'` ⇒ `ref.reverses` **obbligatorio** e riferito a una entry esistente.
2. **Una entry si può stornare una volta sola**: indice unico su `ref.reverses`. È la
   protezione contro il doppio storno del chargeback ritentato.
3. `from`/`to` dello storno sono **invertiti** rispetto all'originale, e `amount_tin` è
   identico. Uno storno parziale è fuori scope: se serve, sono due entry (storno totale +
   nuovo movimento).

```
reverse(entry_id, reason, external_ref):
  begin tx
    orig = lock(entry_id)                          # SELECT ... FOR UPDATE
    if exists(reversal where reverses == entry_id):
      return stored_result                          # idempotente
    insert Entry{
      type: "reversal", from: orig.to, to: orig.from,
      amount_tin: orig.amount_tin,
      idempotency_key: "rev:" + entry_id,
      ref: { reverses: entry_id, reason, external_ref }
    }
  commit
  push(orig.from.device); push(orig.to.device)
```

L'`idempotency_key` derivata da `entry_id` fa sì che un webhook di chargeback consegnato due
volte produca **una sola** scrittura, senza logica aggiuntiva.

## Il caso difficile: i TIN sono già stati spesi

È lo scenario realistico del chargeback. Il cliente ricarica 50 TIN alle 21:00, li spende
entro le 23:00, la banca storna a settembre. Stornare la ricarica porta il saldo del cliente
a **−50 TIN**.

**Il saldo negativo va permesso e reso visibile.** L'alternativa — rifiutare lo storno perché
il saldo non basta — lascerebbe il ledger a raccontare che il denaro c'è quando non c'è più.
Il ledger deve restare fedele ai fatti; è la UI che deve spiegarli.

Conseguenze da implementare:

- Un account con saldo negativo **non può spendere, regalare né ricevere payout**.
- La prima ricarica successiva **estingue il debito** prima di accreditare saldo spendibile.
- L'app mostra il saldo negativo con la sua ragione, non un "0,00" che nasconde il problema.
- Oltre una soglia di anzianità o importo, l'account va sospeso e il caso passa al recupero.

Chi assorbe la perdita finché il debito non rientra è una **domanda aperta al legale**
(`BRIEF-LEGALE.md` Q6): la piattaforma, o l'organizzatore che ha già incassato.

## Riserva sul payout

L'organizzatore incassa TIN durante l'evento e chiede il payout subito dopo. La finestra di
chargeback sulle carte è invece lunga — mesi. Se il payout è integrale e immediato, ogni
chargeback successivo è una perdita secca per la piattaforma.

Proposta, **da validare col legale e col PSP** perché va dichiarata nel contratto:

| Parametro | Valore proposto | Nota |
|---|---|---|
| Quota trattenuta | 5% del payout | [Ipotesi — da tarare sui dati reali di frode] |
| Durata | 90 giorni dalla fine dell'evento | Copre la finestra tipica; **da verificare per circuito** |
| Rilascio | Automatico a scadenza, meno gli storni maturati | Visibile in dashboard fin dal primo giorno |
| Primo evento di un organizzatore | Quota più alta | Nessuno storico su cui basarsi |

Va mostrata nella dashboard dell'organizzatore **prima** del primo payout, non scoperta dopo.

## Impatto su quanto già scritto

- `TIN - Relazione Sviluppatore.dc.html` — aggiungere `reversal` all'enum, i tre vincoli, il
  saldo negativo e la riserva.
- `TIN - Documento Unico.md` §9 — enum aggiornato ✅ (fatto), §13 rischio R5 ✅ (fatto).
- `POST /settlement/payout` — deve restituire lordo, riserva trattenuta e netto, separati.
- Nuovi endpoint: `POST /reversal` (interno, da webhook PSP), `GET /reserve` (organizzatore).

---

# Parte 2 · Il prezzo della ricarica

## Il problema

Tre documenti dicono che il costo di incasso carta è **ribaltato sul cliente**, e le unit
economics contano quella voce **€0** proprio per questo. Ma nelle due UI il riepilogo della
ricarica ha tre righe — Cambio, Spread 1%, Addebito — e il costo carta non compare.

In valuta estera il problema è mascherato: lo spread dell'1% assorbe parte del costo. In
**EUR lo spread è zero per definizione**, quindi il cliente paga €50,00 per 50 TIN e la
piattaforma paga il PSP di tasca propria.

## Cosa succede se si assorbe il costo

Evento tipo del Business Plan: GMV €900.000, margine dichiarato €25.200.

| Ricarica media | PSP 1,5% + €0,25 | PSP 2,0% + €0,25 | PSP 2,9% + €0,25 |
|---|---|---|---|
| 25 TIN | margine **€2.700** | **−€1.800** | **−€9.900** |
| 50 TIN | **€7.200** | **€2.700** | **−€5.400** |
| 100 TIN | **€9.450** | **€4.950** | **−€3.150** |

Assorbire il costo **cancella il margine dell'evento**, e con le condizioni PSP peggiori lo
rende negativo. Non è un'opzione: la struttura commissionale va cambiata o va reso esplicito
il ribaltamento.

Si vede anche una cosa utile: **poche ricariche grandi costano molto meno di tante piccole**,
perché il costo fisso per transazione pesa sul numero di ricariche, non sul volume.

## Le tre opzioni

### A · Commissione di ricarica esplicita **(raccomandata)**

Una quarta riga nel riepilogo, sempre visibile, anche in EUR.

| Importo | Fee a 1,9% + €0,25 | Peso | Addebito |
|---|---|---|---|
| 10 TIN | €0,44 | 4,40% | €10,44 |
| 25 TIN | €0,72 | 2,90% | €25,73 |
| 50 TIN | €1,20 | 2,40% | €51,20 |
| 100 TIN | €2,15 | 2,15% | €102,15 |
| 200 TIN | €4,05 | 2,02% | €204,05 |

**Pro:** onesto, copre il costo, e la componente fissa spinge naturalmente verso ricariche
grandi — che è anche l'interesse della piattaforma.
**Contro:** è attrito visibile, contro l'obiettivo dichiarato di una "ricarica indolore".
Su 10 TIN il 4,4% si nota.

**Mitigazioni:** importo minimo di ricarica (es. 20 TIN) che elimina il caso peggiore;
importi suggeriti che partono da 25; la fee azzerata sopra una soglia (es. 100 TIN), pagata
dal margine sui volumi maggiori.

### B · Prezzo tutto compreso

Nessuna riga separata: gli importi ricaricabili sono fissi e già comprensivi (paghi €51,20,
ricevi 50 TIN). Più semplice da capire, ma il cliente vede che €51,20 non fanno 50 TIN e non
gli è spiegato perché. Peggiora la percezione invece di migliorarla.

### C · Assorbire il costo

Non sostenibile con questo modello, come mostra la tabella sopra. Diventerebbe possibile solo
alzando la commissione di settlement ben oltre il 3% — cioè spostando il costo
sull'organizzatore invece che sul cliente. È una scelta legittima, ma va fatta consapevolmente
e rifacendo le unit economics.

## Raccomandazione

**Opzione A, con importo minimo di ricarica e fee azzerata sopra soglia.** Da decidere:
percentuale e fisso esatti (dipendono dal PSP), l'importo minimo, la soglia di azzeramento.

## Cosa cambia nella UI

Riepilogo della ricarica, quattro righe invece di tre — e in EUR le prime due valgono zero
ma **restano visibili**, così il cliente vede sempre la stessa struttura:

```
Cambio USD (1,08)              $54,00
Spread cambio 1%                $0,54
Commissione di ricarica         $1,29     ← nuova
─────────────────────────────────────
Addebito                       $55,83
Ricevi                      50,00 TIN
```

Da aggiornare: `TIN - Design UI-UX.dc.html` (schermata Ricarica),
`TIN - Prototipo App.dc.html` (`s_cli_ricarica` e il calcolo in `renderVals`),
`TIN - Business Plan.dc.html` (tabella ricavi e unit economics),
`TIN - Documento Unico.md` §5.

## Nota sulle unit economics

Indipendentemente dall'opzione scelta, il Business Plan calcola il 3% sul **GMV ricaricato**
mentre la riga dice "3% del **venduto**". Coincidono solo se ogni TIN ricaricato viene speso
— cioè se il breakage è zero, mentre il breakage è contato altrove come upside. Va scelta una
base, dichiarata, e usata coerentemente.
