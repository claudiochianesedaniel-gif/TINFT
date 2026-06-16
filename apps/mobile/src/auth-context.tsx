import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {api} from "./api";
import {clearSession, loadSession, saveSession, type Session} from "./session";
import type {Account} from "./types";

interface AuthState {
  /** true finché si tenta di ripristinare la sessione dal keystore all'avvio. */
  loading: boolean;
  session: Session | null;
  account: Account | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // Ripristina la sessione salvata all'avvio (login persistente).
  useEffect(() => {
    let active = true;
    loadSession()
      .then((s) => {
        if (active) setSession(s);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim(), password);
    const next: Session = {token: res.token, account: res.account};
    await saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      account: session?.account ?? null,
      token: session?.token ?? null,
      login,
      logout
    }),
    [loading, session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}

/** Versione che assume la sessione presente (schermate dietro il gate di login). */
export function useSession(): {token: string; account: Account} {
  const {token, account} = useAuth();
  if (!token || !account) throw new Error("Sessione non disponibile");
  return {token, account};
}
