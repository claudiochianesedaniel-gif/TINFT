# TINFT — Prova il prototipo (1 comando)

Il backend serve **sia l'API sia i frontend** e si avvia con un **mondo demo già caricato**: niente setup manuale, niente CORS, niente file://.

## Avvio
```bash
# 1) dipendenze (una volta sola, dalla root del repo)
pnpm install            # oppure:  cd services/api && npm install

# 2) avvia tutto (API + sito + web app + console + dati demo)
cd services/api
pnpm dev                # → TINFT API in ascolto su http://localhost:3001
```

## Apri nel browser
| Superficie | URL |
|---|---|
| **Sito pubblico** | http://localhost:3001/sito.html |
| **Web App** (cliente / organizzatore / validatore) | http://localhost:3001/app-live.html |
| **Console organizzatore** | http://localhost:3001/console.html |
| Registrazione | http://localhost:3001/registrazione.html |
| Demo offline (no API) | http://localhost:3001/demo.html |

## Account demo (password: `demo123`)
| Email | Ruolo | Note |
|---|---|---|
| `org@tinft.io` | Organizzatore | 2 club, 3 eventi in vendita, vendite + KYC verificato |
| `cli@tinft.io` | Cliente (Marco) | possiede 1 biglietto |
| `cli2@tinft.io` | Cliente (Giulia) | ha 1 biglietto in vendita sul mercato |

Le app si **collegano da sole** all'account demo del ruolo scelto; aprendole **senza** API attiva funzionano comunque in **modalità demo offline** (dati mock) e non restano mai vuote.

## Regole economiche attive
- **Prevendita 10%** sul primo acquisto → **solo TINFT** (mostrata nel checkout: Prezzo · Commissione di prevendita 10% · Totale).
- Rivendita: **royalty 1%** (0,5% TINFT + 0,5% organizzatore), **tetto +5%**, **max 2 biglietti/evento** per identità.
- Export libero: **fee d'uscita 25%**.

## Note
- Persistenza: **in-memory** (i dati demo si ricaricano a ogni riavvio). Per Postgres vedi `docs/PERSISTENCE.md`.
- Disattivare il seed demo: `SEED_DEMO=0 pnpm dev`.
- Pagamenti reali (Stripe) e SPID OIDC: non attivi nel prototipo (vedi `.env.example`).
