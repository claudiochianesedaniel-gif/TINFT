# TIN — Wallet a circuito chiuso per eventi TINFT

> Documento unico di sintesi. Raccoglie tutte le decisioni prese e lo stato del progetto.
> **Nota:** non costituisce consulenza legale né finanziaria. Il modello va validato da un legale fintech prima del go-live.
> Ultimo aggiornamento: Luglio 2026 · v1

---

## 0. La verità scomoda (leggere prima)

Quello che stiamo costruendo **non è "una moneta di gioco"**: è denaro prepagato. Il momento in cui un cliente può riconvertire valore in denaro (cash-out o vendita di coin ad altri clienti), TIN diventa **money transmission / e-money** e serve una licenza EMI. Tutto il modello qui sotto è progettato per **restare fuori** da quel perimetro, tenendo il sistema a **circuito chiuso**. Il confine è netto e va difeso a livello di prodotto.

---

## 1. Cos'è TIN

Un portafoglio prepagato **a circuito chiuso** per eventi. Il denaro entra **una volta** (ricarica), gira come coin dentro il circuito (spesa, regalo), ed esce **una volta** (settlement all'organizzatore).

- **Nome / ticker:** TIN ("TINFT Coin")
- **Ancoraggio:** 1 TIN = **€1,00** fisso. Non fluttua.
- **Cambio valuta:** solo alla ricarica (compri in USD/GBP/… → ricevi TIN al tasso del momento). Dopo, valore fisso.
- **Decimali:** 2 (centesimi di TIN).
- **Chi incassa in fiat:** **solo l'organizzatore** (vende beni propri: drink, cibo, merch).
- **Device:** solo smartphone, app TINFT. **Nessun hardware esterno** (vincolo di prodotto ereditato da TINFT).

### Cosa È / Cosa NON È
- **È:** portafoglio prepagato closed-loop. Denaro custodito, coin come scrittura contabile interna.
- **NON è:** un conto, un cash-out per il cliente, un mercato dove i clienti si rivendono coin per soldi.

---

## 2. Le tre utenze

| Utenza | Ruolo | Cosa fa |
|---|---|---|
| **Cliente** | Spende i coin | Ricarica in valuta a scelta, paga ai punti vendita (QR/NFC), regala TIN ad altri clienti. Nessun cash-out. Saldo riutilizzabile tra eventi. |
| **Organizzatore** | Incassa i coin | Definisce punti vendita e prezzi in TIN, riceve i coin dei beni venduti, converte TIN → fiat (settlement) meno commissione. Unico che porta denaro fuori dal circuito. |
| **Validatore** | Valida le transazioni (per l'organizzatore) | Al punto vendita: **(1)** conferma l'incasso, **(2)** verifica anti-frode sopra soglia, **(3)** consegna il prodotto dopo il pagamento. Non tocca il denaro. |

---

## 3. Ciclo di vita di un coin

```
Ricarica → Circola → Incasso → Settlement
fiat→TIN   spesa/regalo   organizzatore   TIN→fiat
```

Il denaro entra al passo 1 ed esce al passo 4. In mezzo nessuna transazione crea o distrugge valore in fiat: è ciò che tiene il modello nel circuito chiuso.

---

## 4. Ancoraggio e cambio valuta

- 1 TIN = €1,00, sempre.
- Il cambio agisce **solo alla ricarica**, con spread. Tasso bloccato per ~60s (quote lock).
- **Esempio:** voglio 50,00 TIN, pago in USD (tasso 1,08) → $54,00 + spread 1% ($0,54) → **addebito $54,54**.
- Perché non fluttuante: un coin variabile impedirebbe all'organizzatore di prezzare in modo stabile e sarebbe di fatto un cambio valuta interno (obblighi contabili/regolatori molto più pesanti).

---

## 5. Commissioni — modello ricavi

> **L'1% piatto su tutto NON funziona:** incassare con carta costa ~1,5–2,9% + fisso; l'1% sulla ricarica va in perdita. Il margine sta a valle.

| Evento | Chi paga | Aliquota | Logica |
|---|---|---|---|
| Ricarica (fiat→TIN) | Cliente | costo carta ribaltato | Non è un ricavo; la ricarica dev'essere indolore |
| Spread cambio | Cliente (solo estero) | 0,75–1,0% | Copre rischio FX; nullo in EUR |
| Regalo P2P | — | **0%** | Nessun denaro si muove |
| **Incasso / settlement** | **Organizzatore** | **3%** (confermato) | **Ricavo principale** |
| Breakage | — | policy | Margine latente, non garantito (vedi §10) |
| Vendita P2P a pagamento | — | Fase 3 | Fuori dal circuito chiuso — richiede EMI |

---

## 6. Flussi

### 6.1 Ricarica (Cliente)
1. Sceglie valuta + importo in TIN.
2. Vede il preventivo (cambio + spread, totale). Tasso bloccato 60s.
3. Paga (carta / Apple-Google Pay / SEPA). Fondi custoditi presso PSP.
4. Successo → accredito TIN al tasso bloccato. Fallimento → rollback, nessuna scrittura.

### 6.2 Spesa al punto vendita — 3 varianti (consigliata: A)
- **A (consigliata):** il validatore digita l'importo → QR di richiesta; il cliente scansiona, vede prezzo, conferma con biometria; server sposta TIN → organizzatore.
- **B:** il cliente mostra un QR dinamico; il validatore scansiona e digita l'importo.
- **C:** NFC "tap" tra i due telefoni (supporto non uniforme, soprattutto iOS).

Il validatore poi **consegna il prodotto**. Il QR è a tempo e usa-e-getta; l'`intent_id` è la chiave di idempotenza (un QR = una transazione).

### 6.3 Regalo P2P (Cliente → Cliente)
- Scegli importo + destinatario → trasferimento atomico TIN, **fee 0%**.
- **Confine:** se al regalo si affianca un pagamento in denaro tra i due, diventa **vendita → cash-out → fuori dal circuito chiuso**. Bloccato in Fase 1, rimandato alla Fase 3 con partner EMI.

### 6.4 Settlement (Organizzatore → fiat)
1. Onboarding + KYB azienda (payout bloccato finché incompleto).
2. Accumula i TIN incassati.
3. Richiede payout, sceglie valuta (FX se ≠ EUR).
4. TIN → fiat via PSP, meno 3%.
- **Esempio:** 14.820 TIN − 3% (€444,60) → **€14.375,40** sul conto.

---

## 7. Offline (nell'MVP — confermato)

Agli eventi affollati la rete crolla. Modello sicuro:
- **Tetto offline:** all'ingresso l'app riserva una quota del saldo (es. 50 TIN) spendibile senza rete.
- **Voucher firmati:** ogni pagamento offline è firmato dal device, con nonce progressivo.
- **Riconciliazione:** al ritorno della rete i voucher si sincronizzano e si detraggono dal saldo reale.
- **Rischio residuo:** doppia spesa entro il tetto se un device è compromesso. Si contiene con tetti bassi + nonce, non si azzera. Partenza consigliata: tetti bassi, alzati con i dati.

---

## 8. Brand

- **Nome:** TIN (scelto). Alternativa scartata: "Tabo".
- **Look:** ereditato da TINFT — fondo notte `#0A0A0A`, superficie `#141416`, testo `#ECECEC`.
- **Colori (solo TINFT, nessun colore nuovo):** azzurro `#4F7CF0` = azioni/navigazione; verde `#35CF93` = denaro/saldo/successo; gradiente azzurro→verde riservato a coin e brand.
- **Logo:** coin flat (stile stablecoin), cerchio con gradiente azzurro→verde, monogramma **T** con taglio diagonale in negativo. (Volutamente diverso dal glifo ₮ di Tether.)
- **Tipografia:** Sora (brand/headline) · Space Grotesk (interfaccia) · JetBrains Mono (importi/codici).

---

## 9. Architettura tecnica (sintesi per sviluppatori)

**Principi non negoziabili:**
1. Il **ledger è la verità** — saldi come somma di movimenti immutabili (append-only), mai un campo mutabile.
2. Denaro fuori solo ai due estremi (ricarica, settlement).
3. Ogni transazione **atomica e idempotente** (doppio tap / retry / QR riusato non duplicano mai).
4. Solo smartphone.

**Componenti:** App mobile (3 modalità per ruolo) · Ledger service · FX service (quote lock) · Payments/PSP (custodia + payout) · Identity/KYB · Anti-frode.

**Ledger — regola chiave:** importi in **centesimi interi** (es. `1450` = 14,50 TIN). **Mai float.** Formattazione solo in UI.

```
Entry { id, ts, type: topup|spend|gift|settlement|fee,
        from_account, to_account, amount_tin: int,
        idempotency_key, ref:{event_id,pos_id,nonce,fx_quote_id?} }
// saldo = Σ(to==acct) − Σ(from==acct)
```

**API MVP:** `POST /topup/quote` · `/topup/confirm` · `/charge/intent` · `/charge/confirm` · `/gift` · `/settlement/payout` · `GET /wallet` · `/dashboard`.

**Sicurezza:** biometria sulla spesa · QR/intent a TTL breve + nonce monouso · idempotency key su ogni transfer · rate limiting + velocity · verifica extra sopra soglia · chiavi voucher offline rotate per turno · audit log immutabile.

---

## 10. Policy breakage (punto 05)

> Il breakage **non è "incasso del residuo"**: è un campo minato legale. Finché il saldo esiste è un **debito** verso il cliente, non un utile.

**Tre regimi possibili (per Paese):** nessuna scadenza (fondi sempre dovuti) · escheatment (dopo N anni al fisso allo Stato) · decadenza limitata (solo oltre durata minima + avvisi).

**Default prudente proposto:**
- Saldo = passività finché non estinto per legge. Mai a ricavo prima.
- Inattività minima ≥ 24 mesi (da tarare per Paese).
- ≥ 2 avvisi prima di qualsiasi azione + rimborso sempre possibile.
- Escheatment dove previsto invece del breakage.
- Parametri configurabili **per giurisdizione**, non hardcoded.
- **Tenuto fuori dalle proiezioni di break-even** (upside, non voce su cui costruire il conto economico).

---

## 11. Unit economics — evento tipo (illustrativo)

Ipotesi: festival 3 giorni, 20.000 partecipanti, spesa media 45 TIN.

| Voce | Valore |
|---|---|
| Volume ricaricato (GMV) | €900.000 |
| Ricavo settlement 3% | €27.000 |
| Spread cambio (≈30% esteri, 1%) | €2.700 |
| Costi PSP payout + infra (≈0,5% GMV) | −€4.500 |
| **Margine lordo / evento** | **≈ €25.200 (≈2,8% GMV)** |

Il margine scala col GMV, non con hardware da acquistare. Breakage escluso (upside).

---

## 12. Roadmap

- **MVP:** ricarica multivaluta, spesa QR (Variante A), regalo P2P gratuito, dashboard + settlement 3%, offline con tetto. Nodo: KYB organizzatore, PSP con custodia fondi.
- **Fase 2:** NFC, più valute, self-onboarding organizzatori, breakage. Nodo: policy breakage per Paese.
- **Fase 3:** vendita P2P a pagamento, cash-out cliente (eventuale). Nodo: **partner EMI / licenza, KYC, AML**.

---

## 13. Rischi principali

- **R1 Regolatorio:** superata la soglia "rete limitata" serve EMI → scegliere subito un PSP con percorso e-money.
- **R2 Connettività:** rete assente → offline con tetto e voucher firmati.
- **R3 Adozione:** il pubblico non ricarica → ricarica indolore, regalo del residuo, saldo riutilizzabile.
- **R4 Fiducia sui fondi:** custodia presso PSP, termini chiari, saldo sempre visibile.

---

## 14. Nodo regolatorio

| Scenario | Inquadramento | Cosa serve |
|---|---|---|
| Circuito chiuso (questo modello) | Esenzione "rete limitata" PSD2/EMD2 | Termini chiari, KYB organizzatore, custodia fondi presso PSP; niente cash-out cliente |
| Cash-out organizzatore | Pagamento di fornitura di beni propri | Contratto incasso + KYB + payout via PSP |
| **Vendita P2P a pagamento (Fase 3)** | Il venditore fa cash-out → e-money | **Partner EMI o licenza, KYC, AML, protezione fondi** |

L'esenzione "rete limitata" ha soglie (numero eventi, valore, notifica all'autorità in alcuni Paesi). Crescendo si entra comunque nel perimetro EMI → conviene un PSP con percorso e-money dal MVP. **Da confermare con un legale.**

---

## 15. Come andare live

**Bloccanti (in parallelo, tempi lunghi):**
1. **Legale fintech** conferma l'esenzione closed-loop nei Paesi del pilota + redige Termini (incluso breakage).
2. **PSP** con incasso multivaluta, conto di salvaguardia, payout con KYB, **e** percorso verso l'e-money per la Fase 3.

**Poi:**
3. Scope MVP congelato (solo online, spesa Variante A, regalo gratuito, settlement 3%).
4. Build + hardening (ledger, idempotenza, anti-frode, biometria).
5. Pilota controllato: 1 evento medio, tetti bassi, organizzatore già su TINFT. Metriche: coda vs contante, scontrino medio, % ricariche completate, incidenti.
6. Scala: offline, più valute, self-onboarding. Poi valutare Fase 3 (EMI).

**Decisioni aperte:** quali Paesi per il pilota; contatto legale/PSP già esistente o shortlist da preparare.

---

## 16. Deliverable prodotti

1. Relazione Modello · 2. Diagrammi Flussi · 3. Brand e Logo · 4. Design UI/UX (11 schermate) · 5. Prototipo App navigabile (3 utenze) · 6. Business Plan · 7. Relazione Sviluppatore · 8. Presentazione Flussi (deck) · 9. Policy Breakage.
