// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITransferValidator} from "./interfaces/ITransferValidator.sol";

/// @title TinftTicket
/// @notice Biglietto ERC-721 con trasferimenti *enforced* in stile ERC-721C +
///         royalty EIP-2981. Ogni biglietto è vincolato alla transfer policy
///         TINFT al mint; finché è vincolato può muoversi solo tramite un
///         operatore in allowlist (moduli vendita/escrow/regalo). È la base per
///         la royalty 1% enforced sul secondario.
///
/// @dev    Milestone M1: mint + blocco dei trasferimenti fuori allowlist.
///         I campi `eventId` e `paid` (costo base) sono memorizzati già ora
///         perché serviranno al tetto +5% (R2/R3) e al limite 2/evento (R4) in M4.
///         La royalty EIP-2981 è il segnale per i marketplace conformi; la
///         trattenuta esatta dell'1% sul *prezzo originale* è applicata dal
///         modulo di vendita TINFT (M2).
contract TinftTicket is ERC721, ERC2981, Ownable {
    /// @notice dati on-chain per biglietto
    struct TicketData {
        uint256 eventId;
        uint256 paid; // costo base, nella minima unità fiat (es. centesimi di €)
    }

    /// @notice validator esterno consultato a ogni trasferimento reale
    address public transferValidator;

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => TicketData data) private _ticket;
    /// @notice se true, il token è soggetto alla transfer policy (default al mint)
    mapping(uint256 tokenId => bool bound) public policyBound;

    event TransferValidatorUpdated(address indexed validator);
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId, uint256 paid);

    /// @param name_            nome collezione
    /// @param symbol_          simbolo
    /// @param initialOwner     owner (piattaforma TINFT)
    /// @param royaltyReceiver  destinatario royalty EIP-2981 (lo SplitRoyalty in M2)
    /// @param royaltyFeeBps    royalty in basis point (100 = 1%)
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address royaltyReceiver,
        uint96 royaltyFeeBps
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeBps);
    }

    /// @notice Imposta il transfer validator (allowlist operatori).
    function setTransferValidator(address validator) external onlyOwner {
        transferValidator = validator;
        emit TransferValidatorUpdated(validator);
    }

    /// @notice Conia un biglietto verso `to`. Il backend lo conia sul wallet
    ///         custodial (account abstraction) del compratore dopo il pagamento
    ///         in euro andato a buon fine.
    function mint(address to, uint256 eventId, uint256 paid) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextId++;
        _ticket[tokenId] = TicketData({eventId: eventId, paid: paid});
        policyBound[tokenId] = true;
        _safeMint(to, tokenId);
        emit TicketMinted(tokenId, to, eventId, paid);
    }

    /// @notice Dati on-chain del biglietto (revert se inesistente).
    function ticketData(uint256 tokenId) external view returns (TicketData memory) {
        _requireOwned(tokenId);
        return _ticket[tokenId];
    }

    /// @dev Applica la policy su ogni trasferimento reale (esclusi mint e burn).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            if (policyBound[tokenId] && transferValidator != address(0)) {
                ITransferValidator(transferValidator).validateTransfer(_msgSender(), from, to);
            }
        }
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
