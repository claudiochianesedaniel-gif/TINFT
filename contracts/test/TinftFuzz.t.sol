// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";

/// @notice Test FUZZ delle regole economiche on-chain (fee di rivendita 1%, fee
///         d'uscita 25%, EIP-2981, tetto rivendita +5%, limite 3/evento per identità).
///         Verificano che gli invarianti valgano su TUTTO lo spazio degli input, non
///         solo su valori scelti a mano dai test unitari.
contract TinftFuzzTest is Test {
    TinftTicket internal ticket;
    TinftEscrow internal escrow;
    TinftRoyaltySplit internal split;
    TinftTransferValidator internal validator;

    address internal tinftPayee = makeAddr("tinftPayee");
    address internal organizerPayee = makeAddr("organizerPayee");
    address internal alice = makeAddr("alice");

    function setUp() public {
        split = new TinftRoyaltySplit(tinftPayee, organizerPayee);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", address(this), address(split));
        validator = new TinftTransferValidator(address(this));
        escrow = new TinftEscrow(address(ticket), address(this));
        ticket.setTransferValidator(address(validator));
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setPlatformTreasury(tinftPayee);
    }

    /// royalty dovuta = 1% del prezzo ORIGINALE, per qualsiasi prezzo.
    function testFuzz_RoyaltyDueIsOnePercent(uint256 price) public {
        price = bound(price, 0, 1e30);
        uint256 id = ticket.mint(alice, 1, price);
        assertEq(ticket.royaltyDue(id), price / 100);
    }

    /// fee d'uscita (export libero) = 25% del prezzo originale, per qualsiasi prezzo.
    function testFuzz_ExitFeeIs25Percent(uint256 price) public {
        price = bound(price, 0, 1e30);
        uint256 id = ticket.mint(alice, 1, price);
        assertEq(ticket.exitFee(id), price / 4);
    }

    /// EIP-2981: il destinatario è lo split e l'importo è l'1% del prezzo di vendita.
    function testFuzz_Eip2981RoyaltyInfo(uint256 originalPrice, uint256 salePrice) public {
        originalPrice = bound(originalPrice, 0, 1e30);
        salePrice = bound(salePrice, 0, 1e30);
        uint256 id = ticket.mint(alice, 1, originalPrice);
        (address recv, uint256 amount) = ticket.royaltyInfo(id, salePrice);
        assertEq(recv, address(split));
        assertEq(amount, salePrice / 100);
    }

    /// lo split conserva il valore (somma == ricevuto) e il wei dispari va all'organizzatore.
    function testFuzz_SplitConservationAndOddWei(uint256 amount) public {
        amount = bound(amount, 0, 1e27);
        vm.deal(address(this), amount);
        split.deposit{value: amount}();
        assertEq(split.pending(tinftPayee) + split.pending(organizerPayee), amount);
        assertEq(split.pending(organizerPayee) - split.pending(tinftPayee), amount % 2);
    }

    /// il destinatario della fee di rivendita segue la Fine evento: prima → tesoreria
    /// TINFT (1% intero), da lì in poi → split (0,5/0,5), per qualsiasi istante.
    function testFuzz_ResaleFeeReceiverFollowsEventEnd(uint64 endsAt, uint64 checkAt) public {
        endsAt = uint64(bound(endsAt, 1, type(uint64).max));
        uint256 id = ticket.mint(alice, 9, 1 ether);
        ticket.setEventEnd(9, endsAt);
        vm.warp(checkAt);
        address expected = checkAt < endsAt ? tinftPayee : address(split);
        assertEq(ticket.resaleRoyaltyReceiver(id), expected);
        assertEq(ticket.isTicketActive(id), checkAt < endsAt);
    }

    /// tetto rivendita +5%: al tetto si può listare, un wei sopra si rifiuta.
    function testFuzz_ResaleCapEnforced(uint256 paid) public {
        paid = bound(paid, 100, 1e24);
        uint256 id = ticket.mint(alice, 7, paid);
        uint256 cap = (paid * escrow.RESALE_CAP_BPS()) / 10_000;

        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);

        // un wei sopra il tetto → revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftEscrow.PriceAboveCap.selector, cap, cap + 1));
        escrow.list(id, cap + 1, 1 days);

        // esattamente al tetto → ok, token bloccato nell'escrow
        vm.prank(alice);
        escrow.list(id, cap, 1 days);
        (address s, uint256 p,,, bool active) = escrow.listings(id);
        assertEq(s, alice);
        assertEq(p, cap);
        assertTrue(active);
        assertEq(ticket.ownerOf(id), address(escrow));
    }

    /// anti-bagarinaggio: con identità registrata, max 3 biglietti/evento; il 4° rivertisce.
    function testFuzz_AntiScalpMaxPerEvent(uint256 eventId, bytes32 idHash) public {
        vm.assume(idHash != bytes32(0)); // 0 = wallet senza identità (esente)
        ticket.setIdentity(alice, idHash);
        ticket.mint(alice, eventId, 1 ether);
        ticket.mint(alice, eventId, 1 ether);
        ticket.mint(alice, eventId, 1 ether);
        vm.expectRevert(abi.encodeWithSelector(TinftTicket.EventLimitReached.selector, idHash, eventId));
        ticket.mint(alice, eventId, 1 ether);
    }

    /// il limite è per-evento: lo stesso wallet può ancora coniare su un evento diverso.
    function testFuzz_AntiScalpIndependentPerEvent(bytes32 idHash, uint256 e1, uint256 e2) public {
        vm.assume(idHash != bytes32(0));
        vm.assume(e1 != e2);
        ticket.setIdentity(alice, idHash);
        ticket.mint(alice, e1, 1 ether);
        ticket.mint(alice, e1, 1 ether);
        ticket.mint(alice, e1, 1 ether);
        uint256 id = ticket.mint(alice, e2, 1 ether); // evento diverso → consentito
        assertEq(ticket.ownerOf(id), alice);
    }
}
