// Porta verso la blockchain (Base). L'API dipende solo da questa interfaccia;
// l'adapter reale (viem → TinftTicket.mint / escrow) è un innesto successivo,
// testabile contro una testnet/anvil. Per test e sviluppo si usa FakeChain.

export interface MintParams {
  to?: string; // smart account custodial del compratore
  reference: string; // id evento off-chain (per log/determinismo dei fake)
  // eventId on-chain dal REGISTRO eventi (FASE 4): assegnato una volta per evento
  // (TicketingService.ensureOnchainEventId), persistito su Event.onchainEventId.
  // È la chiave del limite anti-bagarino per-evento (heldCount) su TinftTicket.
  onchainEventId: number;
  priceCents: number;
}

export interface MintResult {
  tokenId: number;
  txHash: string;
}

export interface ChainPort {
  /** Conia il biglietto sul contratto TinftTicket e restituisce tokenId + txHash. */
  mintTicket(params: MintParams): Promise<MintResult>;
}
