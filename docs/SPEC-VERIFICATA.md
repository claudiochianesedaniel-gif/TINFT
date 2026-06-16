# TINFT — Specifica verificata (fonte di verità per l'implementazione)

> Documento prodotto **leggendo riga per riga la logica dei prototipi** (i blocchi
> `<script data-dc-script>` dei file `.dc.html`), non solo le descrizioni testuali.
> Ogni regola qui sotto ha il riferimento `file:riga` da cui è stata estratta, così
> è verificabile. È la base che smart contract + backend dovranno rispettare **1:1**.
>
> Legenda riferimenti: `App` = `design_handoff_tinft/TINFT - Prototipo App.dc.html`,
> `Console` = `… Console Web.dc.html`, `Sito` = `… Sito Web.dc.html`.

---

## 0. Decisioni tecniche (delegate dal committente: "la migliore per noi, più sicura e più semplice per il cliente")

### 0.1 Catena L2 → **Base** (testnet **Base Sepolia** per tutto lo sviluppo)
- **Più sicura per noi**: è un **rollup Ethereum (OP Stack)** che regola su L1 ed eredita
  la sicurezza di Ethereum (fault proofs attivi). Polygon PoS è una sidechain con set di
  validatori proprio → modello di fiducia più debole. Custodendo asset di terzi, l'ancoraggio
  a Ethereum è la scelta difendibile.
- **Più semplice per il cliente**: Base ha l'ecosistema più maturo per **account abstraction +
  on-ramp in euro** (Coinbase). Gas sponsorizzato (paymaster), wallet smart con passkey, acquisto
  in euro → esperienza "tutto in app, niente seed, niente gas".
- **Royalty enforced**: il Transfer Validator ERC-721C (Limit Break) è deployato su Base.
- Fee in frazioni di centesimo, adatte al volume biglietti.

### 0.2 Custodia / wallet → **custodial con account abstraction (ERC-4337)**
Stack: **Turnkey** (gestione chiavi custodial con policy engine) + **smart account ERC-4337**
(Kernel / ZeroDev) + **Paymaster** (Pimlico o Coinbase CDP) per il gas sponsorizzato; auth in-app
con **passkey/biometria**; **recovery legato all'identità SPID**.
- **Più sicura/migliore per noi**: restiamo **custodi** (il prodotto è custodial per design — cfr.
  §10 handoff "sei custode di asset per conto terzi"), con policy sul signing e recovery sotto
  nostro controllo via SPID.
- **Più semplice per il cliente**: login biometrico, **nessuna seed phrase, nessun gas**; il
  pagamento in euro conia automaticamente sul suo smart account.
- **Fallback rapido per MVP/pilota**: **Privy** (embedded wallets + AA integrata) se serve
  accorciare l'integrazione; meno controllo custodiale, stessa UX gasless/seedless.

---

## 1. Regole economiche — verificate dal codice

| # | Regola | Formula esatta (dal prototipo) | Riferimento |
|---|--------|--------------------------------|-------------|
| R1 | **Royalty 1% sul prezzo ORIGINALE**, split 0,5%+0,5%, a carico del compratore | `royC = round(price·0,005, 2)` (organizzatore); `royT = round(price·0,005, 2)` (TINFT); `royalty = royC+royT`; il compratore paga `prezzo + royalty` | `App:1661`, `App:1740-1742`, `App:1282` |
| R2 | **Tetto rivendita +5%** sul costo base del venditore | `cap = round(paid·1,05, 2)`; rifiuto se `prezzo > cap + 0,001` | `App:1274-1276` |
| R3 | **Costo base viaggia col token** | su trasferimento a pagamento il nuovo `paid = prezzo`; su regalo resta il `paid` precedente | `App:1743` |
| R4 | **Limite 2 per evento per identità** | acquisto/secondario: conta i biglietti `owner==identità && stesso evento && status∉{usato,exported}`; blocco se `≥ 2` | `App:1277-1278`, `App:1658-1659` |
| R5 | **Export (A) rilascio libero, fee 25%** | `exitFee = round(price·0,25, 2)`; `status='exported'`, `exportMode='free'` → fuori dalla rete royalty | `App:1769`, `App:1300` |
| R6 | **Export (B) enforced** | `exitFee = 0`, `exportMode='enforced'` → royalty 1% resta attiva per sempre | `App:1769`, `App:1440` |
| R7 | **Escrow P2P a pagamento** | `commitTransfer`: token tolto al venditore, record `status='escrow'`, `ttl=600s` (demo), `createdAt`; `acceptTransfer` assegna al compratore + accredita venditore; `reclaim`/timeout → torna al venditore | `App:1734-1764`, `_checkExpiry App:1722-1727` |
| R8 | **Trasferimento regalo** | `mode='regalo'`, `status='pending'`, gratuito; il destinatario accetta/rifiuta | `App:1747-1749`, `App:1752-1763` |
| R9 | **Commissione primario** | payout evento = `round(price·0,95)` → fee piattaforma **5%** | `App:1795`, `Sito` (publish) |
| R10 | **Commissione primario (vista aggregata)** | console: `commissioni = round(ricavi·0,04)` → **4%** | `App:1182`, `App:1213`, `Console:290` |

