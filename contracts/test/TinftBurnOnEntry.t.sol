// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @notice Regola di prodotto (committente): entrare al varco BRUCIA il biglietto
///         normale (ticket + NFT) — burn definitivo ERC-721. Il biglietto Signature
///         (isSpecial) NON viene mai bruciato. Un token bruciato non è listabile,
///         trasferibile né esportabile.
contract TinftBurnOnEntryTest is Test {
    TinftTicket internal ticket;
    TinftTransferValidator internal validator;
    TinftEscrow internal escrow;
    TinftRoyaltySplit internal split;

    address internal tinft = makeAddr("tinft");
    address internal tinftPayee = makeAddr("tinftPayee");
    address internal orgPayee = makeAddr("orgPayee");
    address internal validatorOp = makeAddr("validatorOp");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant EVENT_ID = 42;
    uint256 internal constant PRICE = 1 ether;
    uint64 internal constant TTL = 1 hours;

    function setUp() public {
        split = new TinftRoyaltySplit(tinftPayee, orgPayee);
        vm.startPrank(tinft);
        ticket = new TinftTicket("TINFT Ticket", "TINFT", tinft, address(split));
        validator = new TinftTransferValidator(tinft);
        escrow = new TinftEscrow(address(ticket), tinft);
        ticket.setTransferValidator(address(validator));
        ticket.setPlatformTreasury(tinftPayee);
        validator.setOperator(address(escrow), true);
        ticket.setSaleOperator(address(escrow), true);
        ticket.setValidatorOperator(validatorOp, true);
        vm.stopPrank();
    }

    function _mint(address to) internal returns (uint256 id) {
        vm.prank(tinft);
        id = ticket.mint(to, EVENT_ID, PRICE);
    }

    function _mintSpecial(address to) internal returns (uint256 id) {
        vm.prank(tinft);
        id = ticket.mintSpecial(to, EVENT_ID, PRICE);
    }

    // --- DoD: VALID su biglietto normale → ownerOf reverte (burn definitivo) ---
    function test_MarkUsed_BurnsNormalTicket() public {
        uint256 id = _mint(alice);
        assertEq(ticket.ownerOf(id), alice);
        assertEq(ticket.balanceOf(alice), 1);

        // il burn emette Transfer(alice, address(0), id) + TicketBurned
        vm.expectEmit(true, true, true, false, address(ticket));
        emit IERC721.Transfer(alice, address(0), id);
        vm.prank(validatorOp);
        ticket.markUsed(id);

        // token distrutto: ownerOf reverte, balance decrementato, resta traccia in `used`
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        ticket.ownerOf(id);
        assertEq(ticket.balanceOf(alice), 0);
        assertTrue(ticket.used(id));
    }

    // --- DoD: VALID su Signature → nessun burn, token intatto e trasferibile ---
    function test_MarkUsed_KeepsSignatureIntact() public {
        uint256 id = _mintSpecial(alice);
        assertTrue(ticket.isSpecial(id));

        vm.prank(validatorOp);
        ticket.markUsed(id);

        // il collectible sopravvive: owner invariato, marcato used ma esiste
        assertEq(ticket.ownerOf(id), alice);
        assertEq(ticket.balanceOf(alice), 1);
        assertTrue(ticket.used(id));

        // e resta trasferibile via escrow (export libero l'avrebbe escluso perché used)
        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(alice);
        escrow.list(id, PRICE, TTL);
        assertEq(ticket.ownerOf(id), address(escrow));
    }

    // --- un token bruciato non è listabile ---
    function test_BurnedTicket_NotListable() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        ticket.setApprovalForAll(address(escrow), true);
        vm.prank(validatorOp);
        ticket.markUsed(id); // burn

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        escrow.list(id, PRICE, TTL);
    }

    // --- un token bruciato non è trasferibile ---
    function test_BurnedTicket_NotTransferable() public {
        uint256 id = _mint(alice);
        vm.prank(validatorOp);
        ticket.markUsed(id); // burn

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        ticket.transferFrom(alice, bob, id);
    }

    // --- un token bruciato non è esportabile ---
    function test_BurnedTicket_NotExportable() public {
        uint256 id = _mint(alice);
        vm.prank(validatorOp);
        ticket.markUsed(id); // burn

        vm.deal(alice, PRICE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        ticket.exportFree{value: PRICE / 4}(id);
    }

    // --- il burn libera lo slot anti-bagarino (3/evento) dell'identità ---
    function test_Burn_ReleasesAntiScalpSlot() public {
        bytes32 idHash = keccak256("alice-CF");
        vm.prank(tinft);
        ticket.setIdentity(alice, idHash);

        uint256 t1 = _mint(alice);
        _mint(alice);
        _mint(alice); // alice a 3/3 per l'evento
        assertEq(ticket.heldCount(idHash, EVENT_ID), 3);

        // entra con un biglietto → burn → slot liberato → può ricomprarne un altro
        vm.prank(validatorOp);
        ticket.markUsed(t1);
        assertEq(ticket.heldCount(idHash, EVENT_ID), 2);
        _mint(alice); // 4° mint ora consentito (torna a 3)
        assertEq(ticket.heldCount(idHash, EVENT_ID), 3);
    }

    // --- markUsed idempotente: un token già bruciato non è ri-marcabile ---
    function test_MarkUsed_OnBurnedReverts() public {
        uint256 id = _mint(alice);
        vm.prank(validatorOp);
        ticket.markUsed(id); // burn
        vm.prank(validatorOp);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        ticket.markUsed(id);
    }

    // --- Signature esente anche con identità registrata: nessun burn ---
    function test_SpecialNotBurned_EvenWithIdentity() public {
        bytes32 idHash = keccak256("bob-CF");
        vm.prank(tinft);
        ticket.setIdentity(bob, idHash);
        uint256 id = _mintSpecial(bob);

        vm.prank(validatorOp);
        ticket.markUsed(id);
        assertEq(ticket.ownerOf(id), bob); // intatto
    }
}
