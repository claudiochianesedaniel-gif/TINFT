// Porta verso la blockchain (Base). L'API dipende solo da questa interfaccia;
// l'adapter reale (viem → TinftTicket.mint / escrow) è un innesto successivo,
// testabile contro una testnet/anvil. Per test e sviluppo si usa FakeChain.

export interface MintParams {
  to?: string; // smart account custodial del compratore
  reference: string; // id evento off-chain (mappato all'eventId on-chain dall'adapter)
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
