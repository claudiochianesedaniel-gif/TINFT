import {Platform} from "react-native";

/**
 * Wrapper NFC — MIGLIORIA SOLO ANDROID.
 *
 * Perché Android-only per il P2P telefono↔telefono:
 *  - Lettura di un tag NFC (carta/wristband che porta il token): possibile sia su
 *    Android sia su iOS (CoreNFC). Qui la usiamo per leggere il token e validarlo
 *    come fa il QR.
 *  - EMULAZIONE di un tag (HCE) per far "presentare" al telefono del cliente il
 *    proprio biglietto via tap a un altro telefono: disponibile SOLO su Android
 *    (Host Card Emulation). iOS NON può emulare un tag per il peer-to-peer.
 *  => Per questo il QR è il percorso UNIVERSALE; l'NFC è un di più su Android.
 *
 * `react-native-nfc-manager` è un modulo NATIVO: non esiste in Expo Go né sul web,
 * quindi lo importiamo in modo lazy e tutto è protetto da try/catch + capability check.
 */

export type NfcAvailability =
  | {supported: true; enabled: boolean}
  | {supported: false; reason: "ios" | "unsupported" | "unavailable"};

/** Tipo minimale del modulo, per evitare una dipendenza di tipi forte sul lazy import. */
interface NfcManagerLike {
  start: () => Promise<void>;
  isSupported: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
  requestTechnology: (tech: unknown) => Promise<unknown>;
  getTag: () => Promise<NfcTag | null>;
  cancelTechnologyRequest: () => Promise<void>;
}

interface NfcTag {
  id?: string;
  ndefMessage?: Array<{payload: number[]; type?: number[]}>;
  [k: string]: unknown;
}

let mod: {
  default: NfcManagerLike;
  NfcTech: {Ndef: unknown};
  Ndef: {text: {decodePayload: (payload: Uint8Array) => string}};
} | null = null;
let started = false;

/** Carica il modulo nativo una sola volta; null se non disponibile (Expo Go/web). */
async function load(): Promise<typeof mod> {
  if (mod) return mod;
  try {
    // import dinamico: se il modulo nativo non è linkato, fallisce qui senza crashare l'app.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const required = require("react-native-nfc-manager") as {
      default: NfcManagerLike;
      NfcTech: {Ndef: unknown};
      Ndef: {text: {decodePayload: (payload: Uint8Array) => string}};
    };
    mod = required;
    return mod;
  } catch {
    return null;
  }
}

/** Indica se la lettura NFC è utilizzabile su questo dispositivo. */
export async function getNfcAvailability(): Promise<NfcAvailability> {
  if (Platform.OS === "ios") {
    // La LETTURA su iOS è tecnicamente possibile, ma per coerenza di prodotto
    // (no HCE/peer-to-peer su iOS) presentiamo l'NFC come non disponibile e
    // indirizziamo al QR. Cambia questo ramo se vuoi abilitare la sola lettura iOS.
    return {supported: false, reason: "ios"};
  }
  if (Platform.OS !== "android") return {supported: false, reason: "unsupported"};

  const m = await load();
  if (!m) return {supported: false, reason: "unavailable"};
  try {
    if (!started) {
      await m.default.start();
      started = true;
    }
    const supported = await m.default.isSupported();
    if (!supported) return {supported: false, reason: "unsupported"};
    const enabled = await m.default.isEnabled();
    return {supported: true, enabled};
  } catch {
    return {supported: false, reason: "unavailable"};
  }
}

/**
 * Legge un tag NFC e ne estrae il token (testo NDEF). Da chiamare SOLO se
 * {@link getNfcAvailability} ha restituito `supported: true`.
 * Restituisce il token come stringa, oppure null se il tag non porta testo leggibile.
 * Rilascia sempre la richiesta tecnologia nel finally.
 */
export async function readNfcToken(): Promise<string | null> {
  const m = await load();
  if (!m) throw new Error("NFC non disponibile su questo dispositivo");

  try {
    await m.default.requestTechnology(m.NfcTech.Ndef);
    const tag = await m.default.getTag();
    const record = tag?.ndefMessage?.[0];
    if (!record?.payload?.length) return null;
    const text = m.Ndef.text.decodePayload(Uint8Array.from(record.payload));
    return text?.trim() || null;
  } finally {
    try {
      await m.default.cancelTechnologyRequest();
    } catch {
      /* no-op: la sessione può essere già chiusa */
    }
  }
}

/** Messaggio coerente da mostrare quando l'NFC non è disponibile. */
export function nfcUnavailableMessage(reason: Extract<NfcAvailability, {supported: false}>["reason"]): string {
  switch (reason) {
    case "ios":
      return "NFC tap non disponibile su iOS, usa il QR.";
    case "unsupported":
      return "Questo dispositivo non supporta NFC: usa il QR.";
    case "unavailable":
    default:
      return "NFC non disponibile in questa build (richiede un dev build). Usa il QR.";
  }
}
