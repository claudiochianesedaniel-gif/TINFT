// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @dev venditore malevolo: al ricevere il prezzo tenta di rientrare nell'escrow.
contract ReentrantSeller {
    TinftEscrow internal immutable ESCROW;
    TinftTicket internal immutable TICKET;
    uint256 internal tokenId;
    bool internal armed;

    constructor(TinftEscrow escrow_, TinftTicket ticket_) {
        ESCROW = escrow_;
        TICKET = ticket_;
    }

    function listIt(uint256 id, uint256 price, uint64 ttl) external {
        tokenId = id;
        TICKET.setApprovalForAll(address(ESCROW), true);
        ESCROW.list(id, price, ttl);
        armed = true;
    }

    receive() external payable {
        if (armed) {
            armed = false;
            // tentativo di rientro: deve fallire (nonReentrant) e far revertire l'intera pay()
            ESCROW.cancel(tokenId);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

contract TinftEscrowTest is Test {
    TinftEscrow internal escrow;
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal tinftPayee = makeAddr("tinftPayee");
    address internal organizerPayee = makeAddr("organizerPayee");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal randomUser = makeAddr("randomUser");

    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant ROYALTY = PRICE / 100; // 1%
    uint256 internal constant HALF = ROYALTY / 2; // 0,5%
    uint64 internal constant TTL = 1 hours;

    uint256 internal tokenId;

    function setUp() public {
        split = new TinftRoyaltySplit(tinftPayee, organizerPayee);
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket), tinft);
        ticket.setTransferValidator(address(validator));
        validator.setOperator(address(escrow), true); // può muovere i token vincolati
        ticket.setSaleOperator(address(escrow), true); // può aggiornare il costo base
        tokenId = ticket.mint(seller, 42, PRICE);
        vm.stopPrank();

        vm.prank(seller);
        ticket.setApprovalForAll(address(escrow), true);
    }

    function _list() internal {
        vm.prank(seller);
        escrow.list(tokenId, PRICE, TTL);
    }

    // --- list ---
    function test_ListLocksToken() public {
        _list();
        assertEq(ticket.ownerOf(tokenId), address(escrow));
        (address s, uint256 p,,, bool active) = escrow.listings(tokenId);
        assertEq(s, seller);
        assertEq(p, PRICE);
        assertTrue(active);
    }

    function test_ListRequiresOwnership() public {
        vm.prank(buyer);
        vm.expectRevert(TinftEscrow.NotOwner.selector);
        escrow.list(tokenId, PRICE, TTL);
    }

    function test_ListZeroTtlReverts() public {
        vm.prank(seller);
        vm.expectRevert(TinftEscrow.ZeroTtl.selector);
        escrow.list(tokenId, PRICE, 0);
    }

    function test_DoubleListReverts() public {
        _list();
        vm.prank(seller);
        vm.expectRevert(TinftEscrow.AlreadyListed.selector);
        escrow.list(tokenId, PRICE, TTL);
    }

    // --- M3 DoD: pay() rilascia token+fondi+royalty in UNA tx ---
    function test_PaySettlesAtomically() public {
        _list();
        uint256 total = PRICE + ROYALTY;
        vm.deal(buyer, total);

        vm.prank(buyer);
        escrow.pay{value: total}(tokenId);

        // token al compratore
        assertEq(ticket.ownerOf(tokenId), buyer);
        // prezzo al venditore
        assertEq(seller.balance, PRICE);
        // royalty 0,5/0,5 allo split (due wallet distinti)
        assertEq(split.pending(tinftPayee), HALF);
        assertEq(split.pending(organizerPayee), ROYALTY - HALF);
        // il costo base viaggia col token (R3)
        assertEq(ticket.ticketData(tokenId).paid, PRICE);
        // listing chiuso, escrow svuotato
        (,,,, bool active) = escrow.listings(tokenId);
        assertFalse(active);
        assertEq(address(escrow).balance, 0);
    }

    function test_QuoteMatchesPayment() public {
        _list();
        (uint256 price, uint256 royalty, uint256 total) = escrow.quote(tokenId);
        assertEq(price, PRICE);
        assertEq(royalty, ROYALTY);
        assertEq(total, PRICE + ROYALTY);
    }

    function test_PayWrongAmountReverts() public {
        _list();
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TinftEscrow.WrongPayment.selector, PRICE + ROYALTY, PRICE));
        escrow.pay{value: PRICE}(tokenId);
    }

    function test_PayAfterExpiryReverts() public {
        _list();
        vm.warp(block.timestamp + TTL + 1);
        uint256 total = PRICE + ROYALTY;
        vm.deal(buyer, total);
        vm.prank(buyer);
        vm.expectRevert(TinftEscrow.Expired.selector);
        escrow.pay{value: total}(tokenId);
    }

    function test_PayUnlistedReverts() public {
        vm.deal(buyer, PRICE + ROYALTY);
        vm.prank(buyer);
        vm.expectRevert(TinftEscrow.NotListed.selector);
        escrow.pay{value: PRICE + ROYALTY}(tokenId);
    }

    // --- M3 DoD: senza pagamento entro ttl, reclaim() restituisce al venditore ---
    function test_ReclaimAfterTtlReturnsToSeller() public {
        _list();
        vm.warp(block.timestamp + TTL + 1);
        // chiunque può chiamare reclaim
        vm.prank(randomUser);
        escrow.reclaim(tokenId);
        assertEq(ticket.ownerOf(tokenId), seller);
        (,,,, bool active) = escrow.listings(tokenId);
        assertFalse(active);
    }

    function test_ReclaimBeforeTtlReverts() public {
        _list();
        vm.prank(randomUser);
        vm.expectRevert(TinftEscrow.NotExpired.selector);
        escrow.reclaim(tokenId);
    }

    // --- cancel ---
    function test_CancelBySellerReturnsToken() public {
        _list();
        vm.prank(seller);
        escrow.cancel(tokenId);
        assertEq(ticket.ownerOf(tokenId), seller);
    }

    function test_CancelByNonSellerReverts() public {
        _list();
        vm.prank(buyer);
        vm.expectRevert(TinftEscrow.NotSeller.selector);
        escrow.cancel(tokenId);
    }

    // --- sicurezza: reentrancy del venditore non ruba né blocca ---
    function test_ReentrantSellerCannotExploit() public {
        // un contratto malevolo mette in vendita e tenta il rientro alla ricezione dei fondi
        ReentrantSeller attacker = new ReentrantSeller(escrow, ticket);
        vm.prank(tinft);
        uint256 idA = ticket.mint(address(attacker), 7, PRICE);
        attacker.listIt(idA, PRICE, TTL);

        uint256 total = PRICE + ROYALTY;
        vm.deal(buyer, total);
        vm.prank(buyer);
        // il rientro nella receive() del venditore fa fallire il payout → TransferFailed
        vm.expectRevert(TinftEscrow.TransferFailed.selector);
        escrow.pay{value: total}(idA);

        // nessuno stato cambiato: token ancora in escrow, listing ancora attivo, niente fondi rubati
        assertEq(ticket.ownerOf(idA), address(escrow));
        (,,,, bool active) = escrow.listings(idA);
        assertTrue(active);
        assertEq(buyer.balance, total);
    }
}
