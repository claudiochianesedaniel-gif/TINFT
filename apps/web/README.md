# TINFT — Web (frontend)

Pagine **autonome, zero dipendenze** (si aprono nel browser). Applicano le **regole reali**
(fee di rivendita 1%: biglietto attivo → tutta a TINFT, post-evento 0,5/0,5; tetto +5%; limite 3/evento; fee export 25%; prevendita 10%) — le stesse di
`services/api/src/domain/rules.ts` e dei contratti M1–M5.

| File | Cosa |
|---|---|
| `sito.html` | **Sito Web pubblico**: vetrina/news, eventi in evidenza, acquisto → biglietto nel wallet. |
| `registrazione.html` | **Registrazione a wizard (3 step)**: Account → Dati SPID (CF, data/luogo nascita, indirizzo…) → Conferma. Manuale **o** SPID, **IT/EN**, design system condiviso. Invia a `POST /register`. |
| `demo.html` | **WebApp offline** (dati in memoria, sempre testabile): dashboard Cliente / Validatore / Organizzatore, Club + Fidelity, escrow con timer, QR rotante. |
| `app-live.html` | **WebApp connessa all'API reale**: club/eventi/acquisti/biglietti/validazioni via `fetch` → dati **persistenti e condivisi** tra i ruoli. |

## Modalità Live (app-live.html / registrazione.html)
Avvia il backend e apri la pagina:
```bash
pnpm --filter @tinft/api dev   # API su http://localhost:3001 (CORS abilitato)
```
Flusso verificato end-to-end: organizzatore crea club ed eventi → cliente si registra (SPID),
compra evento o Fidelity → validatore valida → i dati restano nel backend (sopravvivono al refresh).
