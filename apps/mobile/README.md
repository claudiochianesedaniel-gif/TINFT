# TINFT — App nativa di ACCESSO (Expo / React Native)

App mobile per l'**accesso ai biglietti** TINFT. Due ruoli:

- **Cliente** — apre i propri biglietti e mostra un **QR firmato a rotazione** (~30 s) all'ingresso.
- **Validatore** — al varco **scansiona il QR** (o, su Android, legge un **tag NFC**) e ottiene uno dei **5 esiti** applicati dal server: `VALID` · `SCREENSHOT` · `DUPLICATE` · `ESCROW` · `FAKE`.

> Questa è la **front-end di dispositivo**. Tutta la logica di validazione e i 5 esiti sono **enforced lato server** (già implementati e testati in `services/api`). L'app non decide nulla sulla validità: invia il token e mostra l'esito.

---

## QR universale, NFC come miglioria (solo Android)

Il **QR è il percorso universale** e funziona su iOS e Android:

- Il cliente mostra un token a vita breve, rigenerato ogni `rotateSeconds`. Uno **screenshot** scade in pochi secondi → il server risponde `SCREENSHOT`.
- Il validatore lo inquadra con la fotocamera e valida.

L'**NFC è un di più, solo su Android**, per due motivi tecnici:

- **Lettura** di un tag NFC (es. un wristband che contiene il token): tecnicamente possibile su entrambe le piattaforme, qui usata solo lato validatore Android.
- **Emulazione** di un tag da parte del telefono del cliente (perché un altro telefono lo legga con un "tap" peer-to-peer): richiede **HCE (Host Card Emulation)**, disponibile **solo su Android**. **iOS non può emulare un tag** per il peer-to-peer.

Conseguenza di prodotto: su iOS l'app mostra "**NFC tap non disponibile su iOS, usa il QR**". Su Android l'NFC è un'aggiunta opzionale; il QR resta sempre disponibile come fallback.

> Nota: in questa build demo l'HCE **lato cliente** non è attivo (mostrare il biglietto via tap). È implementata la **lettura NFC lato validatore** su Android (legge un token testuale da un tag NDEF e lo valida come un QR).

---

## Stack

- **Expo SDK ~51**, React Native 0.74, **TypeScript strict**
- **expo-router** (file-based) per la navigazione
- **expo-camera** (`CameraView` + barcode QR) per lo scanner
- **react-native-qrcode-svg** per il QR del cliente
- **expo-secure-store** per token + sessione (Keychain iOS / Keystore Android)
- **@react-native-async-storage/async-storage** per la **coda offline** delle scansioni
- **react-native-nfc-manager** per la lettura NFC su Android (config plugin)

---

## Struttura

```
apps/mobile/
├─ app/                         # rotte expo-router
│  ├─ _layout.tsx               # provider (auth, font, safe-area) + redirect login/area autenticata
│  ├─ index.tsx                 # Login (email+password, quick-pick account demo)
│  ├─ role.tsx                  # Scelta ruolo: Cliente / Validatore
│  ├─ cliente/
│  │  ├─ index.tsx              # Lista biglietti (GET /accounts/:id/tickets)
│  │  └─ [ticketId].tsx         # QR a rotazione (GET /tickets/:id/access-token)
│  └─ validatore/
│     ├─ index.tsx              # Gate PIN del varco (demo 1234)
│     └─ scan.tsx               # Scanner camera + NFC (Android) + coda offline + sync
├─ src/
│  ├─ config.ts                 # API_BASE (env/expo-constants), costanti demo
│  ├─ theme.ts                  # token di design (colori, raggi, font)
│  ├─ types.ts                  # tipi che rispecchiano l'API
│  ├─ api.ts                    # client fetch tipizzato (Bearer, errori, timeout)
│  ├─ session.ts                # persistenza token/account (secure-store)
│  ├─ auth-context.tsx          # contesto React di autenticazione
│  ├─ useRotatingToken.ts       # hook: polling + countdown del token QR
│  ├─ offline-queue.ts          # coda scansioni (AsyncStorage) + replay/sync
│  ├─ outcomes.ts               # mappa dei 5 esiti → colore/icona/testo
│  ├─ nfc.ts                    # wrapper NFC con guardie per piattaforma
│  ├─ format.ts                 # formattazioni (euro, stato biglietto)
│  └─ components/               # Screen, Header, Card, Button, Field, Banner, OutcomeView
├─ app.json                     # nome, permessi camera/NFC iOS+Android, config plugin
├─ app.config.ts               # inietta API_BASE da env in extra.apiBase
├─ eas.json                     # profili build EAS (development/preview/production)
├─ babel.config.js, metro.config.js, tsconfig.json
└─ .env.example
```

