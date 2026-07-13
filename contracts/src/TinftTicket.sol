// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITransferValidator} from "./interfaces/ITransferValidator.sol";

/// @title TinftTicket
/// @notice Biglietto ERC-721 con trasferimenti *enforced* (ERC-721C) + royalty
///         EIP-2981 + anti-bagarinaggio + uscita controllata (export).
///
/// @dev    M1 transfer enforced · M2 fee di rivendita 1% / `originalPrice`
///         (biglietto ATTIVO → 100% a TINFT; mero NFT dopo la Fine evento →
///         split 0,5/0,5, vedi `resaleRoyaltyReceiver`) · M3 costo base
///         che viaggia col token · M4 limite 3/evento per identità (`hash(CF)`) ·
///         M5 validazione (`markUsed`) ed export post-evento:
///         `exportFree` (fee 25% + sgancio dalla policy) / `exportEnforced`
///         (royalty 1% per sempre).
contract TinftTicket is ERC721, ERC2981, Ownable2Step, ReentrancyGuard {
    /// @notice royalty in basis point (100 = 1%)
    uint96 public constant ROYALTY_BPS = 100;
    /// @notice fee d'uscita per l'export libero (2500 = 25%)
    uint256 public constant EXIT_FEE_BPS = 2500;
    /// @notice massimo biglietti per evento per identità (R4)
    uint256 public constant MAX_PER_EVENT = 3;

    /// @notice regime d'uscita scelto dal cliente (definitivo)
    enum ExportMode {
        None,
        Free, // rilascio completo: fuori dalla policy, royalty best-effort
        Enforced // resta vincolato: royalty 1% per sempre
    }

    /// @notice dati on-chain per biglietto
    struct TicketData {
        uint256 eventId;
        uint256 originalPrice; // prezzo originale (face) — base immutabile della royalty 1% (R1)
        uint256 paid; // costo base corrente — base del tetto +5% (R2/R3), aggiornato a ogni vendita
    }

    /// @notice validator esterno consultato a ogni trasferimento reale
    address public transferValidator;
    /// @notice destinatario della fee d'uscita 25% (tesoreria TINFT)
    address public platformTreasury;

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => TicketData data) private _ticket;
    /// @notice se true, il token è soggetto alla transfer policy (default al mint)
    mapping(uint256 tokenId => bool bound) public policyBound;
    /// @notice biglietto validato al varco. Per i biglietti NORMALI la validazione
    ///         BRUCIA il token (`_burn`), quindi `used` resta true come traccia ma
    ///         `ownerOf` reverte. Per i biglietti Signature (`isSpecial`) resta true
    ///         senza burn: il collectible sopravvive.
    mapping(uint256 tokenId => bool isUsed) public used;
    /// @notice biglietto Signature/special (1/1 dell'organizzatore): NON viene mai
    ///         bruciato all'ingresso, resta per sempre come pezzo da collezione.
    mapping(uint256 tokenId => bool special) public isSpecial;
    /// @notice regime d'uscita registrato sul token (definitivo)
    mapping(uint256 tokenId => ExportMode mode) public exportModeOf;
    /// @notice moduli di vendita autorizzati (escrow) a registrare le vendite
    mapping(address operator => bool allowed) public isSaleOperator;
    /// @notice operatori-validatore autorizzati a marcare un biglietto come usato
    mapping(address operator => bool allowed) public isValidatorOperator;
    /// @notice identità on-chain di un wallet: keccak256(codiceFiscale + salt). 0 = non registrato (esente).
    mapping(address account => bytes32 identityHash) public identityOf;
    /// @notice biglietti correntemente "controllati" da un'identità per evento (R4)
    mapping(bytes32 identityHash => mapping(uint256 eventId => uint256 count)) public heldCount;
    /// @notice "Fine evento" per eventId (epoch seconds). 0 = non impostata → i
    ///         biglietti dell'evento sono considerati ATTIVI (evento non concluso).
    mapping(uint256 eventId => uint256 endsAt) public eventEndOf;

    event TransferValidatorUpdated(address indexed validator);
    event PlatformTreasuryUpdated(address indexed treasury);
    event SaleOperatorUpdated(address indexed operator, bool allowed);
    event ValidatorOperatorUpdated(address indexed operator, bool allowed);
    event IdentitySet(address indexed account, bytes32 indexed identityHash);
    event EventEndSet(uint256 indexed eventId, uint256 endsAt);
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId, uint256 price);
    event SpecialMinted(uint256 indexed tokenId, address indexed to, uint256 indexed eventId);
    event PaidUpdated(uint256 indexed tokenId, uint256 newPaid);
    event TicketUsed(uint256 indexed tokenId);
    event TicketBurned(uint256 indexed tokenId);
    event Exported(uint256 indexed tokenId, ExportMode mode, uint256 exitFee);

    error NotSaleOperator();
    error NotValidatorOperator();
    error NotTicketOwner();
    error NotUsed();
    error TicketAlreadyUsed();
    error TokenInEscrow();
    error EventNotEnded();
    error AlreadyExported();
    error TreasuryNotSet();
    error WrongExitFee(uint256 expected, uint256 sent);
    error FeeTransferFailed();
    error EventLimitReached(bytes32 identityHash, uint256 eventId);

    constructor(string memory name_, string memory symbol_, address initialOwner, address royaltyReceiver)
        ERC721(name_, symbol_)
        Ownable(initialOwner)
    {
        _setDefaultRoyalty(royaltyReceiver, ROYALTY_BPS);
    }

    // --------------------------------------------------------------------- admin
    function setTransferValidator(address validator) external onlyOwner {
        transferValidator = validator;
        emit TransferValidatorUpdated(validator);
    }

    function setPlatformTreasury(address treasury) external onlyOwner {
        platformTreasury = treasury;
        emit PlatformTreasuryUpdated(treasury);
    }

    function setSaleOperator(address operator, bool allowed) external onlyOwner {
        isSaleOperator[operator] = allowed;
        emit SaleOperatorUpdated(operator, allowed);
    }

    function setValidatorOperator(address operator, bool allowed) external onlyOwner {
        isValidatorOperator[operator] = allowed;
        emit ValidatorOperatorUpdated(operator, allowed);
    }

    /// @notice Registra l'identità di un wallet (solo `hash(CF)` on-chain; il CF
    ///         in chiaro resta cifrato off-chain). La imposta il backend dopo SPID.
    function setIdentity(address account, bytes32 identityHash) external onlyOwner {
        identityOf[account] = identityHash;
        emit IdentitySet(account, identityHash);
    }

    /// @notice Registra la "Fine evento" di un eventId (epoch seconds). Prima di
    ///         quel momento il biglietto è ATTIVO (fee di rivendita 1% tutta a
    ///         TINFT); dopo è un mero NFT (split 0,5/0,5). La imposta il backend.
    function setEventEnd(uint256 eventId, uint256 endsAt) external onlyOwner {
        eventEndOf[eventId] = endsAt;
        emit EventEndSet(eventId, endsAt);
    }

    // ---------------------------------------------------------------------- mint
    /// @notice Conia un biglietto d'ingresso verso `to` al prezzo `price` (face).
    ///         Applica il limite 3/evento per identità (R4). Alla validazione VALID
    ///         il token viene BRUCIATO (vedi `markUsed`).
    function mint(address to, uint256 eventId, uint256 price) external onlyOwner returns (uint256 tokenId) {
        bytes32 id = identityOf[to];
        if (id != bytes32(0)) {
            uint256 c = ++heldCount[id][eventId];
            if (c > MAX_PER_EVENT) revert EventLimitReached(id, eventId);
        }
        tokenId = _mintTicket(to, eventId, price);
        emit TicketMinted(tokenId, to, eventId, price);
    }

    /// @notice Conia un biglietto Signature/special (1/1 collectible dell'organizzatore):
    ///         NON conta nel limite 3/evento (non è un biglietto d'ingresso) e NON
    ///         viene mai bruciato all'ingresso — resta per sempre nella collezione.
    function mintSpecial(address to, uint256 eventId, uint256 price) external onlyOwner returns (uint256 tokenId) {
        tokenId = _mintTicket(to, eventId, price);
        isSpecial[tokenId] = true;
        emit SpecialMinted(tokenId, to, eventId);
    }

    function _mintTicket(address to, uint256 eventId, uint256 price) private returns (uint256 tokenId) {
        tokenId = _nextId++;
        _ticket[tokenId] = TicketData({eventId: eventId, originalPrice: price, paid: price});
        policyBound[tokenId] = true;
        _safeMint(to, tokenId);
    }

    // ----------------------------------------------------------------- views
    function ticketData(uint256 tokenId) external view returns (TicketData memory) {
        _requireOwned(tokenId);
        return _ticket[tokenId];
    }

    function paidOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _ticket[tokenId].paid;
    }

    /// @notice Royalty TINFT dovuta su una vendita: 1% del PREZZO ORIGINALE (R1).
    function royaltyDue(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return (_ticket[tokenId].originalPrice * ROYALTY_BPS) / 10_000;
    }

    /// @notice true se il biglietto è ATTIVO: non ancora validato al varco E prima
    ///         della "Fine evento" del suo eventId (fine non impostata = attivo).
    ///         Un biglietto usato/esportato o post-evento è un mero NFT
    ///         (collectible, Market Collection).
    function isTicketActive(uint256 tokenId) public view returns (bool) {
        _requireOwned(tokenId);
        if (used[tokenId]) return false; // validato → collectible
        uint256 end = eventEndOf[_ticket[tokenId].eventId];
        return end == 0 || block.timestamp < end;
    }

    /// @notice Destinatario della fee di rivendita 1% secondo lo stato del token:
    ///         biglietto ATTIVO → 100% a TINFT (`platformTreasury`); mero NFT →
    ///         split 0,5/0,5 (receiver EIP-2981). Se la tesoreria non è impostata
    ///         si ripiega sullo split, così una vendita non può mai bloccarsi.
    function resaleRoyaltyReceiver(uint256 tokenId) external view returns (address) {
        if (isTicketActive(tokenId) && platformTreasury != address(0)) return platformTreasury;
        (address receiver,) = royaltyInfo(tokenId, 0);
        return receiver;
    }

    /// @notice Fee d'uscita per l'export libero: 25% del prezzo originale (R5).
    function exitFee(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        return (_ticket[tokenId].originalPrice * EXIT_FEE_BPS) / 10_000;
    }

    // ------------------------------------------------------------- vendita (M3/M4)
    /// @notice Registra una vendita secondaria (solo moduli di vendita autorizzati):
    ///         il costo base viaggia col token (R3) e il conteggio 3/evento si
    ///         sposta da venditore a compratore, applicando il limite al compratore.
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

    // ------------------------------------------------------- validazione + burn (M5)
    /// @notice Validazione al varco (esito VALID). Per un biglietto NORMALE l'ingresso
    ///         BRUCIA definitivamente il token (`_burn`): dopo, `ownerOf` reverte, il
    ///         token non è più listabile/trasferibile/esportabile e lo slot 3/evento
    ///         dell'identità viene liberato. Per un biglietto **Signature** (`isSpecial`)
    ///         non c'è burn: resta come pezzo da collezione, ancora trasferibile.
    ///         Idempotenza: un token già bruciato non esiste più → `ownerOf` reverte.
    function markUsed(uint256 tokenId) external {
        if (!isValidatorOperator[msg.sender]) revert NotValidatorOperator();
        address holder = ownerOf(tokenId); // reverte se il token non esiste (già bruciato)
        // difesa: un token in vendita è detenuto da un modulo di vendita (escrow) — non
        // va bruciato mentre è in listing (si validerebbe un biglietto messo in vendita).
        if (isSaleOperator[holder]) revert TokenInEscrow();
        used[tokenId] = true;
        emit TicketUsed(tokenId);

        if (!isSpecial[tokenId]) {
            // libera lo slot anti-bagarino dell'identità prima di distruggere il token
            bytes32 id = identityOf[holder];
            uint256 eventId = _ticket[tokenId].eventId;
            if (id != bytes32(0) && heldCount[id][eventId] > 0) {
                heldCount[id][eventId]--;
            }
            _burn(tokenId); // burn definitivo ERC-721 → Transfer(holder, address(0), tokenId)
            emit TicketBurned(tokenId);
        }
    }

    /// @notice (A) Rilascio completo del **mero NFT sopravvissuto** (biglietto NON usato
    ///         per entrare, a evento concluso): incassa la fee 25% e sgancia il token
    ///         dalla policy → da qui è liberamente trasferibile (royalty best-effort).
    ///         Un biglietto usato è già stato bruciato: non esiste più, non è esportabile.
    function exportFree(uint256 tokenId) external payable nonReentrant {
        _requireExportable(tokenId);
        if (platformTreasury == address(0)) revert TreasuryNotSet();
        uint256 fee = exitFee(tokenId);
        if (msg.value != fee) revert WrongExitFee(fee, msg.value);

        // effetti prima dell'interazione
        exportModeOf[tokenId] = ExportMode.Free;
        policyBound[tokenId] = false; // libero da qui
        emit Exported(tokenId, ExportMode.Free, fee);

        (bool ok,) = payable(platformTreasury).call{value: fee}("");
        if (!ok) revert FeeTransferFailed();
    }

    /// @notice (B) Export enforced: il token resta vincolato → la royalty 1%
    ///         continua a essere applicata a ogni futura vendita.
    function exportEnforced(uint256 tokenId) external {
        _requireExportable(tokenId);
        exportModeOf[tokenId] = ExportMode.Enforced; // policyBound resta true
        emit Exported(tokenId, ExportMode.Enforced, 0);
    }

    /// @dev Esportabile solo il **mero NFT sopravvissuto**: il token deve esistere
    ///      (owner check), NON essere stato usato per entrare (i biglietti usati
    ///      normali sono bruciati; un Signature usato resta collectible ma non si
    ///      "esporta") e l'evento dev'essere concluso (non più attivo).
    function _requireExportable(uint256 tokenId) private view {
        if (ownerOf(tokenId) != _msgSender()) revert NotTicketOwner();
        if (used[tokenId]) revert TicketAlreadyUsed();
        if (isTicketActive(tokenId)) revert EventNotEnded();
        if (exportModeOf[tokenId] != ExportMode.None) revert AlreadyExported();
    }

    // ------------------------------------------------------------------- internal
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
