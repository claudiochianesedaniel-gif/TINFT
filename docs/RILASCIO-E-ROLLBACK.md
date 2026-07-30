# TINFT — Procedura di rilascio e rollback

> Come portare una modifica in produzione senza rischi, e come tornare indietro
> quando qualcosa va storto. **Da leggere prima del primo rilascio, non durante l'emergenza.**

---

## 1 · Gli ambienti

| Ambiente | Branch | URL | Database | Chiave on-chain |
|---|---|---|---|---|
| **Produzione** | `main` | `https://tinft-api.onrender.com` | `tinft-db` | presente (mint/burn reali) |
| **Staging** | `staging` | `https://tinft-api-staging.onrender.com` | `tinft-db-staging` | *assente per scelta* |

Sono **completamente separati**: database diversi, segreti diversi. Un token di staging
non è valido in produzione e viceversa.

> In staging conviene **non** impostare `CHAIN_PRIVATE_KEY`: senza chiave il backend non
> scrive sulla blockchain e le prove **non consumano gas**. La si imposta solo quando si
> vuole testare esplicitamente mint e burn.

### Creazione degli ambienti (una volta sola)
1. Render → **New → Blueprint** → repository TINFT.
2. Render legge `render.yaml` e crea **entrambi** i servizi e **entrambi** i database.
3. Inserire i segreti (`sync: false`) nella dashboard di ciascun servizio.
4. Creare il branch di staging: `git checkout -b staging && git push -u origin staging`.

---

## 2 · Flusso di rilascio (il percorso normale)

```
   lavoro su un branch
          ↓
   push  →  CI automatica (contratti · backend+Postgres · frontend · segreti)
          ↓  CI verde
   merge su `staging`  →  deploy automatico su staging
          ↓  verifica manuale (checklist §3)
   merge su `main`     →  deploy automatico in produzione
          ↓
   verifica post-rilascio (§4)
```

**Regola**: in produzione ci va solo ciò che è passato da staging. L'unica eccezione è un
*hotfix* di emergenza, che comunque richiede la CI verde.

### Comandi
```bash
# 1. la CI deve essere verde sul tuo branch
git push -u origin <mio-branch>

# 2. staging
git checkout staging && git merge --no-ff <mio-branch> && git push origin staging
#    → attendere il deploy e verificare su https://tinft-api-staging.onrender.com

# 3. produzione
git checkout main && git merge --no-ff staging && git push origin main
```

---

## 3 · Verifica su staging (prima di toccare la produzione)

- [ ] `GET /ready` risponde `{"ready":true,"store":true}`.
- [ ] Il **launcher** si apre e l'app carica senza errori in console.
- [ ] Login con i tre account demo.
- [ ] Acquisto: il totale include la **prevendita 10%**.
- [ ] Il **QR ruota** e il validatore restituisce **VALID** (con chiave on-chain: verifica anche il burn).
- [ ] Rivendita: oltre **+5%** viene rifiutata.
- [ ] Se ci sono **migrazioni nuove**: sono state applicate senza errori nei log di deploy.

---

## 4 · Verifica dopo il rilascio in produzione (2 minuti)

- [ ] `GET /ready` → ok.
- [ ] Il **live coincide col codice**:
  ```bash
  md5sum apps/web/app.html
  curl -s https://tinft-api.onrender.com/app.html | md5sum   # devono coincidere
  ```
- [ ] Nessun errore nei log di Render dopo l'avvio.
- [ ] Un flusso reale funziona (login + apertura biglietto).

---

## 5 · ROLLBACK

### 5.1 Rollback immediato (il più veloce — nessun codice)

**Quando**: il deploy è rotto e serve tornare online subito.

1. Render → servizio `tinft-api` → **Events**.
2. Individuare l'ultimo deploy **funzionante** (badge *live* verde).
3. **Rollback** → conferma.
4. Verificare `GET /ready` e il flusso principale.

⏱️ ~2 minuti. ⚠️ Riporta indietro **solo il codice**, non il database (vedi §5.3).

### 5.2 Rollback via git (quando serve traccia nella storia)

```bash
# annulla l'ultimo merge in produzione creando un commit di ripristino
git checkout main
git revert -m 1 <sha-del-merge>      # -m 1 = torna al ramo main precedente
git push origin main                  # riparte il deploy automatico
```

`revert` **non riscrive la storia**: è sempre preferibile a `reset --hard` su un branch
condiviso. Usare `reset --hard` solo se nessuno ha ancora scaricato quei commit.

### 5.3 Rollback di una migrazione del database ⚠️

Il punto più delicato: **il codice torna indietro, i dati no**.

- Una migrazione che **aggiunge** colonne o indici è quasi sempre **compatibile
  all'indietro**: il codice vecchio ignora le colonne nuove. In questo caso basta il
  rollback del codice (§5.1) — **non toccare il database**.
- Una migrazione che **rimuove o rinomina** colonne **rompe** il codice vecchio.
  In quel caso:
  1. Ripristinare il **backup** del database precedente al rilascio (Render → Database → *Backups*).
  2. Poi eseguire il rollback del codice.

> **Regola d'oro**: le migrazioni devono essere **additive**. Per rimuovere una colonna
> servono due rilasci: prima si smette di usarla, in un rilascio successivo si elimina.
> Così un rollback resta sempre possibile senza toccare i dati.

### 5.4 Rollback dei contratti

**Non esiste**: i contratti sono immutabili. Se un contratto ha un problema:
1. Deployare la versione corretta (`scripts/deploy-base-sepolia.sh`).
2. Aggiornare `TICKET_ADDRESS` nelle env di Render (e in `render.yaml`).
3. I token coniati sul vecchio contratto **restano lì**: va pianificata una migrazione.

È il motivo per cui l'**audit esterno prima del mainnet non è negoziabile.**

---

## 6 · In caso di emergenza — ordine delle operazioni

1. **Ripristinare il servizio** (rollback su Render, §5.1). Prima si torna online, poi si indaga.
2. **Verificare** `/ready` e un flusso reale.
3. **Capire cosa è successo**: log di Render, output della CI, ultimo diff.
4. **Correggere** su un branch, con la CI verde, passando da staging.
5. **Annotare** l'accaduto: cosa, perché, come evitarlo (un controllo in più nella CI vale più di un promemoria).

---

## 7 · Cosa protegge già la CI

Ogni push viene bloccato se:
- i test dei **contratti** falliscono (92 test) o il codice non è formattato;
- i test del **backend** falliscono (213 test + integrazione PostgreSQL reale) o il typecheck non passa;
- uno **script del frontend** ha un errore di sintassi;
- un **valore economico** nell'interfaccia non coincide con contratti e backend;
- un **segreto** finisce nel repository.

Non sostituisce la verifica su staging, ma evita che gli errori più comuni arrivino fin lì.
