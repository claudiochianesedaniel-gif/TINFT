// E2E mint reale su anvil: deploy TinftTicket + mint via viem + verifica ownerOf.
// Eseguito da chain-e2e.sh (anvil già avviato). Usa l'artifact compilato da Foundry.
import {readFileSync} from "node:fs";
import {createPublicClient, createWalletClient, getAddress, http} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {foundry} from "viem/chains";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PK = process.env.PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil account[1]
const artifact = JSON.parse(readFileSync(process.env.ARTIFACT, "utf8"));
const abi = artifact.abi;
const bytecode = artifact.bytecode.object;

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({account, chain: foundry, transport: http(RPC)});
const pub = createPublicClient({chain: foundry, transport: http(RPC)});

// attesa RPC pronto (timer node, non shell sleep)
for (let i = 0; i < 60; i++) {
  try { await pub.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}

// deploy: TinftTicket(name, symbol, owner, royaltyReceiver) — owner = deployer (può coniare)
const deployHash = await wallet.deployContract({abi, bytecode, args: ["TINFT Ticket", "TINFT", account.address, account.address]});
const deployRcpt = await pub.waitForTransactionReceipt({hash: deployHash});
const ticket = deployRcpt.contractAddress;
console.log("TinftTicket deployato @", ticket);

// mint reale → biglietto al compratore
const mintHash = await wallet.writeContract({address: ticket, abi, functionName: "mint", args: [getAddress(BUYER), 1n, 3150n]});
await pub.waitForTransactionReceipt({hash: mintHash});
console.log("mint tx:", mintHash);

const owner = await pub.readContract({address: ticket, abi, functionName: "ownerOf", args: [1n]});
const data = await pub.readContract({address: ticket, abi, functionName: "ticketData", args: [1n]});
console.log("ownerOf(tokenId=1):", owner);
console.log("ticketData(1): eventId=%s originalPrice=%s paid=%s", data.eventId, data.originalPrice, data.paid);

if (getAddress(owner) !== getAddress(BUYER)) {
  console.error("❌ FAIL: il proprietario non è il compratore");
  process.exit(1);
}
console.log("✅ MINT REALE OK su anvil: tokenId 1 coniato e di proprietà del compratore");
