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
/// @dev    M1: mint + blocco trasferimenti fuori allowlist.
///         M2: `originalPrice` (base immutabile della royalty 1%, R1) + `paid`
///         (costo base corrente, base del tetto +5% R2/R3).
///         M3: `setPaid` (il costo base viaggia col token a ogni vendita, R3),
///         richiamabile solo dai moduli di vendita autorizzati (escrow).
contract TinftTicket is ERC721, ERC2981, Ownable {
    /// @notice royalty in basis point (100 = 1%)
    uint96 public constant ROYALTY_BPS = 100;

    /// @notice dati on-chain per biglietto
    struct TicketData {
        uint256 eventId;
        uint256 originalPrice; // prezzo originale (face) — base immutabile della royalty 1% (R1)
        uint256 paid; // costo base corrente — base del tetto +5% (R2/R3), aggiornato a ogni passaggio
    }

    /// @notice validator esterno consultato a ogni trasferimento reale
    address public transferValidator;

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => TicketData data) private _ticket;
    /// @notice se true, il token è soggetto alla transfer policy (default al mint)
    mapping(uint256 tokenId => bool bound) public policyBound;
    /// @notice moduli di vendita autorizzati ad aggiornare il costo base (escrow)
    mapping(address operator => bool allowed) public isSaleOperator;

    event TransferValidatorUpdated(address indexed validator);
    event SaleOperatorUpdated(address indexed operator, bool allowed);
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId, uint256 price);
    event PaidUpdated(uint256 indexed tokenId, uint256 newPaid);

    error NotSaleOperator();

    /// @param name_            nome collezione
    /// @param symbol_          simbolo
    /// @param initialOwner     owner (piattaforma TINFT)
    /// @param royaltyReceiver  destinatario royalty EIP-2981 (lo SplitRoyalty, M2)
    constructor(string memory name_, string memory symbol_, address initialOwner, address royaltyReceiver)
        ERC721(name_, symbol_)
        Ownable(initialOwner)
    {
        _setDefaultRoyalty(royaltyReceiver, ROYALTY_BPS);
    }

    /// @notice Imposta il transfer validator (allowlist operatori).
    function setTransferValidator(address validator) external onlyOwner {
        transferValidator = validator;
        emit TransferValidatorUpdated(validator);
    }

    /// @notice Autorizza/revoca un modulo di vendita (escrow) a `setPaid`.
    function setSaleOperator(address operator, bool allowed) external onlyOwner {
        isSaleOperator[operator] = allowed;
        emit SaleOperatorUpdated(operator, allowed);
    }

    /// @notice Conia un biglietto verso `to` al prezzo `price` (face). Il backend
    ///         lo conia sul wallet custodial del compratore dopo il pagamento in
    ///         euro. Al mint il costo base coincide col prezzo originale.
    function mint(address to, uint256 eventId, uint256 price) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextId++;
        _ticket[tokenId] = TicketData({eventId: eventId, originalPrice: price, paid: price});
        policyBound[tokenId] = true;
        _safeMint(to, tokenId);
        emit TicketMinted(tokenId, to, eventId, price);
    }

    /// @notice Dati on-chain del biglietto (revert se inesistente).
    function ticketData(uint256 tokenId) external view returns (TicketData memory) {
        _requireOwned(tokenId);
        return _ticket[tokenId];
    }

    /// @notice Royalty TINFT dovuta su una vendita: 1% del PREZZO ORIGINALE (R1),
    ///         indipendente dal prezzo di rivendita. La incassa il modulo di
    ///         vendita e la instrada allo SplitRoyalty (0,5%/0,5%).
    function royaltyDue(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return (_ticket[tokenId].originalPrice * ROYALTY_BPS) / 10_000; // 1%
    }

    /// @notice Aggiorna il costo base del token (R3: il costo base viaggia col
    ///         token). Solo i moduli di vendita autorizzati (escrow) possono
    ///         chiamarla — è la base su cui M4 applicherà il tetto +5%.
    function setPaid(uint256 tokenId, uint256 newPaid) external {
        if (!isSaleOperator[msg.sender]) revert NotSaleOperator();
        _requireOwned(tokenId);
        _ticket[tokenId].paid = newPaid;
        emit PaidUpdated(tokenId, newPaid);
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
