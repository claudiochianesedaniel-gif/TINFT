import Constants from "expo-constants";

/**
 * URL base dell'API TINFT.
 *
 * IMPORTANTE — sul telefono `localhost` è il telefono stesso, non il tuo PC.
 * Per lo sviluppo imposta l'IP LAN della macchina che esegue il backend, es.:
 *
 *   API_BASE=http://192.168.1.50:3001 npx expo start
 *
 * (vedi app.config.ts e .env.example). Ordine di risoluzione:
 *   1) `extra.apiBase`  ← da app.config.ts (process.env.API_BASE a build/start)
 *   2) `EXPO_PUBLIC_API_BASE` ← variabile pubblica Expo a runtime
 *   3) DEFAULT_API_BASE qui sotto (fallback per l'emulatore/dev locale)
 *
 * Nota emulatori: l'emulatore Android raggiunge il PC host su 10.0.2.2,
 * il simulatore iOS può usare localhost. Su DISPOSITIVO FISICO usa sempre l'IP LAN.
 */
const DEFAULT_API_BASE = "http://localhost:3001";

function resolveApiBase(): string {
  const fromExtra = (Constants.expoConfig?.extra as {apiBase?: string | null} | undefined)?.apiBase;
  if (fromExtra) return fromExtra;
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  return DEFAULT_API_BASE;
}

/** URL base senza slash finale (così `${API_BASE}/auth/login` è sempre corretto). */
export const API_BASE = resolveApiBase().replace(/\/+$/, "");

/** Periodo minimo (s) di rotazione del QR, usato se il server non lo specifica. */
export const DEFAULT_ROTATE_SECONDS = 30;

/** PIN demo del varco (validatore). In produzione: PIN per-varco lato backend. */
export const VALIDATOR_PIN = "1234";

/** Account demo (password `demo123`) mostrati nella schermata di login. */
export const DEMO_ACCOUNTS = [
  {label: "Cliente · Marco", email: "cli@tinft.io"},
  {label: "Cliente · Giulia", email: "cli2@tinft.io"},
  {label: "Organizzatore", email: "org@tinft.io"}
] as const;

export const DEMO_PASSWORD = "demo123";
