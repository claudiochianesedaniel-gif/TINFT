import type {ChainPort, MintParams, MintResult} from "./port";

/** Adapter on-chain fake (deterministico, nessun RPC) per sviluppo e test. */
export class FakeChain implements ChainPort {
  private tokenSeq = 0;
  private txSeq = 0;

  async mintTicket(_params: MintParams): Promise<MintResult> {
    const tokenId = ++this.tokenSeq;
    const txHash = "0x" + (++this.txSeq).toString(16).padStart(64, "0");
    return {tokenId, txHash};
  }

  async markUsed(_tokenId: number): Promise<{txHash: string}> {
    return {txHash: "0x" + (++this.txSeq).toString(16).padStart(64, "0")};
  }
}
