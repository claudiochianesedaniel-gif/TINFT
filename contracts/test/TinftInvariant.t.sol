// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @dev Handler guidato dal fuzzer STATEFUL: deposita importi casuali nello split e
///      fa ritirare i due beneficiari, tracciando il totale ritirato. Le sequenze
///      (ordine e numero di chiamate) le sceglie il fuzzer.
contract SplitHandler is Test {
    TinftRoyaltySplit public immutable SPLIT;
    address public immutable TINFT;
    address public immutable ORGANIZER;
    uint256 public totalWithdrawn;

    constructor(TinftRoyaltySplit split_, address tinft_, address organizer_) {
        SPLIT = split_;
        TINFT = tinft_;
        ORGANIZER = organizer_;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 0, 1e24);
        vm.deal(address(this), amount);
        SPLIT.deposit{value: amount}();
    }

    function withdrawTinft() external {
        _withdraw(TINFT);
    }

    function withdrawOrganizer() external {
        _withdraw(ORGANIZER);
    }

    function _withdraw(address who) internal {
        uint256 p = SPLIT.pending(who);
        if (p == 0) return; // niente da ritirare → no-op (evita revert)
        vm.prank(who);
        SPLIT.withdraw();
        totalWithdrawn += p;
    }
}

/// @notice Invariante STATEFUL sullo split royalty: in qualsiasi sequenza di depositi
///         e ritiri il valore si conserva (nessun wei creato o perso) e il saldo del
///         contratto eguaglia sempre i fondi non ancora ritirati.
contract TinftSplitInvariant is StdInvariant, Test {
    TinftRoyaltySplit internal split;
    SplitHandler internal handler;
    address internal tinft = makeAddr("tinft");
    address internal organizer = makeAddr("organizer");

    function setUp() public {
        split = new TinftRoyaltySplit(tinft, organizer);
        handler = new SplitHandler(split, tinft, organizer);
        // limita il fuzzer alle sole azioni significative dell'handler
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = SplitHandler.deposit.selector;
        selectors[1] = SplitHandler.withdrawTinft.selector;
        selectors[2] = SplitHandler.withdrawOrganizer.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// ricevuto == (in attesa) + (già ritirato): nessun wei creato o distrutto.
    function invariant_valueConserved() public view {
        assertEq(split.pending(tinft) + split.pending(organizer) + handler.totalWithdrawn(), split.totalReceived());
    }

    /// il saldo del contratto eguaglia sempre la somma dei pending (fondi non ritirati).
    function invariant_balanceMatchesPending() public view {
        assertEq(address(split).balance, split.pending(tinft) + split.pending(organizer));
    }
}