> ⚠️ **R9 ≠ R10**: il prototipo usa **5%** quando crea l'evento (payout 95%) ma **4%** nella vista
> ricavi aggregati. Vedi questione aperta Q1.

---

## 2. Macchine a stati (dal prototipo)

### 2.1 Ciclo di vita del biglietto (`status`)
```
attivo ──(validazione al varco)──► usato   (collectible / "mero NFT")
  │                                   │
  ├──(messa in vendita)──► vendita    └──(export, scelta cliente)──► exported
  │        │                                        ├─ exportMode='free'     (libero, fuori royalty)
  │        └──(annulla)──► attivo                   └─ exportMode='enforced'  (royalty 1% per sempre)
  └──(trasferimento P2P)──► [token in escrow/pending, fuori dal wallet]
```
- `App:1104` (mappa stati), `doScan` valid → `usato` `App:1690`, export `App:1769`.

### 2.2 Trasferimento P2P (`transfers[].status`)
```
pagamento:  escrow ──(accept = paga)──► done        ──(reclaim/timeout/cancel)──► (token al venditore)
regalo:     pending ─(accept)─► done                ──(reject/timeout)──────────► (token al venditore)
```
- record: `{id, fromUser, toUser, mode, prezzo, royalty, royC, royT, status, createdAt, ttl, ack, msg}` `App:1744-1749`.

### 2.3 Esiti validazione al varco (5)
`valid` · `screenshot` (codice non rotante/scaduto) · `duplicate` (già usato, sync tra varchi) ·
`escrow` (in trasferimento → **accesso negato**) · `fake` (firma non riconosciuta) — `App:1157-1163`, `App:1699-1702`.
- **QR rotante ogni 5s**: `seed = floor(now/5000)`, countdown `5 − (ts % 5)` — `App:1799-1800`, `App:1402`.
- **Offline**: coda `queued` + `syncOffline()` (sync tra varchi, dedup anti-doppio-accesso) — `App:1718-1721`.

---

## 3. Modello dati (verificato)
- **Ticket**: `{ id, owner, eventId, type('Ticket NFT'|'Fidelity'|'Special'), title, venue, price(face), paid(cost basis), status, exportMode('free'|'enforced'), exitFee, holder, saleMarket, endIn, refundIn }` — `App:1035-1039`.
- **Transfer**: `{ id, fromUser, toUser, mode('regalo'|'pagamento'), prezzo, royalty, royC, royT, status('pending'|'escrow'|'done'), createdAt, ttl, ack, msg, ticket{…snapshot} }` — `App:1744-1749`.
- **Account**: `{ nome, cognome, email, cf, verified(SPID), goodwill, initials }` — `App:1021-1026`, `App:1345`.
- **Evento (org)**: `{ id, title, date, type, price, payout, sold, capacity, status }` — `tinft-data.js`, `App:1795`.

---

