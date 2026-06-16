// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev tesoreria malevola che tenta di rientrare in exportFree alla ricezione della fee.
contract ReentrantTreasury {
    TinftTicket internal immutable TICKET;
    uint256 internal armedId;
    bool internal armed;

    constructor(TinftTicket t) {
        TICKET = t;
    }

    function arm(uint256 id) external {
        armedId = id;
        armed = true;
    }

    receive() external payable {
        if (armed) {
            armed = false;
            TICKET.exportFree{value: 0}(armedId); // rientro → bloccato da nonReentrant
        }
    }
}

contract TinftHardeningTest is Test {
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftEscrow internal escrow;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal treasury = makeAddr("treasury");
    address internal validatorOp = makeAddr("validatorOp");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal newOwner = makeAddr("newOwner");

    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant ROYALTY = PRICE / 100;
    uint64 internal constant TTL = 1 hours;
    uint256 internal tokenId;

    function setUp() public {
        split = new TinftRoyaltySplit(makeAddr("tinftPayee"), makeAddr("orgPayee"));
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket), tinft);
        ticket.setTransferValidator(address(validator));
        ticket.setPlatformTreasury(treasury);
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setValidatorOperator(validatorOp, true);
        tokenId = ticket.mint(alice, 42, PRICE);
        vm.stopPrank();
        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);
    }

    // ----------------- Pausable: ferma il trading, non il recupero -----------------
    function test_PausedBlocksList() public {
        vm.prank(tinft);
        escrow.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.list(tokenId, PRICE, TTL);
    }

    function test_PausedBlocksPay() public {
        vm.prank(alice);
        escrow.list(tokenId, PRICE, TTL);
        vm.prank(tinft);
        escrow.pause();
        vm.deal(bob, PRICE + ROYALTY);
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.pay{value: PRICE + ROYALTY}(tokenId);
    }

    function test_ReclaimWorksWhilePaused() public {
        vm.prank(alice);
        escrow.list(tokenId, PRICE, TTL);
        vm.prank(tinft);
        escrow.pause();
        vm.warp(block.timestamp + TTL + 1);
        vm.prank(bob); // chiunque
        escrow.reclaim(tokenId);
        assertEq(ticket.ownerOf(tokenId), alice); // token mai intrappolato
    }

    function test_CancelWorksWhilePaused() public {
        vm.prank(alice);
        escrow.list(tokenId, PRICE, TTL);
        vm.prank(tinft);
        escrow.pause();
        vm.prank(alice);
        escrow.cancel(tokenId);
        assertEq(ticket.ownerOf(tokenId), alice);
    }

    function test_OnlyOwnerCanPause() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.pause();
    }

    function test_UnpauseRestoresTrading() public {
        vm.startPrank(tinft);
        escrow.pause();
        escrow.unpause();
        vm.stopPrank();
        vm.prank(alice);
        escrow.list(tokenId, PRICE, TTL); // di nuovo possibile
        assertEq(ticket.ownerOf(tokenId), address(escrow));
    }

    // ----------------- Ownable2Step -----------------
    function test_TwoStepOwnershipTransfer() public {
        vm.prank(tinft);
        ticket.transferOwnership(newOwner);
        // l'owner non cambia finché il nuovo non accetta
        assertEq(ticket.owner(), tinft);
        assertEq(ticket.pendingOwner(), newOwner);
        vm.prank(newOwner);
        ticket.acceptOwnership();
        assertEq(ticket.owner(), newOwner);
        assertEq(ticket.pendingOwner(), address(0));
    }

    function test_NonPendingCannotAccept() public {
        vm.prank(tinft);
        ticket.transferOwnership(newOwner);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        ticket.acceptOwnership();
    }

    // ----------------- exportFree è reentrancy-safe -----------------
    function test_ExportFreeReentrancyGuarded() public {
        // ticket con tesoreria malevola
        vm.startPrank(tinft);
        TinftTicket t2 = new TinftTicket("X", "X", tinft, address(split));
        t2.setValidatorOperator(validatorOp, true);
        ReentrantTreasury bad = new ReentrantTreasury(t2);
        t2.setPlatformTreasury(address(bad));
        uint256 id2 = t2.mint(alice, 42, PRICE);
        vm.stopPrank();
        vm.prank(validatorOp);
        t2.markUsed(id2);
        ReentrantTreasury(payable(address(bad))).arm(id2);

        uint256 fee = t2.exitFee(id2);
        vm.deal(alice, fee);
        vm.prank(alice);
        vm.expectRevert(TinftTicket.FeeTransferFailed.selector);
        t2.exportFree{value: fee}(id2);

        // stato invariato: niente export, token ancora vincolato
        assertEq(uint8(t2.exportModeOf(id2)), uint8(TinftTicket.ExportMode.None));
        assertTrue(t2.policyBound(id2));
    }
}