---

## Prerequisiti

- **Node ≥ 20** e npm (o pnpm/yarn).
- **Expo CLI** (usata via `npx expo`, non serve installarla globalmente).
- Per i **dev build** nativi:
  - **Android:** Android Studio + un emulatore o un device con **Debug USB**.
  - **iOS:** **macOS** + Xcode (i build iOS richiedono macOS), oppure usa **EAS Build** dal cloud.
- (Opzionale) **EAS CLI** per build in cloud: `npm i -g eas-cli`.

---

## Perché Expo Go NON basta

`expo-camera`, `react-native-nfc-manager` ed `expo-secure-store` includono **codice nativo** non presente nell'app **Expo Go**. Serve un **development build** (un'app che contiene questi moduli):

```bash
# dalla cartella apps/mobile (consigliato: install isolato dell'app)
npm install

# Android (emulatore o device collegato)
npx expo run:android

# iOS (richiede macOS + Xcode)
npx expo run:ios
```

In alternativa, build nel cloud con EAS (non serve Xcode/Android Studio in locale):

```bash
eas build --profile development --platform android
eas build --profile development --platform ios
```

Dopo il primo `run:*` (che compila ed installa il dev build), per le sessioni successive basta:

```bash
npx expo start --dev-client
```

> `npx expo start` da solo apre Expo Go: l'app **fallirà** al caricamento dei moduli nativi. Usa sempre il **dev build**.

> **pnpm in monorepo:** questa app è nel workspace pnpm (`apps/*`), ma è autosufficiente. È consigliato installare **dentro `apps/mobile`** con `npm install`. Se preferisci pnpm, abilita il linker hoisted (React Native non gestisce bene gli alberi non hoisted): aggiungi `node-linker=hoisted` a un `.npmrc` in `apps/mobile`, oppure usa `npm`/`yarn` per questa cartella.

---

## Collegare l'app al backend (`API_BASE`)

Il telefono **non** raggiunge il backend su `localhost` (per il telefono, `localhost` è il telefono). Imposta l'**IP LAN** della macchina che esegue l'API.

1. Avvia il backend (dal repo):
   ```bash
   cd services/api
   pnpm dev            # → TINFT API su http://localhost:3001 (host 0.0.0.0, raggiungibile in LAN)
   ```
   Il server è già in ascolto su `0.0.0.0`, quindi accetta connessioni dalla LAN. Carica un **mondo demo** con gli account qui sotto.

2. Trova l'IP LAN del PC: `ipconfig` (Windows) / `ifconfig` / `ip addr` (macOS/Linux), es. `192.168.1.50`.

3. Punta l'app a quell'IP (una delle due):
   ```bash
   # via variabile d'ambiente all'avvio di Expo
   API_BASE=http://192.168.1.50:3001 npx expo start --dev-client
   ```
   oppure copia `.env.example` → `.env` e imposta `API_BASE` (letto in `app.config.ts`).

   Per i build EAS, imposta `API_BASE` nel profilo dentro `eas.json`.

> Telefono e PC devono stare sulla **stessa rete Wi-Fi**. Su Android emulatore l'host è `10.0.2.2`; sul simulatore iOS funziona `localhost`. Su **dispositivo fisico** usa sempre l'**IP LAN**. In produzione usa l'URL `https://…` deployato.

L'app risolve `API_BASE` in quest'ordine: `extra.apiBase` (da `app.config.ts`) → `EXPO_PUBLIC_API_BASE` → default `http://localhost:3001` (`src/config.ts`).

---

## Account demo (password `demo123`)

| Email | Ruolo | Note |
|---|---|---|
| `cli@tinft.io` | Cliente (Marco) | possiede 1 biglietto attivo |
| `cli2@tinft.io` | Cliente (Giulia) | ha 1 biglietto in vendita (stato `LISTED` → esito `ESCROW`) |
| `org@tinft.io` | Organizzatore | usato qui come **validatore** (token Bearer valido per `POST /validate/scan`) |

PIN del varco (demo): **1234**.

---

## Come provarlo (flusso completo)

