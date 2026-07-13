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

  constructor(private readonly cfg: ViemChainConfig) {
    this.account = privateKeyToAccount(cfg.privateKey);
  }

  async mintTicket(params: MintParams): Promise<MintResult> {
    const chain = this.cfg.chain ?? foundry;
    const wallet = createWalletClient({account: this.account, chain, transport: http(this.cfg.rpcUrl)});
    const pub = createPublicClient({chain, transport: http(this.cfg.rpcUrl)});

    const to = getAddress((params.to ?? this.account.address) as string);
    // eventId dal registro eventi (Event.onchainEventId): univoco e persistito —
    // niente hash con collisioni, il limite 3/evento on-chain conta sull'evento giusto.
    const eventId = BigInt(params.onchainEventId);
    const price = BigInt(params.priceCents);

    const txHash = await wallet.writeContract({
      address: this.cfg.ticketAddress,
      abi: TINFT_TICKET_ABI,
      functionName: "mint",
      args: [to, eventId, price]
    });
    const receipt = await pub.waitForTransactionReceipt({hash: txHash});
    const logs = parseEventLogs({abi: TINFT_TICKET_ABI, eventName: "TicketMinted", logs: receipt.logs});
    const first = logs[0];
    if (!first) throw new DomainError("MINT_FAILED", "evento TicketMinted assente nel receipt", 502);
    return {tokenId: Number(first.args.tokenId), txHash};
  }

  /** Validazione al varco on-chain: `markUsed` brucia il biglietto normale (Signature esente). */
  async markUsed(tokenId: number): Promise<{txHash: string}> {
    const chain = this.cfg.chain ?? foundry;
    const wallet = createWalletClient({account: this.account, chain, transport: http(this.cfg.rpcUrl)});
    const pub = createPublicClient({chain, transport: http(this.cfg.rpcUrl)});
    const txHash = await wallet.writeContract({
      address: this.cfg.ticketAddress,
      abi: TINFT_TICKET_ABI,
      functionName: "markUsed",
      args: [BigInt(tokenId)]
    });
    await pub.waitForTransactionReceipt({hash: txHash});
    return {txHash};
  }
}
