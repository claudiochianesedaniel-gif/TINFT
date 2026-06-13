# TINFT — Contratti (Foundry)

Smart contract dei biglietti-NFT TINFT su **Base** (L2). Stack: Solidity 0.8.28 +
OpenZeppelin 5.x, royalty enforced in stile **ERC-721C** (Transfer Validator + allowlist).

## Comandi

```bash
forge build          # compila
forge test -vvv      # esegue i test
forge fmt            # formatta
```

## Dipendenze (git submodules in `lib/`)

- `openzeppelin-contracts` — ERC721, ERC2981, Ownable (audited).
- `forge-std` — utilità di test.

In CI vengono ripristinate con `actions/checkout` (`submodules: recursive`).

## Contratti (Milestone M1)

| Contratto | Ruolo |
|---|---|
| `TinftTicket` | ERC-721 + EIP-2981; ogni biglietto è *bound* alla policy al mint. Memorizza `eventId`, `originalPrice` (base immutabile della royalty 1%, R1) e `paid` (costo base per il tetto +5%, R2/R3). |
| `TinftTransferValidator` | Allowlist di operatori; `validateTransfer` fa revert se il caller non è un modulo TINFT autorizzato. |
| `TinftRoyaltySplit` | Split royalty **0,5% TINFT + 0,5% organizzatore** (due wallet distinti), destinatario EIP-2981. Pattern *pull-payment*: l'incasso non può mai fallire/bloccarsi; i beneficiari ritirano con `withdraw()`. |
| `ITransferValidator` | Interfaccia del validator. |

### Modello di enforcement
Durante la vita "viva" del biglietto, un trasferimento passa solo se avviato da un
**operatore in allowlist** (i moduli TINFT di vendita/escrow/regalo). Un trasferimento
diretto wallet-to-wallet fa **revert** → la royalty 1% e il tetto +5% restano enforced
sul secondario. In `exportFree()` (M5) il token verrà sganciato dalla policy
(`policyBound=false`) e diventerà liberamente trasferibile.

### Definition of Done — M1 (coperta dai test)
- ✅ mint di un biglietto (`test_Mint`)
- ✅ trasferimento via operatore in allowlist consentito (`test_TransferThroughAllowlistedOperator`)
- ✅ trasferimento fuori allowlist **bloccato** (`test_DirectTransferIsBlocked`, `testFuzz_OnlyAllowlistedCanMove`)
- ✅ royalty EIP-2981 all'1% (`test_RoyaltyInfoIsOnePercent`)

### Definition of Done — M2 (coperta dai test)
- ✅ una vendita accredita **0,5% a due wallet distinti** (`test_P2PSaleCreditsTwoDistinctWallets`)
- ✅ la royalty EIP-2981 confluisce nello split e si divide 50/50 (`test_Eip2981RoyaltyFlowsToSplit`)
- ✅ incasso a prova di blocco + ritiri isolati (`test_WithdrawFailureIsIsolated`), conservazione fondi (fuzz)

## Roadmap contratti
M3 escrow `list/pay/reclaim` · M4 tetto +5% e limite 2/evento ·
M5 `exportFree`/`exportEnforced` · M10 audit. Vedi `../docs/SPEC-VERIFICATA.md`.
