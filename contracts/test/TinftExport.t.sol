// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @notice M5 — export post-evento: rilascio libero (fee 25%) vs enforced (royalty 1%).
contract TinftExportTest is Test {
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftEscrow internal escrow;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal treasury = makeAddr("treasury");
    address internal tinftPayee = makeAddr("tinftPayee");
    address internal orgPayee = makeAddr("orgPayee");
    address internal validatorOp = makeAddr("validatorOp");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant EVENT_ID = 42;
    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant FEE = PRICE / 4; // 25%
    uint256 internal constant ROYALTY = PRICE / 100; // 1%
    uint64 internal constant TTL = 1 hours;

    uint256 internal tokenId;

    function setUp() public {
        split = new TinftRoyaltySplit(tinftPayee, orgPayee);
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket));
        ticket.setTransferValidator(address(validator));
        ticket.setPlatformTreasury(treasury);
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setValidatorOperator(validatorOp, true);
        tokenId = ticket.mint(alice, EVENT_ID, PRICE);
        vm.stopPrank();
    }

    function _markUsed() internal {
        vm.prank(validatorOp);
        ticket.markUsed(tokenId);
    }

    function test_ExitFeeIsTwentyFivePercent() public view {
        assertEq(ticket.exitFee(tokenId), FEE);
    }

    // --- M5 DoD: dopo exportFree il token è trasferibile liberamente ---
    function test_ExportFreeUnbindsAndChargesFee() public {
        _markUsed();
        vm.deal(alice, FEE);
        vm.prank(alice);
        ticket.exportFree{value: FEE}(tokenId);

        assertEq(uint8(ticket.exportModeOf(tokenId)), uint8(TinftTicket.ExportMode.Free));
        assertFalse(ticket.policyBound(tokenId));
        assertEq(treasury.balance, FEE); // fee 25% alla tesoreria TINFT

        // ora il trasferimento diretto (fuori allowlist) è LIBERO
        vm.prank(alice);
        ticket.transferFrom(alice, bob, tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
    }

    // --- M5 DoD: dopo exportEnforced la royalty 1% scatta ancora ---
    function test_ExportEnforcedKeepsRoyaltyEnforced() public {
        _markUsed();
        vm.prank(alice);
        ticket.exportEnforced(tokenId);

        assertEq(uint8(ticket.exportModeOf(tokenId)), uint8(TinftTicket.ExportMode.Enforced));
        assertTrue(ticket.policyBound(tokenId));

        // il trasferimento diretto resta BLOCCATO
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftTransferValidator.OperatorNotAllowlisted.selector, alice));
        ticket.transferFrom(alice, bob, tokenId);

        // e una vendita via escrow applica ancora la royalty 1% (0,5/0,5)
        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(alice);
        escrow.list(tokenId, PRICE, TTL);
        vm.deal(bob, PRICE + ROYALTY);
        vm.prank(bob);
        escrow.pay{value: PRICE + ROYALTY}(tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
        assertEq(split.pending(tinftPayee), ROYALTY / 2);
        assertEq(split.pending(orgPayee), ROYALTY - ROYALTY / 2);
    }

    function test_ExportFreeWrongFeeReverts() public {
        _markUsed();
        vm.deal(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftTicket.WrongExitFee.selector, FEE, FEE - 1));
        ticket.exportFree{value: FEE - 1}(tokenId);
    }

    function test_ExportRequiresUsed() public {
        vm.deal(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(TinftTicket.NotUsed.selector);
        ticket.exportFree{value: FEE}(tokenId);
    }

    function test_ExportOnlyOwner() public {
        _markUsed();
        vm.deal(bob, FEE);
        vm.prank(bob);
        vm.expectRevert(TinftTicket.NotTicketOwner.selector);
        ticket.exportFree{value: FEE}(tokenId);
    }

    function test_CannotExportTwice() public {
        _markUsed();
        vm.prank(alice);
        ticket.exportEnforced(tokenId);
        vm.deal(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(TinftTicket.AlreadyExported.selector);
        ticket.exportFree{value: FEE}(tokenId);
    }

    function test_MarkUsedOnlyValidatorOperator() public {
        vm.prank(bob);
        vm.expectRevert(TinftTicket.NotValidatorOperator.selector);
        ticket.markUsed(tokenId);
    }

    function test_ExportFreeRequiresTreasury() public {
        // ticket senza tesoreria impostata
        vm.startPrank(tinft);
        TinftTicket t2 = new TinftTicket("X", "X", tinft, address(split));
        t2.setValidatorOperator(validatorOp, true);
        uint256 id2 = t2.mint(alice, EVENT_ID, PRICE);
        vm.stopPrank();
        vm.prank(validatorOp);
        t2.markUsed(id2);

        vm.deal(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(TinftTicket.TreasuryNotSet.selector);
        t2.exportFree{value: FEE}(id2);
    }
}
