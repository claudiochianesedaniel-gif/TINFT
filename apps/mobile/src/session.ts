import * as SecureStore from "expo-secure-store";
import type {Account} from "./types";

// Chiavi nel keystore sicuro del dispositivo (Keychain iOS / Keystore Android).
const TOKEN_KEY = "tinft.token";
const ACCOUNT_KEY = "tinft.account";

export interface Session {
  token: string;
  account: Account;
}

/** Salva token + account nel keystore sicuro. */
export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, session.token);
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(session.account));
}

/** Legge la sessione salvata, oppure null se assente/corrotta. */
export async function loadSession(): Promise<Session | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const accountRaw = await SecureStore.getItemAsync(ACCOUNT_KEY);
  if (!token || !accountRaw) return null;
  try {
    return {token, account: JSON.parse(accountRaw) as Account};
  } catch {
    return null;
  }
}

/** Cancella la sessione (logout). */
export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}
