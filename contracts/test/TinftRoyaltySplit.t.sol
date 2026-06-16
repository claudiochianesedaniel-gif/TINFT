// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";
import {TinftTicket} from "../src/TinftTicket.sol";

/// @dev beneficiario che rifiuta i fondi — per testare l'isolamento dei ritiri.
contract RejectEther {
    receive() external payable {
        revert("rifiuto");
    }
}

contract TinftRoyaltySplitTest is Test {
    TinftRoyaltySplit internal split;
    TinftTicket internal ticket;

    address internal tinft = makeAddr("tinft"); // 0,5%
    address internal organizer = makeAddr("organizer"); // 0,5%
    address internal alice = makeAddr("alice");

    uint256 internal constant ORIGINAL_PRICE = 1 ether; // prezzo originale
    uint256 internal constant ROYALTY = ORIGINAL_PRICE / 100; // 1%
    uint256 internal constant HALF = ROYALTY / 2; // 0,5%

    function setUp() public {
        split = new TinftRoyaltySplit(tinft, organizer);
        // collezione con lo split come destinatario royalty EIP-2981
        ticket = new TinftTicket("TINFT Ticket", "TINFT", address(this), address(split));
    }

    function _pay(uint256 amount) internal {
        vm.deal(address(this), amount);
        (bool ok,) = payable(address(split)).call{value: amount}("");
        assertTrue(ok);
    }

    // --- M2 DoD: una vendita accredita 0,5% a DUE WALLET DISTINTI ---
    function test_P2PSaleCreditsTwoDistinctWallets() public {
        uint256 id = ticket.mint(alice, 42, ORIGINAL_PRICE);
        // il modulo di vendita trattiene l'1% del prezzo ORIGINALE e lo instrada allo split
        uint256 due = ticket.royaltyDue(id);
        assertEq(due, ROYALTY);
        _pay(due);

        assertTrue(tinft != organizer); // due wallet distinti
        assertEq(split.pending(tinft), HALF); // 0,5%
        assertEq(split.pending(organizer), HALF); // 0,5%
        assertEq(split.pending(tinft) + split.pending(organizer), due); // somma == 1%
    }

    // --- integrazione EIP-2981: la royalty punta allo split e si divide 50/50 ---
    function test_Eip2981RoyaltyFlowsToSplit() public {
        uint256 id = ticket.mint(alice, 42, ORIGINAL_PRICE);
        (address recv, uint256 amount) = ticket.royaltyInfo(id, 2 ether);
        assertEq(recv, address(split));
        assertEq(amount, 2 ether / 100); // 1% del prezzo passato dal marketplace
        _pay(amount);
        assertEq(split.pending(tinft), amount / 2);
        assertEq(split.pending(organizer), amount - amount / 2);
    }

    function test_DistributesFiftyFifty() public {
        vm.deal(address(this), ROYALTY);
        split.deposit{value: ROYALTY}();
        assertEq(split.pending(tinft), HALF);
        assertEq(split.pending(organizer), HALF);
        assertEq(split.totalReceived(), ROYALTY);
    }

    function test_ReceiveViaPlainTransfer() public {
        _pay(ROYALTY);
        assertEq(split.pending(tinft), HALF);
        assertEq(split.pending(organizer), HALF);
    }

    function test_WithdrawTransfersFunds() public {
        _pay(ROYALTY);
        uint256 t0 = tinft.balance;
        uint256 o0 = organizer.balance;

        vm.prank(tinft);
        split.withdraw();
        vm.prank(organizer);
        split.withdraw();

        assertEq(tinft.balance, t0 + HALF);
        assertEq(organizer.balance, o0 + HALF);
        assertEq(split.pending(tinft), 0);
        assertEq(split.pending(organizer), 0);
    }

    function test_OddAmountRemainderToOrganizer() public {
        _pay(3); // 3 wei: 1 a TINFT, 2 (resto) all'organizzatore
        assertEq(split.pending(tinft), 1);
        assertEq(split.pending(organizer), 2);
    }

    function test_WithdrawNothingReverts() public {
        vm.prank(alice);
        vm.expectRevert(TinftRoyaltySplit.NothingToWithdraw.selector);
        split.withdraw();
    }

    function test_WithdrawFailureIsIsolated() public {
        // organizzatore = contratto che rifiuta i fondi
        RejectEther bad = new RejectEther();
        TinftRoyaltySplit s = new TinftRoyaltySplit(tinft, address(bad));
        vm.deal(address(this), ROYALTY);
        (bool ok,) = payable(address(s)).call{value: ROYALTY}("");
        assertTrue(ok); // l'incasso non fallisce mai

        // il ritiro del beneficiario "cattivo" fallisce...
        vm.prank(address(bad));
        vm.expectRevert(TinftRoyaltySplit.WithdrawFailed.selector);
        s.withdraw();
        // ...ma non blocca TINFT
        vm.prank(tinft);
        s.withdraw();
        assertEq(tinft.balance, HALF);
    }

    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert(TinftRoyaltySplit.ZeroAddress.selector);
        new TinftRoyaltySplit(address(0), organizer);
        vm.expectRevert(TinftRoyaltySplit.ZeroAddress.selector);
        new TinftRoyaltySplit(tinft, address(0));
    }

    function test_ConstructorRejectsSamePayee() public {
        vm.expectRevert(TinftRoyaltySplit.PayeesMustDiffer.selector);
        new TinftRoyaltySplit(tinft, tinft);
    }

    // fuzz: la somma accreditata è sempre pari al ricevuto e mai negativa
    function testFuzz_ConservationOfFunds(uint256 amount) public {
        amount = bound(amount, 0, 1_000_000 ether);
        vm.deal(address(this), amount);
        split.deposit{value: amount}();
        assertEq(split.pending(tinft) + split.pending(organizer), amount);
        assertEq(split.totalReceived(), amount);
    }
}
