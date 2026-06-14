import {API_BASE} from "./config";
import type {AccessTokenResponse, LoginResponse, ScanResult, Ticket} from "./types";

/**
 * Errore API tipizzato. `isNetwork` distingue un fallimento di rete/timeout
 * (telefono offline, backend irraggiungibile) da una risposta HTTP di errore:
 * il validatore usa questa distinzione per mettere la scansione in coda offline.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number, // 0 = nessuna risposta (rete)
    public readonly code?: string,
    public readonly isNetwork = false
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Wrapper fetch tipizzato: imposta JSON, aggiunge `Authorization: Bearer`,
 * applica un timeout e normalizza gli errori in {@link ApiError}.
 */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const {method = "GET", token, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal} = opts;
  const url = `${API_BASE}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Inoltra un'eventuale cancellazione esterna al nostro controller.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), {once: true});
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    // fetch rigetta solo per errori di rete / abort: nessuna risposta HTTP.
    const aborted = (err as Error)?.name === "AbortError";
    throw new ApiError(
      aborted ? "Richiesta scaduta (timeout)" : "Rete non raggiungibile",
      0,
      aborted ? "TIMEOUT" : "NETWORK",
      true
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  const data = raw ? safeJson(raw) : undefined;

  if (!res.ok) {
    const payload = (data ?? {}) as {error?: string; message?: string};
    throw new ApiError(payload.message ?? `Errore HTTP ${res.status}`, res.status, payload.error);
  }
  return data as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export const api = {
  /** POST /auth/login → token + account. */
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {method: "POST", body: {email, password}});
  },

  /** GET /accounts/:id/tickets (Bearer) → biglietti del cliente. */
  myTickets(accountId: string, token: string): Promise<Ticket[]> {
    return request<Ticket[]>(`/accounts/${encodeURIComponent(accountId)}/tickets`, {token});
  },

  /** GET /tickets/:id/access-token (Bearer, proprietario) → token QR a rotazione. */
  accessToken(ticketId: string, token: string, signal?: AbortSignal): Promise<AccessTokenResponse> {
    return request<AccessTokenResponse>(`/tickets/${encodeURIComponent(ticketId)}/access-token`, {token, signal});
  },

  /** POST /validate/scan (Bearer) → esito fra i 5 stati. */
  scan(accessToken: string, token: string, validatorId?: string): Promise<ScanResult> {
    return request<ScanResult>("/validate/scan", {
      method: "POST",
      token,
      body: {token: accessToken, ...(validatorId ? {validatorId} : {})}
    });
  },

  /** GET /health → ping del backend (usato per "Sincronizza"/diagnostica). */
  health(): Promise<{status: string}> {
    return request<{status: string}>("/health", {timeoutMs: 5000});
  }
};