1. **Cliente:** accedi con `cli@tinft.io` → **Sono un Cliente** → apri il biglietto. Vedi il **QR che ruota** ("ruota tra Ns"). Tienilo aperto.
2. **Validatore:** su un secondo dispositivo (o dopo "Esci") accedi con `org@tinft.io` → **Sono un Validatore** → PIN `1234` → **Scansiona** il QR del cliente.
   - Prima scansione → **VALID** (verde ✓), con nome del possessore.
   - Scansiona di nuovo lo **stesso** biglietto → **DUPLICATE** (rosso ✕): è già stato usato.
3. **SCREENSHOT:** fai uno **screenshot** del QR, aspetta che il QR a schermo ruoti (>30 s), poi scansiona lo screenshot → **SCREENSHOT** (arancio !): il token è scaduto.
4. **ESCROW:** apri il biglietto di `cli2@tinft.io` (è `LISTED`/in trasferimento) e validalo → **ESCROW** (arancio ⏸).
5. **FAKE:** scansiona un QR qualsiasi non-TINFT → **FAKE** (rosso ✕): firma assente/non valida.
6. **Offline:** disattiva il Wi-Fi del telefono validatore e scansiona → la scansione va **in coda** (banner "in coda"). Riattiva la rete e premi **Sincronizza**: la coda viene rigiocata contro il server (vince il primo timestamp lato server).
7. **NFC (solo Android):** con un tag NDEF che contiene un token d'accesso valido come testo, premi **Leggi NFC** → stesso flusso di validazione. Su iOS il pulsante mostra l'avviso "usa il QR".

---

## API consumate

| Metodo | Endpoint | Uso nell'app |
|---|---|---|
| `POST` | `/auth/login` | login → `{token, account}` salvati in secure-store |
| `GET` | `/accounts/:id/tickets` | lista biglietti del cliente (Bearer) |
| `GET` | `/tickets/:id/access-token` | token QR a rotazione `{token, exp, rotateSeconds}` (Bearer, proprietario) |
| `POST` | `/validate/scan` | validazione: `{token}` → `{outcome, holderName?, meta?}` (Bearer) |
| `GET` | `/health` | ping/diagnostica |

Header: `Authorization: Bearer <token>`. Gli errori HTTP vengono normalizzati in `ApiError`; i fallimenti di **rete** sono distinti (`isNetwork`) per alimentare la **coda offline** del validatore.

---

## I 5 esiti (resi dall'app, decisi dal server)

| Esito | Colore | Icona | Significato |
|---|---|---|---|
| `VALID` | verde `#00cc88` | ✓ | accesso consentito (il biglietto passa a USED) |
| `SCREENSHOT` | arancio `#ff9900` | ! | QR scaduto: probabile screenshot |
| `DUPLICATE` | rosso `#ff5577` | ✕ | biglietto già validato |
| `ESCROW` | arancio `#ff9900` | ⏸ | biglietto in trasferimento/escrow: accesso sospeso |
| `FAKE` | rosso `#ff5577` | ✕ | firma assente o manomessa |

---

## Permessi nativi (già configurati)

- **iOS** (`app.json` → `infoPlist`): `NSCameraUsageDescription`, `NFCReaderUsageDescription`.
- **Android** (`app.json` → `permissions`): `CAMERA`, `NFC`.
- **Config plugin**: `expo-camera`, `expo-secure-store`, `react-native-nfc-manager` (genera l'entitlement/manifest NFC durante il prebuild).

Dopo aver modificato i plugin/permessi rigenera i progetti nativi:

```bash
npx expo prebuild --clean
```

---

## Script

| Comando | Cosa fa |
|---|---|
| `npm run android` / `npm run ios` | compila + installa il dev build e avvia il bundler |
| `npm start` | avvia solo il bundler (usa con un dev build già installato: aggiungi `--dev-client`) |
| `npm run typecheck` | `tsc --noEmit` (controllo dei tipi) |
| `npm run prebuild` | genera/aggiorna le cartelle native `android/` e `ios/` |

---

## Note e limiti

- **Non eseguibile in un ambiente senza dispositivo**: camera, NFC e secure-store richiedono un device/emulatore con un dev build. Il codice e la configurazione sono completi e idiomatici.
- Le versioni dei pacchetti sono fissate a valori coerenti con Expo SDK 51; in caso di disallineamenti dopo `npm install`, esegui `npx expo install --fix`.
- L'**HCE lato cliente** (presentare il biglietto via tap) non è incluso in questa demo: il QR è il canale primario e universale.
- La validazione e i 5 esiti sono **applicati dal server** (`services/api`), già testati; questa app è il front-end di dispositivo.
