// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TinftTicket} from "./TinftTicket.sol";

/// @title TinftEscrow
/// @notice Escrow P2P a pagamento per i biglietti TINFT (handoff §5).
///         - `list()`   : il venditore mette in vendita (tetto +10%, R2); il token
///                        è bloccato qui.
///         - `pay()`    : in UN'UNICA transazione → token al compratore, prezzo al
///                        venditore, royalty 1% allo split (0,5/0,5); il costo base
///                        viaggia col token (R3) e il limite 3/evento è applicato (R4).
///         - `reclaim()`: allo scadere del `ttl`, CHIUNQUE restituisce il token al
///                        venditore.
///         - `cancel()` : il venditore ritira l'offerta in qualsiasi momento.
///
/// @dev    Sicurezza: `ReentrancyGuard` + checks-effects-interactions (lo stato del
///         listing è azzerato PRIMA di trasferimenti/chiamate). `Pausable`: in
///         emergenza l'owner (multisig) può sospendere `list`/`pay`, ma `reclaim`
///         e `cancel` restano SEMPRE disponibili → i token non possono mai restare
///         intrappolati. La royalty va allo split (pull-payment) e non si blocca.
contract TinftEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    TinftTicket public immutable TICKET;

    struct Listing {
        address seller;
        uint256 price;
        uint64 createdAt;
        uint64 ttl;
        bool active;
    }

    mapping(uint256 tokenId => Listing listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, uint64 ttl);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 royalty);
    event Reclaimed(uint256 indexed tokenId, address indexed seller);
    event Cancelled(uint256 indexed tokenId, address indexed seller);

    error NotOwner();
    error NotSeller();
    error AlreadyListed();
    error NotListed();
    error ZeroTtl();
    error Expired();
    error NotExpired();
    error WrongPayment(uint256 expected, uint256 sent);
    error TransferFailed();
    error PriceAboveCap(uint256 cap, uint256 price);

    constructor(address ticket_, address initialOwner) Ownable(initialOwner) {
        TICKET = TinftTicket(ticket_);
    }

    /// @notice Sospende `list`/`pay` in emergenza (reclaim/cancel restano attivi).
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Mette in vendita `tokenId` a `price`, bloccandolo nell'escrow per `ttl` secondi.
    function list(uint256 tokenId, uint256 price, uint64 ttl) external nonReentrant whenNotPaused {
        if (listings[tokenId].active) revert AlreadyListed();
        if (TICKET.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (ttl == 0) revert ZeroTtl();

        // tetto rivendita +10% sul costo base (R2); il costo base viaggia col token (R3)
        uint256 cap = (TICKET.paidOf(tokenId) * 110) / 100;
        if (price > cap) revert PriceAboveCap(cap, price);

        listings[tokenId] =
            Listing({seller: msg.sender, price: price, createdAt: uint64(block.timestamp), ttl: ttl, active: true});

        // lock: il token passa all'escrow (richiede approvazione del venditore)
        TICKET.transferFrom(msg.sender, address(this), tokenId);
        emit Listed(tokenId, msg.sender, price, ttl);
    }

    /// @notice Prezzo, royalty (1% del prezzo originale) e totale a carico del compratore.
    function quote(uint256 tokenId) external view returns (uint256 price, uint256 royalty, uint256 total) {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotListed();
        price = l.price;
        royalty = TICKET.royaltyDue(tokenId);
        total = price + royalty;
    }

    /// @notice Acquisto: paga `prezzo + royalty` e ricevi il token nella stessa tx.
    function pay(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (block.timestamp > uint256(l.createdAt) + l.ttl) revert Expired();

        uint256 royalty = TICKET.royaltyDue(tokenId);
        uint256 total = l.price + royalty;
        if (msg.value != total) revert WrongPayment(total, msg.value);

        // effetti prima delle interazioni
        delete listings[tokenId];

        // 1) token al compratore (release atomico)
        TICKET.transferFrom(address(this), msg.sender, tokenId);
        // 2) costo base che viaggia col token (R3) + conteggio anti-bagarinaggio (R4):
        //    sposta la quota evento da venditore a compratore e applica il limite 3/evento
        TICKET.recordSale(l.seller, msg.sender, tokenId, l.price);
        // 3) royalty 1% allo split (0,5/0,5) — receiver pull-payment, non si blocca
        if (royalty > 0) {
            (address receiver,) = TICKET.royaltyInfo(tokenId, 0);
            (bool okRoyalty,) = payable(receiver).call{value: royalty}("");
            if (!okRoyalty) revert TransferFailed();
        }
        // 4) prezzo al venditore
        (bool okSeller,) = payable(l.seller).call{value: l.price}("");
        if (!okSeller) revert TransferFailed();

        emit Sold(tokenId, l.seller, msg.sender, l.price, royalty);
    }

    /// @notice Allo scadere del `ttl`, chiunque può restituire il token al venditore.
    /// @dev    Non sospendibile: il recupero del token è sempre garantito.
    function reclaim(uint256 tokenId) external nonReentrant {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (block.timestamp <= uint256(l.createdAt) + l.ttl) revert NotExpired();

        delete listings[tokenId];
        TICKET.transferFrom(address(this), l.seller, tokenId);
        emit Reclaimed(tokenId, l.seller);
    }

    /// @notice Il venditore ritira l'offerta e si riprende il token.
    /// @dev    Non sospendibile: il recupero del token è sempre garantito.
    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory l = listings[tokenId];
        if (!l.active) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();

        delete listings[tokenId];
        TICKET.transferFrom(address(this), l.seller, tokenId);
        emit Cancelled(tokenId, l.seller);
    }
}
