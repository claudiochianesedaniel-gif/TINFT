import AsyncStorage from "@react-native-async-storage/async-storage";
import {api, ApiError} from "./api";
import type {ScanResult} from "./types";

const QUEUE_KEY = "tinft.scanQueue";

/** Una scansione messa in coda perché la rete non era disponibile al varco. */
export interface QueuedScan {
  /** id locale (timestamp+rand) per chiave React e dedup. */
  id: string;
  /** il token d'accesso letto dal QR/NFC (firma verificata lato server al replay). */
  accessToken: string;
  validatorId?: string;
  /** epoch ms in cui la scansione è avvenuta sul telefono. */
  scannedAt: number;
}

export interface SyncReport {
  synced: number;
  remaining: number;
  results: Array<{id: string; outcome: ScanResult["outcome"]; holderName?: string}>;
}

async function readQueue(): Promise<QueuedScan[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueuedScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** Accoda una scansione (rete assente) e restituisce la coda aggiornata. */
export async function enqueueScan(input: {accessToken: string; validatorId?: string}): Promise<QueuedScan[]> {
  const queue = await readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    accessToken: input.accessToken,
    validatorId: input.validatorId,
    scannedAt: Date.now()
  });
  await writeQueue(queue);
  return queue;
}

export async function getQueue(): Promise<QueuedScan[]> {
  return readQueue();
}

export async function queueCount(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Rigioca la coda contro il server quando si torna online. Per ogni elemento
 * inviato con successo (anche con esito DUPLICATE/SCREENSHOT: è comunque una
 * risposta del server) lo rimuove dalla coda; se la rete è ancora giù lo
 * lascia in coda e si ferma. La logica di "vince il primo timestamp" è del
 * server: qui inviamo in ordine cronologico così l'esito è coerente.
 */
export async function syncQueue(token: string): Promise<SyncReport> {
  const queue = (await readQueue()).sort((a, b) => a.scannedAt - b.scannedAt);
  const results: SyncReport["results"] = [];
  const remaining: QueuedScan[] = [];
  let stop = false;

  for (const item of queue) {
    if (stop) {
      remaining.push(item);
      continue;
    }
    try {
      const res = await api.scan(item.accessToken, token, item.validatorId);
      results.push({id: item.id, outcome: res.outcome, holderName: res.holderName});
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) {
        // ancora offline: tieni questo e tutti i successivi, riprova più tardi.
        stop = true;
        remaining.push(item);
      } else {
        // errore non di rete (es. 401): lo scartiamo, non è ritentabile com'è.
        results.push({id: item.id, outcome: "FAKE"});
      }
    }
  }

  await writeQueue(remaining);
  return {synced: results.length, remaining: remaining.length, results};
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
