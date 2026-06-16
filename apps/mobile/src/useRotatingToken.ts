import {useCallback, useEffect, useRef, useState} from "react";
import {AppState, type AppStateStatus} from "react-native";
import {api, ApiError} from "./api";
import {DEFAULT_ROTATE_SECONDS} from "./config";

export interface RotatingTokenState {
  token: string | null;
  /** Secondi rimanenti prima della prossima rotazione (countdown). */
  secondsLeft: number;
  rotateSeconds: number;
  error: string | null;
  /** true durante il primissimo caricamento (nessun token ancora). */
  loading: boolean;
  refreshNow: () => void;
}

/**
 * Recupera periodicamente il token d'accesso a vita breve di un biglietto e
 * gestisce il countdown del QR. Si riallinea su `rotateSeconds` restituito dal
 * server e rifà il fetch quando il countdown arriva a zero. Mette in pausa il
 * polling quando l'app va in background (risparmio batteria) e rifà subito il
 * fetch al ritorno in foreground. Annulla la richiesta in volo allo smontaggio.
 */
export function useRotatingToken(ticketId: string, authToken: string): RotatingTokenState {
  const [token, setToken] = useState<string | null>(null);
  const [rotateSeconds, setRotateSeconds] = useState(DEFAULT_ROTATE_SECONDS);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_ROTATE_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchToken = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await api.accessToken(ticketId, authToken, controller.signal);
      if (!mountedRef.current) return;
      setToken(res.token);
      const rot = res.rotateSeconds > 0 ? res.rotateSeconds : DEFAULT_ROTATE_SECONDS;
      setRotateSeconds(rot);
      setSecondsLeft(rot);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      // Ignora gli abort volontari (smontaggio / refresh manuale).
      if (err instanceof ApiError && err.code === "TIMEOUT" && controller.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : "Impossibile aggiornare il QR.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ticketId, authToken]);

  // Primo fetch + cleanup.
  useEffect(() => {
    mountedRef.current = true;
    void fetchToken();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchToken]);

  // Tick del countdown ogni secondo (decremento puro, nessun effetto collaterale).
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Quando il countdown tocca 0 (e abbiamo già un token), rifà il fetch.
  // L'effetto è separato dal tick per non eseguire side-effect dentro un updater.
  useEffect(() => {
    if (secondsLeft === 0 && token) void fetchToken();
  }, [secondsLeft, token, fetchToken]);

  // Pausa in background, refresh al ritorno in foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void fetchToken();
    });
    return () => sub.remove();
  }, [fetchToken]);

  return {token, secondsLeft, rotateSeconds, error, loading, refreshNow: fetchToken};
}
