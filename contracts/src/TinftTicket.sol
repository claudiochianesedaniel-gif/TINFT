// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITransferValidator} from "./interfaces/ITransferValidator.sol";

/// @title TinftTicket
/// @notice Biglietto ERC-721 con trasferimenti *enforced* (ERC-721C) + royalty
///         EIP-2981 + regole anti-bagarinaggio. Ogni biglietto è vincolato alla
///         transfer policy al mint; finché è vincolato può muoversi solo tramite
///         un operatore in allowlist (vendita/escrow/regalo).
///
/// @dev    M1 transfer enforced · M2 royalty 1% / `originalPrice` · M3 costo base
///         che viaggia col token · M4 limite **2 per evento per identità**
///         (`hash(CF)` on-chain) applicato al mint e alla vendita.
contract TinftTicket is ERC721, ERC2981, Ownable {
    /// @notice royalty in basis point (100 = 1%)
    uint96 public constant ROYALTY_BPS = 100;
    /// @notice massimo biglietti per evento per identità (R4)
    uint256 public constant MAX_PER_EVENT = 2;

    /// @notice dati on-chain per biglietto
    struct TicketData {
        uint256 eventId;
        uint256 originalPrice; // prezzo originale (face) — base immutabile della royalty 1% (R1)
        uint256 paid; // costo base corrente — base del tetto +5% (R2/R3), aggiornato a ogni vendita
    }

    /// @notice validator esterno consultato a ogni trasferimento reale
    address public transferValidator;

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => TicketData data) private _ticket;
    /// @notice se true, il token è soggetto alla transfer policy (default al mint)
    mapping(uint256 tokenId => bool bound) public policyBound;
    /// @notice moduli di vendita autorizzati (escrow) a registrare le vendite
    mapping(address operator => bool allowed) public isSaleOperator;
    /// @notice identità on-chain di un wallet: keccak256(codiceFiscale + salt). 0 = non registrato (esente).
    mapping(address account => bytes32 identityHash) public identityOf;
    /// @notice biglietti correntemente "controllati" da un'identità per evento (R4)
    mapping(bytes32 identityHash => mapping(uint256 eventId => uint256 count)) public heldCount;

    event TransferValidatorUpdated(address indexed validator);
    event SaleOperatorUpdated(address indexed operator, bool allowed);
    event IdentitySet(address indexed account, bytes32 indexed identityHash);
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId, uint256 price);
    event PaidUpdated(uint256 indexed tokenId, uint256 newPaid);

    error NotSaleOperator();
    error EventLimitReached(bytes32 identityHash, uint256 eventId);

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

    /// @notice Autorizza/revoca un modulo di vendita (escrow) a `recordSale`.
    function setSaleOperator(address operator, bool allowed) external onlyOwner {
        isSaleOperator[operator] = allowed;
        emit SaleOperatorUpdated(operator, allowed);
    }

    /// @notice Registra l'identità di un wallet (solo `hash(CF)` on-chain; il CF
    ///         in chiaro resta cifrato off-chain). La imposta il backend dopo SPID.
    function setIdentity(address account, bytes32 identityHash) external onlyOwner {
        identityOf[account] = identityHash;
        emit IdentitySet(account, identityHash);
    }

    /// @notice Conia un biglietto verso `to` al prezzo `price` (face). Applica il
    ///         limite 2/evento per identità (R4): il 3º biglietto stesso
    ///         evento/identità fa revert.
    function mint(address to, uint256 eventId, uint256 price) external onlyOwner returns (uint256 tokenId) {
        bytes32 id = identityOf[to];
        if (id != bytes32(0)) {
            uint256 c = ++heldCount[id][eventId];
            if (c > MAX_PER_EVENT) revert EventLimitReached(id, eventId);
        }
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

    /// @notice Costo base corrente del token (base del tetto +5%).
    function paidOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _ticket[tokenId].paid;
    }

    /// @notice Royalty TINFT dovuta su una vendita: 1% del PREZZO ORIGINALE (R1).
    function royaltyDue(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return (_ticket[tokenId].originalPrice * ROYALTY_BPS) / 10_000; // 1%
    }

    /// @notice Registra una vendita secondaria (solo moduli di vendita autorizzati):
    ///         il costo base viaggia col token (R3) e il conteggio 2/evento si
    ///         sposta da venditore a compratore, applicando il limite al compratore.
    /// @dev    Va chiamata DOPO che il token è stato trasferito al compratore.
    function recordSale(address from, address to, uint256 tokenId, uint256 newPaid) external {
        if (!isSaleOperator[msg.sender]) revert NotSaleOperator();
        _requireOwned(tokenId);
        uint256 eventId = _ticket[tokenId].eventId;

        _ticket[tokenId].paid = newPaid;
        emit PaidUpdated(tokenId, newPaid);

        bytes32 idFrom = identityOf[from];
        if (idFrom != bytes32(0) && heldCount[idFrom][eventId] > 0) {
            heldCount[idFrom][eventId]--;
        }
        bytes32 idTo = identityOf[to];
        if (idTo != bytes32(0)) {
            uint256 c = ++heldCount[idTo][eventId];
            if (c > MAX_PER_EVENT) revert EventLimitReached(idTo, eventId);
        }
    }

    /// @dev Applica la transfer policy su ogni trasferimento reale (esclusi mint/burn).
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
