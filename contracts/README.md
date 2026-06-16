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
| `TinftTicket` | ERC-721 + EIP-2981; *bound* alla policy al mint. Memorizza `eventId`, `originalPrice` (royalty 1%, R1) e `paid` (tetto +10%, R2/R3). Identità `hash(CF)` + limite **3/evento** (R4). Validazione (`markUsed`) ed export: `exportFree` (fee 25% + sgancio) / `exportEnforced` (royalty per sempre) (R5/R6). |
| `TinftTransferValidator` | Allowlist di operatori; `validateTransfer` fa revert se il caller non è un modulo TINFT autorizzato. |
| `TinftRoyaltySplit` | Split royalty **0,5% TINFT + 0,5% organizzatore** (due wallet distinti), destinatario EIP-2981. Pattern *pull-payment*: l'incasso non può mai fallire/bloccarsi; i beneficiari ritirano con `withdraw()`. |
| `TinftEscrow` | Escrow P2P a pagamento: `list` (lock + **tetto +10%**), `pay` (release atomico token+prezzo+royalty, costo base + conteggio 3/evento), `reclaim` (timeout), `cancel`. `ReentrancyGuard` + checks-effects-interactions. |
| `ITransferValidator` | Interfaccia del validator. |

### Modello di enforcement
Durante la vita "viva" del biglietto, un trasferimento passa solo se avviato da un
**operatore in allowlist** (i moduli TINFT di vendita/escrow/regalo). Un trasferimento
diretto wallet-to-wallet fa **revert** → la royalty 1% e il tetto +10% restano enforced
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

### Definition of Done — M3 (coperta dai test)
- ✅ il compratore paga → riceve il token e il venditore i fondi in **una** tx (`test_PaySettlesAtomically`)
- ✅ senza pagamento entro il `ttl`, `reclaim()` restituisce il token al venditore (`test_ReclaimAfterTtlReturnsToSeller`)
- ✅ il costo base viaggia col token (R3) e la royalty 1% va allo split 0,5/0,5
- ✅ sicurezza: reentrancy del venditore non ruba né blocca (`test_ReentrantSellerCannotExploit`)

### Definition of Done — M4 (coperta dai test)
- ✅ rifiuto prezzo di rivendita oltre `paid·1,10` (`test_ListAboveCapReverts`, `test_CapFollowsCostBasisAfterSale`)
- ✅ rifiuto del 4º biglietto stesso evento/identità, primario e secondario (`test_MintFourthForSameEventReverts`, `test_BuyingFourthForSameEventReverts`)
- ✅ niente bypass `list→compra→reclaim` e nessun blocco di `reclaim` (`test_ListDoesNotEnableBypass_AndReclaimNeverStuck`)
- ✅ il conteggio si sposta da venditore a compratore alla vendita (`test_SaleMovesCountBetweenIdentities`)

### Definition of Done — M5 (coperta dai test)
- ✅ dopo `exportFree` il token è trasferibile liberamente; fee 25% incassata dalla tesoreria (`test_ExportFreeUnbindsAndChargesFee`)
- ✅ dopo `exportEnforced` il trasferimento diretto resta bloccato e una vendita applica ancora la royalty 1% (`test_ExportEnforcedKeepsRoyaltyEnforced`)
- ✅ export solo a evento concluso (`markUsed`), solo dal proprietario, una sola volta (`test_ExportRequiresUsed`, `test_ExportOnlyOwner`, `test_CannotExportTwice`)

## Sicurezza (hardening pre-audit)
- **Ownable2Step** su ticket/validator/escrow (ownership a 2 fasi; owner = multisig consigliato).
- **Pausable** sull'escrow: `list`/`pay` sospendibili in emergenza, `reclaim`/`cancel` **sempre attivi** (i token non restano mai intrappolati).
- **ReentrancyGuard** + checks-effects-interactions su `escrow.*`, `ticket.exportFree`, `split.withdraw`.
- Modello di minaccia, ruoli/poteri e checklist per l'audit esterno: **[`../docs/SECURITY.md`](../docs/SECURITY.md)**.

## Roadmap contratti
M10 audit di sicurezza esterno prima del mainnet. Poi backend/pagamenti/SPID/frontend
(M6–M9). Vedi `../docs/SPEC-VERIFICATA.md`.
