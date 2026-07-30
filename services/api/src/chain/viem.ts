import {createPublicClient, createWalletClient, getAddress, http, parseEventLogs} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {foundry} from "viem/chains";
import type {Chain} from "viem";
import {DomainError} from "../domain/models";
import type {ChainPort, MintParams, MintResult} from "./port";

/** ABI minimale di TinftTicket per le operazioni usate dal backend. */
export const TINFT_TICKET_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      {name: "to", type: "address"},
      {name: "eventId", type: "uint256"},
      {name: "price", type: "uint256"}
    ],
    outputs: [{name: "tokenId", type: "uint256"}]
  },
  {
    type: "function",
    name: "mintSpecial",
    stateMutability: "nonpayable",
    inputs: [
      {name: "to", type: "address"},
      {name: "eventId", type: "uint256"},
      {name: "price", type: "uint256"}
    ],
    outputs: [{name: "tokenId", type: "uint256"}]
  },
  {
    type: "function",
    name: "markUsed",
    stateMutability: "nonpayable",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: []
  },
  {
    type: "event",
    name: "TicketMinted",
    inputs: [
      {name: "tokenId", type: "uint256", indexed: true},
      {name: "to", type: "address", indexed: true},
      {name: "eventId", type: "uint256", indexed: true},
      {name: "price", type: "uint256", indexed: false}
    ]
  },
  {
    type: "event",
    name: "SpecialMinted",
    inputs: [
      {name: "tokenId", type: "uint256", indexed: true},
      {name: "to", type: "address", indexed: true},
      {name: "eventId", type: "uint256", indexed: true}
    ]
  }
] as const;

export interface ViemChainConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  ticketAddress: `0x${string}`;
  chain?: Chain; // default: foundry (anvil, id 31337). In prod: baseSepolia/base.
}

/**
 * Adapter on-chain reale (viem) per Base. Conia su TinftTicket.mint e ricava il
 * tokenId dall'evento TicketMinted. L'account deve essere owner del contratto
 * (mint è onlyOwner). Testato contro anvil (vedi scripts/chain-e2e.sh).
 */
export class ViemChain implements ChainPort {
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  /** Coda: le scritture con la stessa chiave (owner) partono UNA alla volta. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly cfg: ViemChainConfig) {
    this.account = privateKeyToAccount(cfg.privateKey);
  }

  private clients() {
    const chain = this.cfg.chain ?? foundry;
    return {
      wallet: createWalletClient({account: this.account, chain, transport: http(this.cfg.rpcUrl)}),
      pub: createPublicClient({chain, transport: http(this.cfg.rpcUrl)})
    };
  }

  /**
   * Invia una transazione firmata dall'owner in modo robusto.
   *
   * Due scritture ravvicinate dallo stesso wallet (es. mint del biglietto e
   * subito dopo mintSpecial del drop, oppure mint e markUsed) fallivano: dopo la
   * conferma l'RPC può ancora restituire il nonce vecchio (nodi non allineati) e
   * la seconda transazione viene rifiutata. Qui le scritture vengono serializzate
   * su una coda, il nonce è letto esplicitamente in stato `pending` e in caso di
   * errore si riprova una volta dopo una breve attesa rileggendo il nonce.
   */
  private send(write: (nonce: number) => Promise<`0x${string}`>): Promise<`0x${string}`> {
    const run = this.queue.then(
      () => this.sendWithRetry(write),
      () => this.sendWithRetry(write)
    );
    this.queue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  private async sendWithRetry(write: (nonce: number) => Promise<`0x${string}`>): Promise<`0x${string}`> {
    const {pub} = this.clients();
    const nextNonce = () => pub.getTransactionCount({address: this.account.address, blockTag: "pending"});
    try {
      return await write(await nextNonce());
    } catch (first) {
      await new Promise((r) => setTimeout(r, 1500)); // lasciamo allineare i nodi RPC
      try {
        return await write(await nextNonce());
      } catch {
        throw first; // riporta l'errore originale, più informativo
      }
    }
  }

  async mintTicket(params: MintParams): Promise<MintResult> {
    const {wallet, pub} = this.clients();

    const to = getAddress((params.to ?? this.account.address) as string);
    // eventId dal registro eventi (Event.onchainEventId): univoco e persistito —
    // niente hash con collisioni, il limite 3/evento on-chain conta sull'evento giusto.
    const eventId = BigInt(params.onchainEventId);
    const price = BigInt(params.priceCents);

    const txHash = await this.send((nonce) =>
      wallet.writeContract({
        address: this.cfg.ticketAddress,
        abi: TINFT_TICKET_ABI,
        functionName: "mint",
        args: [to, eventId, price],
        nonce
      })
    );
    const receipt = await pub.waitForTransactionReceipt({hash: txHash});
    const logs = parseEventLogs({abi: TINFT_TICKET_ABI, eventName: "TicketMinted", logs: receipt.logs});
    const first = logs[0];
    if (!first) throw new DomainError("MINT_FAILED", "evento TicketMinted assente nel receipt", 502);
    return {tokenId: Number(first.args.tokenId), txHash};
  }

  /**
   * Conia un NFT **Signature 1/1** on-chain (`mintSpecial`): fuori dal limite
   * 3/evento e mai bruciato al varco. tokenId dall'evento `SpecialMinted`.
   */
  async mintSpecial(params: MintParams): Promise<MintResult> {
    const {wallet, pub} = this.clients();

    const to = getAddress((params.to ?? this.account.address) as string);
    const txHash = await this.send((nonce) =>
      wallet.writeContract({
        address: this.cfg.ticketAddress,
        abi: TINFT_TICKET_ABI,
        functionName: "mintSpecial",
        args: [to, BigInt(params.onchainEventId), BigInt(params.priceCents)],
        nonce
      })
    );
    const receipt = await pub.waitForTransactionReceipt({hash: txHash});
    const logs = parseEventLogs({abi: TINFT_TICKET_ABI, eventName: "SpecialMinted", logs: receipt.logs});
    const first = logs[0];
    if (!first) throw new DomainError("MINT_FAILED", "evento SpecialMinted assente nel receipt", 502);
    return {tokenId: Number(first.args.tokenId), txHash};
  }

  /** Validazione al varco on-chain: `markUsed` brucia il biglietto normale (Signature esente). */
  async markUsed(tokenId: number): Promise<{txHash: string}> {
    const {wallet, pub} = this.clients();
    const txHash = await this.send((nonce) =>
      wallet.writeContract({
        address: this.cfg.ticketAddress,
        abi: TINFT_TICKET_ABI,
        functionName: "markUsed",
        args: [BigInt(tokenId)],
        nonce
      })
    );
    await pub.waitForTransactionReceipt({hash: txHash});
    return {txHash};
  }

  /**
   * Saldo del wallet che firma mint e burn. Se va a zero le transazioni falliscono
   * silenziosamente per l'utente finale: esposto in /metrics e /ready per accorgersene
   * prima. Un errore di rete non deve far fallire l'health check → `undefined`.
   */
  async gasBalanceWei(): Promise<bigint | undefined> {
    try {
      const {pub} = this.clients();
      return await pub.getBalance({address: this.account.address});
    } catch {
      return undefined;
    }
  }
}
