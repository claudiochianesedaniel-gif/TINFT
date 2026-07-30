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
  /**
   * Conia un NFT **Signature 1/1** (`TinftTicket.mintSpecial`): non conta nel
   * limite 3/evento e NON viene mai bruciato al varco — resta da collezione.
   * Opzionale: gli adapter che non la implementano restano solo off-chain.
   */
  mintSpecial?(params: MintParams): Promise<MintResult>;
  /**
   * Validazione al varco on-chain (`TinftTicket.markUsed`): per un biglietto NORMALE
   * BRUCIA definitivamente il token; un Signature resta. Opzionale: gli adapter che
   * non la implementano (mock legacy) lasciano la transizione solo off-chain.
   */
  markUsed?(tokenId: number): Promise<{txHash: string}>;
  /**
   * Saldo in wei del wallet che firma mint e burn. Serve al monitoraggio: se finisce
   * il gas, gli acquisti smettono di essere coniati on-chain e il problema, senza
   * questa metrica, si scopre solo quando un utente si lamenta.
   * Opzionale: gli adapter senza chiave (o i fake) restituiscono `undefined`.
   */
  gasBalanceWei?(): Promise<bigint | undefined>;
}