## 4. Mappatura on-chain / off-chain
| Regola | On-chain (contratti, Base) | Off-chain (backend/PSP/SPID) |
|---|---|---|
| R1 royalty 1% split | EIP-2981 + SplitRoyalty 0,5/0,5; trattenuta via modulo vendita TINFT + Transfer Validator (ERC-721C) | calcolo importo euro, instradamento PSP |
| R2/R3 tetto +5% e costo base | `paid` per token; rifiuto `prezzo > paid·1,05` | UI prezzo, validazione lato API |
| R4 limite 2/evento | `mapping hash(CF) → eventId → count ≤ 2` | verifica identità SPID, CF cifrato off-chain |
| R5/R6 export | `exportFree()` (incassa 25% + delist dalla policy) / `exportEnforced()` | incasso fee in euro |
| R7 escrow | `list()` / `pay()` (release atomico token↔fondi+royalty) / `reclaim()` | il compratore paga in euro → backend regola l'escrow |
| R9/R10 commissione primario | — (fee di piattaforma/PSP) | PSP + payout ledger |
| Validazione | flag/evento `usato` on-chain; token in escrow bloccato | QR rotante, coda offline, sync varchi |
| Identità | solo `keccak256(CF + salt)` | SPID OIDC, storage CF cifrato, GDPR/AML |

---

## 5. Questioni aperte / incongruenze rilevate in fase di verifica
*(le risolvo come indicato salvo tua diversa indicazione — sono il valore del "verifichiamo prima")*

- **Q1 — Commissione primario 4% o 5%?** Il prototipo usa entrambi (payout 95% vs aggregato 4%).
  *Proposta:* fissare **un** valore (consiglio 5%, coerente col payout) e usarlo ovunque. Questa fee
  è di **piattaforma/PSP**, non nel contratto.
- **Q2 — Mercato "Re-Selling" vs trasferimento P2P diretto.** Il P2P diretto applica il tetto +5%
  (`App:1274`); il mercato secondario lista al **costo base** (`paid`, `App:1145`) senza markup.
  *Proposta:* applicare lo **stesso** tetto +5% anche al listing di mercato.
- **Q3 — Conteggio limite 2/evento.** Primario conta `status≠usato` (`App:1278`); secondario esclude
  anche `exported` (`App:1658`). *Proposta:* insieme canonico che "conta": `attivo + vendita + escrow
  in entrata`; **esclude** `usato` ed `exported`.
- **Q4 — Tipo "Fidelity" (carnet multi-ingresso, es. "3/5 usati").** Richiede un token a **usi multipli**
  (contatore di ingressi), diverso dal Ticket NFT a ingresso singolo. *Proposta:* ERC-721 con contatore
  `usesLeft` per token Fidelity; da validare in M1.
- **Q5 — `ttl` escrow.** Demo = 600s. *Proposta:* parametrico per evento (default proposto 30–60 min);
  da confermare con prodotto/legale.
- **Q6 — SPID OIDC vs SAML2.** SPID in produzione è prevalentemente **SAML2**; OIDC è disponibile via
  alcuni aggregatori/CIE. *Proposta:* integrazione tramite **aggregatore accreditato**; in dev usare
  ambiente di test/mock. Da decidere l'aggregatore (nodo §10).
- **Q7 — Finestra di rimborso (`refundIn`).** Presente nei biglietti ma non nelle regole economiche.
  *Da definire:* policy rimborso primario e rapporto con chargeback PSP.
- **Q8 — Collectible market post-evento** (`asta` / `BuyNow` / `fix price`, tipo `Special`): fuori dal
  percorso critico; da pianificare dopo M9.

## 6. Nodi legali/fiscali (da segnalare, non bloccanti per il codice)
Custodia asset per conto terzi; validazione legale tetto +5% e limite 2/evento; IVA su royalty e fee
d'uscita; sostituto d'imposta sui payout; GDPR (CF cifrato, on-chain solo hash); AML/KYC venditori sul
secondario. (Handoff §F, §10.)

---

## 7. Esito della verifica
I prototipi (App, Sito, Console) **condividono un unico "mondo"** (`localStorage['tinft_world']` +
`BroadcastChannel`) e implementano le regole economiche in modo **coerente tra loro**, con le sole
eccezioni puntuali Q1–Q3. Le 10 regole R1–R10, le 3 macchine a stati e il modello dati qui sopra sono
**verificati dal codice** e pronti a essere tradotti 1:1 in contratto + backend a partire da M0/M1.
