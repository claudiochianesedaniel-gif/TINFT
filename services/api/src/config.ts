// Validazione della configurazione al boot: meglio fallire SUBITO con un messaggio
// chiaro che rompersi a runtime per una env incoerente. Le incoerenze "bloccanti"
// (es. Stripe senza segreto webhook, config on-chain parziale) sono ERRORI; le
// debolezze accettabili in sviluppo (es. AUTH_SECRET assente) sono WARNING.

export interface ConfigIssue {
  level: "error" | "warn";
  message: string;
}

type Env = Record<string, string | undefined>;

/** Analizza l'ambiente e restituisce le incoerenze trovate (pura, testabile). */
export function checkConfig(env: Env = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const prod = env.NODE_ENV === "production";

  // Segreto dei token: in produzione DEVE essere impostato (altrimenti si usa un dev-secret).
  if (!env.AUTH_SECRET && !env.ACCESS_SECRET) {
    issues.push({
      level: prod ? "error" : "warn",
      message: "AUTH_SECRET non impostata: in sviluppo si usa un segreto di default, in produzione è obbligatoria."
    });
  }

  // Stripe: la chiave senza il segreto del webhook rende i webhook non verificabili.
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    issues.push({
      level: "error",
      message: "STRIPE_SECRET_KEY presente ma STRIPE_WEBHOOK_SECRET mancante: i webhook di pagamento non sarebbero verificabili."
    });
  }

  // On-chain: le tre variabili vanno insieme o nessuna (altrimenti niente mint reale o crash).
  const chain = [env.CHAIN_RPC_URL, env.CHAIN_PRIVATE_KEY, env.TICKET_ADDRESS];
  if (chain.some(Boolean) && !chain.every(Boolean)) {
    issues.push({
      level: "error",
      message: "Config on-chain incompleta: CHAIN_RPC_URL, CHAIN_PRIVATE_KEY e TICKET_ADDRESS devono essere presenti tutte e tre."
    });
  }
  if (env.TICKET_ADDRESS && !/^0x[0-9a-fA-F]{40}$/.test(env.TICKET_ADDRESS)) {
    issues.push({level: "error", message: "TICKET_ADDRESS non è un indirizzo Ethereum 0x valido."});
  }
  if (env.CHAIN_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(env.CHAIN_PRIVATE_KEY)) {
    issues.push({level: "error", message: "CHAIN_PRIVATE_KEY non è una chiave privata 0x (32 byte) valida."});
  }

  // PORT numerica se impostata.
  if (env.PORT !== undefined && !Number.isInteger(Number(env.PORT))) {
    issues.push({level: "error", message: `PORT non valida: "${env.PORT}".`});
  }

  return issues;
}

/**
 * Valida la configurazione: stampa i warning e LANCIA sugli errori (fail-fast al boot).
 * Restituisce gli issue per comodità di test/log.
 */
export function validateConfig(env: Env = process.env, log: Pick<Console, "warn"> = console): ConfigIssue[] {
  const issues = checkConfig(env);
  for (const i of issues) if (i.level === "warn") log.warn(`config: ${i.message}`);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    throw new Error(`Configurazione non valida (${errors.length} errori):\n` + errors.map((e) => `  • ${e.message}`).join("\n"));
  }
  return issues;
}
