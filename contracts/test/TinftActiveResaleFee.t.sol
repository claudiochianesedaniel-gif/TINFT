// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @notice Fee di rivendita condizionale allo stato del token (task committente):
///         - biglietto ATTIVO (block.timestamp < Fine evento, o fine non impostata)
///           → l'1% va TUTTO a TINFT (`platformTreasury`);
///         - mero NFT (dopo la Fine evento) → split 0,5/0,5 invariato.
///         Copre anche il tetto di rivendita +5% (task correlato, stesso ciclo di audit).
contract TinftActiveResaleFeeTest is Test {
    TinftEscrow internal escrow;
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal tinftPayee = makeAddr("tinftPayee");
    address internal organizerPayee = makeAddr("organizerPayee");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");

    uint256 internal constant EVENT_ID = 42;
    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant ROYALTY = PRICE / 100; // 1% del prezzo originale
    uint64 internal constant TTL = 1 hours;
    uint256 internal eventEnd;

    uint256 internal tokenId;

    function setUp() public {
        eventEnd = block.timestamp + 7 days; // Fine evento nel futuro → biglietto ATTIVO
        split = new TinftRoyaltySplit(tinftPayee, organizerPayee);
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket), tinft);
        ticket.setTransferValidator(address(validator));
        ticket.setPlatformTreasury(tinftPayee); // come nel Deploy: tesoreria = TINFT_PAYEE
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setEventEnd(EVENT_ID, eventEnd);
        tokenId = ticket.mint(seller, EVENT_ID, PRICE);
        vm.stopPrank();

        vm.prank(seller);
        ticket.setApprovalForAll(address(escrow), true);
    }

    function _listAndPay() internal {
        vm.prank(seller);
        escrow.list(tokenId, PRICE, TTL);
        uint256 total = PRICE + ROYALTY;
        vm.deal(buyer, total);
        vm.prank(buyer);
        escrow.pay{value: total}(tokenId);
    }

    // --- biglietto ATTIVO: 1% tutto a TINFT -------------------------------------
    function test_ActiveResale_FeeAllToTinft() public {
        assertTrue(ticket.isTicketActive(tokenId));
        _listAndPay();

        // l'1% è andato INTERO alla tesoreria TINFT, niente allo split
        assertEq(tinftPayee.balance, ROYALTY);
        assertEq(split.totalReceived(), 0);
        assertEq(split.pending(tinftPayee), 0);
        assertEq(split.pending(organizerPayee), 0);
        // il resto della vendita è invariato: token al compratore, prezzo al venditore
        assertEq(ticket.ownerOf(tokenId), buyer);
        assertEq(seller.balance, PRICE);
    }

    function test_UnsetEventEnd_TreatedAsActive() public {
        // evento SENZA Fine evento impostata → biglietto attivo → fee a TINFT
        vm.startPrank(tinft);
        uint256 id2 = ticket.mint(seller, 777, PRICE); // eventEndOf[777] == 0
        vm.stopPrank();
        assertTrue(ticket.isTicketActive(id2));
        assertEq(ticket.resaleRoyaltyReceiver(id2), tinftPayee);
    }

    // --- mero NFT (dopo la Fine evento): split 0,5/0,5 invariato ----------------
    function test_PostEventResale_FeeSplitHalfHalf() public {
        vm.warp(eventEnd); // esattamente alla Fine evento → NON più attivo
        assertFalse(ticket.isTicketActive(tokenId));
        _listAndPay();

        // split 0,5/0,5 come prima; la tesoreria non riceve nulla in diretta
        assertEq(tinftPayee.balance, 0);
        assertEq(split.totalReceived(), ROYALTY);
        assertEq(split.pending(tinftPayee), ROYALTY / 2);
        assertEq(split.pending(organizerPayee), ROYALTY - ROYALTY / 2);
    }

    function test_BecomesMereNftExactlyAtEventEnd() public {
        vm.warp(eventEnd - 1);
        assertTrue(ticket.isTicketActive(tokenId)); // un secondo prima: attivo
        vm.warp(eventEnd);
        assertFalse(ticket.isTicketActive(tokenId)); // alla fine: mero NFT
        assertEq(ticket.resaleRoyaltyReceiver(tokenId), address(split));
    }

    // --- robustezza: tesoreria non impostata → fallback allo split --------------
    function test_TreasuryUnset_FallsBackToSplit() public {
        vm.prank(tinft);
        ticket.setPlatformTreasury(address(0));
        assertTrue(ticket.isTicketActive(tokenId));
        assertEq(ticket.resaleRoyaltyReceiver(tokenId), address(split)); // mai bloccata

        _listAndPay();
        assertEq(split.totalReceived(), ROYALTY);
    }

    // --- permessi ---------------------------------------------------------------
    function test_SetEventEnd_OnlyOwner() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, seller));
        ticket.setEventEnd(EVENT_ID, block.timestamp + 1);
    }

    // --- tetto +5% (task correlato, stesso ciclo di audit) -----------------------
    function test_ResaleCap_FivePercent() public {
        uint256 cap = (PRICE * escrow.RESALE_CAP_BPS()) / 10_000; // +5%
        assertEq(cap, (PRICE * 105) / 100);

        // un wei sopra il tetto → revert
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(TinftEscrow.PriceAboveCap.selector, cap, cap + 1));
        escrow.list(tokenId, cap + 1, TTL);

        // esattamente al tetto → ok
        vm.prank(seller);
        escrow.list(tokenId, cap, TTL);
        assertEq(ticket.ownerOf(tokenId), address(escrow));
    }
}
