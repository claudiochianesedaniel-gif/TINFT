// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @notice M4 — anti-bagarinaggio: tetto +10% e limite 3/evento per identità.
contract TinftAntiScalpTest is Test {
    TinftEscrow internal escrow;
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant ID_ALICE = keccak256("CF_ALICE+salt");
    bytes32 internal constant ID_BOB = keccak256("CF_BOB+salt");
    bytes32 internal constant ID_CAROL = keccak256("CF_CAROL+salt");

    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant CAP = (PRICE * 110) / 100; // +10%
    uint256 internal constant ROYALTY = PRICE / 100;
    uint64 internal constant TTL = 1 hours;
    uint256 internal constant EVENT_X = 100;
    uint256 internal constant EVENT_Y = 200;

    function setUp() public {
        split = new TinftRoyaltySplit(makeAddr("tinftPayee"), makeAddr("orgPayee"));
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket), tinft);
        ticket.setTransferValidator(address(validator));
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setIdentity(alice, ID_ALICE);
        ticket.setIdentity(bob, ID_BOB);
        ticket.setIdentity(carol, ID_CAROL);
        vm.stopPrank();
    }

    function _mint(address to, uint256 eventId) internal returns (uint256 id) {
        vm.prank(tinft);
        id = ticket.mint(to, eventId, PRICE);
    }

    function _list(address seller, uint256 id, uint256 price) internal {
        vm.prank(seller);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(seller);
        escrow.list(id, price, TTL);
    }

    // ---------------- Tetto +10% (R2) ----------------
    function test_ListAboveCapReverts() public {
        uint256 id = _mint(alice, EVENT_X);
        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftEscrow.PriceAboveCap.selector, CAP, CAP + 1));
        escrow.list(id, CAP + 1, TTL);
    }

    function test_ListAtCapSucceeds() public {
        uint256 id = _mint(alice, EVENT_X);
        _list(alice, id, CAP);
        assertEq(ticket.ownerOf(id), address(escrow));
    }

    function test_CapFollowsCostBasisAfterSale() public {
        // alice compra (mint), vende a bob a PRICE → il costo base di bob diventa PRICE
        uint256 id = _mint(alice, EVENT_X);
        _list(alice, id, PRICE);
        vm.deal(bob, PRICE + ROYALTY);
        vm.prank(bob);
        escrow.pay{value: PRICE + ROYALTY}(id);
        assertEq(ticket.paidOf(id), PRICE);
        // bob non può rilistare oltre PRICE*1.10
        vm.prank(bob);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TinftEscrow.PriceAboveCap.selector, CAP, CAP + 1));
        escrow.list(id, CAP + 1, TTL);
    }

    // ---------------- Limite 3/evento — primario (mint) ----------------
    function test_MintFourthForSameEventReverts() public {
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        vm.prank(tinft);
        vm.expectRevert(abi.encodeWithSelector(TinftTicket.EventLimitReached.selector, ID_ALICE, EVENT_X));
        ticket.mint(alice, EVENT_X, PRICE);
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 3);
    }

    function test_MintDifferentEventsOk() public {
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_Y); // evento diverso → conteggio separato
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 3);
        assertEq(ticket.heldCount(ID_ALICE, EVENT_Y), 1);
    }

    function test_UnregisteredRecipientIsExempt() public {
        address anon = makeAddr("anon"); // nessuna identità
        _mint(anon, EVENT_X);
        _mint(anon, EVENT_X);
        _mint(anon, EVENT_X);
        _mint(anon, EVENT_X); // nessun limite per wallet non registrati (es. contratti di sistema)
        assertEq(ticket.balanceOf(anon), 4);
    }

    // ---------------- Limite 3/evento — secondario (escrow.pay) ----------------
    function test_BuyingFourthForSameEventReverts() public {
        // alice ha già 3 per EVENT_X
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        // carol vende un quarto biglietto EVENT_X
        uint256 cId = _mint(carol, EVENT_X);
        _list(carol, cId, PRICE);

        uint256 total = PRICE + ROYALTY;
        vm.deal(alice, total);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftTicket.EventLimitReached.selector, ID_ALICE, EVENT_X));
        escrow.pay{value: total}(cId);

        // nessuno stato cambiato: token ancora in escrow, alice non ha pagato
        assertEq(ticket.ownerOf(cId), address(escrow));
        assertEq(alice.balance, total);
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 3);
    }

    function test_SaleMovesCountBetweenIdentities() public {
        uint256 id = _mint(alice, EVENT_X); // alice: 1
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 1);
        _list(alice, id, PRICE);
        // listare NON scala il conteggio del venditore (resta "controllato")
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 1);

        vm.deal(bob, PRICE + ROYALTY);
        vm.prank(bob);
        escrow.pay{value: PRICE + ROYALTY}(id);

        // alla vendita effettiva: alice -1, bob +1
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 0);
        assertEq(ticket.heldCount(ID_BOB, EVENT_X), 1);
        assertEq(ticket.ownerOf(id), bob);
    }

    // niente bypass list→compra→reclaim, niente stuck
    function test_ListDoesNotEnableBypass_AndReclaimNeverStuck() public {
        uint256 a = _mint(alice, EVENT_X);
        _mint(alice, EVENT_X);
        _mint(alice, EVENT_X); // alice: 3
        _list(alice, a, PRICE); // lista A: conteggio resta 3
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 3);

        // alice tenta di comprare un 4º (di carol) mentre A è in vendita → bloccato
        uint256 cId = _mint(carol, EVENT_X);
        _list(carol, cId, PRICE);
        uint256 total = PRICE + ROYALTY;
        vm.deal(alice, total);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TinftTicket.EventLimitReached.selector, ID_ALICE, EVENT_X));
        escrow.pay{value: total}(cId);

        // reclaim di A non può fallire per il limite (non tocca i conteggi)
        vm.warp(block.timestamp + TTL + 1);
        vm.prank(alice);
        escrow.reclaim(a);
        assertEq(ticket.ownerOf(a), alice);
        assertEq(ticket.heldCount(ID_ALICE, EVENT_X), 3);
    }

    // ---------------- recordSale protetto ----------------
    function test_RecordSaleOnlySaleOperator() public {
        uint256 id = _mint(alice, EVENT_X);
        vm.prank(bob);
        vm.expectRevert(TinftTicket.NotSaleOperator.selector);
        ticket.recordSale(alice, bob, id, PRICE);
    }
}
