# TINFT — App mobile (validazione QR + NFC)

App **Expo / React Native** (`apps/mobile`) per l'**accesso ai biglietti**: il cliente mostra un
**QR a rotazione** (token che cambia ogni ~30s), il validatore lo **scansiona** al varco. Su
**Android** si può anche **leggere via NFC** un tag che porta lo stesso token.

L'app punta **di default al backend online** `https://tinft-api.onrender.com` (override con
`API_BASE` / `EXPO_PUBLIC_API_BASE`). File chiave: `src/config.ts`, `src/nfc.ts`,
`app/validatore/scan.tsx`, `app/cliente/[ticketId].tsx`, `src/useRotatingToken.ts`.

## ⚠️ NFC: cosa funziona davvero
- **Lettura** di un tag NFC che porta il token: **Android** sì (CoreNFC su iOS è limitato).
- **Emulazione** del biglietto telefono→telefono (HCE): **solo Android**. **iPhone NON può** emulare
  un tag per il peer-to-peer (limite Apple) → su iPhone il percorso è il **QR** (o Apple Wallet/PassKit, futuro).
- Conclusione: **QR = universale** (iPhone+Android); **NFC = miglioria Android**. Il codice gestisce già
  questa distinzione e mostra messaggi coerenti.

## Perché serve un "dev build" (non Expo Go)
NFC e fotocamera sono **moduli nativi**: non funzionano in Expo Go. Serve un **development build**
(EAS) installato sul dispositivo.

## Build Android (EAS) — passo per passo
> Prerequisiti: un telefono **Android con NFC**, un account **Expo** (free), Node installato.
```bash
cd apps/mobile
npm install
npm install -g eas-cli          # oppure: npx eas-cli ...
eas login                        # accedi col tuo account Expo
eas build --profile development --platform android
```
- A fine build EAS ti dà un **link/QR**: scarica l'**APK** sul telefono e installalo.
- Apri l'app: punta già a `https://tinft-api.onrender.com` (vedi `eas.json` → profilo `development`).

## Provare la validazione (2 telefoni o 1 telefono + la test-app)
1. **Biglietto**: crea/compra un biglietto (dalla web **test-app** o dal flusso *Cliente* dell'app) →
   apri il biglietto: mostra il **QR a rotazione**.
2. **Validatore**: nell'app scegli ruolo *Validatore* → **Scansiona** → inquadra il QR →
   esito **VALID**; ri-scansiona → **DUPLICATE**.
3. **NFC (Android)**: bottone **“Leggi NFC”** → avvicina un tag NFC che contiene il token →
   stessa validazione del QR. (Attiva l'NFC nelle impostazioni del telefono.)

## iOS
- Funziona il **QR**. Per un dev build iOS serve un **Apple Developer account** ($99/anno) e,
  per l'NFC in lettura, l'entitlement CoreNFC. L'emulazione HCE resta non disponibile su iOS.

## Sviluppo locale (alternativa)
```bash
cd apps/mobile && npm install
API_BASE=http://<IP-LAN-del-PC>:3001 npx expo start   # con dev build installato
```
(Su dispositivo fisico usa l'IP LAN del PC, non `localhost`.)
