// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TinftTicketTest is Test {
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;

    address internal tinft = makeAddr("tinft"); // owner / piattaforma
    address internal saleModule = makeAddr("saleModule"); // operatore in allowlist
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal royaltySplit = makeAddr("royaltySplit");

    uint256 internal constant EVENT_ID = 42;
    uint256 internal constant PRICE = 3150; // €31,50 in centesimi (prezzo originale)

    function setUp() public {
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, royaltySplit);
        validator = new TinftTransferValidator(tinft);
        ticket.setTransferValidator(address(validator));
        validator.setOperator(saleModule, true);
        vm.stopPrank();
    }

    function _mintToAlice() internal returns (uint256 id) {
        vm.prank(tinft);
        id = ticket.mint(alice, EVENT_ID, PRICE);
    }

    // --- M1 DoD: il mint di un biglietto funziona ---
    function test_Mint() public {
        uint256 id = _mintToAlice();
        assertEq(ticket.ownerOf(id), alice);
        assertEq(ticket.balanceOf(alice), 1);
        assertTrue(ticket.policyBound(id));
        TinftTicket.TicketData memory d = ticket.ticketData(id);
        assertEq(d.eventId, EVENT_ID);
        assertEq(d.originalPrice, PRICE);
        assertEq(d.paid, PRICE); // al mint costo base == prezzo originale
    }

    function test_OnlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        ticket.mint(alice, EVENT_ID, PRICE);
    }

    // --- M1 DoD: un trasferimento via operatore in allowlist passa ---
    function test_TransferThroughAllowlistedOperator() public {
        uint256 id = _mintToAlice();
        // il wallet custodial approva il modulo TINFT
        vm.prank(alice);
        ticket.setApprovalForAll(saleModule, true);
        // l'operatore in allowlist sposta il token
        vm.prank(saleModule);
        ticket.transferFrom(alice, bob, id);
        assertEq(ticket.ownerOf(id), bob);
    }

    // --- M1 DoD: un trasferimento fuori dall'allowlist è BLOCCATO ---
    function test_DirectTransferIsBlocked() public {
        uint256 id = _mintToAlice();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftTransferValidator.OperatorNotAllowlisted.selector, alice));
        ticket.transferFrom(alice, bob, id);
        // proprietà invariata
        assertEq(ticket.ownerOf(id), alice);
    }

    function test_NonAllowlistedOperatorIsBlocked() public {
        uint256 id = _mintToAlice();
        address rogue = makeAddr("rogue");
        vm.prank(alice);
        ticket.setApprovalForAll(rogue, true);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(TinftTransferValidator.OperatorNotAllowlisted.selector, rogue));
        ticket.transferFrom(alice, bob, id);
    }

    function test_SafeTransferThroughOperator() public {
        uint256 id = _mintToAlice();
        vm.prank(alice);
        ticket.setApprovalForAll(saleModule, true);
        vm.prank(saleModule);
        ticket.safeTransferFrom(alice, bob, id);
        assertEq(ticket.ownerOf(id), bob);
    }

    function test_TransferAllowedWhenNoValidatorSet() public {
        // collezione senza validator: nessun blocco (utile per test/migrazioni)
        vm.prank(tinft);
        TinftTicket free = new TinftTicket("Free", "FREE", tinft, royaltySplit);
        vm.prank(tinft);
        uint256 id = free.mint(alice, EVENT_ID, PRICE);
        vm.prank(alice);
        free.transferFrom(alice, bob, id);
        assertEq(free.ownerOf(id), bob);
    }

    // --- royalty EIP-2981: 1% ---
    function test_RoyaltyInfoIsOnePercent() public {
        uint256 id = _mintToAlice();
        (address recv, uint256 amount) = ticket.royaltyInfo(id, 10_000);
        assertEq(recv, royaltySplit);
        assertEq(amount, 100); // 1% di 10_000
    }

    // --- royaltyDue: 1% del prezzo ORIGINALE (R1) ---
    function test_RoyaltyDueIsOnePercentOfOriginalPrice() public {
        uint256 id = _mintToAlice();
        assertEq(ticket.royaltyDue(id), (PRICE * 100) / 10_000); // 31
    }

    function test_SupportsInterfaces() public view {
        assertTrue(ticket.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(ticket.supportsInterface(0x2a55205a)); // ERC-2981
        assertTrue(ticket.supportsInterface(0x01ffc9a7)); // ERC-165
    }

    function test_SetOperatorOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        validator.setOperator(alice, true);
    }

    // fuzz: qualunque caller non in allowlist viene bloccato
    function testFuzz_OnlyAllowlistedCanMove(address caller) public {
        vm.assume(caller != saleModule && caller != address(0));
        uint256 id = _mintToAlice();
        vm.prank(alice);
        ticket.setApprovalForAll(caller, true);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(TinftTransferValidator.OperatorNotAllowlisted.selector, caller));
        ticket.transferFrom(alice, bob, id);
    }
}
