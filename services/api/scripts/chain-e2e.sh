#!/usr/bin/env bash
# E2E del mint reale on-chain contro anvil (Foundry).
# Avvia anvil, compila i contratti, poi chain-e2e.mjs deploya e conia via viem.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CONTRACTS="$ROOT/contracts"
ARTIFACT="$CONTRACTS/out/TinftTicket.sol/TinftTicket.json"
RPC="http://127.0.0.1:8545"

forge build --root "$CONTRACTS" >/dev/null

anvil --silent --port 8545 &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT

RPC_URL="$RPC" ARTIFACT="$ARTIFACT" node "$ROOT/services/api/scripts/chain-e2e.mjs"
