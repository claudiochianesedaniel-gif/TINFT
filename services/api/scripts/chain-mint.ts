/**
 * Smoke test del mint on-chain REALE.
 *
 * Usa lo stesso adapter del backend ({@link ViemChain}) per coniare un biglietto su
 * TinftTicket della rete configurata e stampa `{tokenId, txHash}` (JSON). Serve a
 * verificare end-to-end che la chiave configurata sia owner e che il mint passi.
 *
 * Variabili (da ambiente):
 *   CHAIN_RPC_URL       RPC della rete (es. Base Sepolia)
 *   CHAIN_PRIVATE_KEY   chiave owner del contratto (mint è onlyOwner), 0x + 64 hex
 *   TICKET_ADDRESS      indirizzo di TinftTicket
 *   CHAIN_ID            id rete viem (84532=Base Sepolia, 8453=Base, 31337=anvil)
 *   BUYER   (opz.)      indirizzo destinatario del biglietto; default = owner
 *   REF     (opz.)      reference evento off-chain; default "evt-smoke"
 *   PRICE   (opz.)      prezzo in centesimi; default 5000
 *
 * Uso:
 *   CHAIN_ID=84532 CHAIN_RPC_URL=… CHAIN_PRIVATE_KEY=0x… TICKET_ADDRESS=0x… \
 *   BUYER=0x… npx tsx scripts/chain-mint.ts
 */
import {ViemChain, viemChainForId} from "../src/chain/viem";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return v;
}

const rawKey = req("CHAIN_PRIVATE_KEY");
const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;

const chain = new ViemChain({
  rpcUrl: req("CHAIN_RPC_URL"),
  privateKey,
  ticketAddress: req("TICKET_ADDRESS") as `0x${string}`,
  chain: viemChainForId(process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined)
});

const result = await chain.mintTicket({
  to: process.env.BUYER,
  reference: process.env.REF ?? "evt-smoke",
  priceCents: Number(process.env.PRICE ?? 5000)
});

console.log(JSON.stringify(result));
