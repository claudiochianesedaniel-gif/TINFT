// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";

/// @notice Deploy del core M1 su Base (Sepolia per ora):
///         validator + ticket, con la collezione agganciata al validator.
///         Uso: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract Deploy is Script {
    function run() external {
        address owner = msg.sender;
        // in M2 diventerà l'indirizzo dello SplitRoyalty (0,5% + 0,5%)
        address royaltyReceiver = vm.envOr("ROYALTY_RECEIVER", owner);

        vm.startBroadcast();
        TinftTransferValidator validator = new TinftTransferValidator(owner);
        TinftTicket ticket = new TinftTicket("TINFT Ticket", "TINFT", owner, royaltyReceiver, 100);
        ticket.setTransferValidator(address(validator));
        vm.stopBroadcast();

        console2.log("TinftTransferValidator:", address(validator));
        console2.log("TinftTicket:           ", address(ticket));
        console2.log("royaltyReceiver:       ", royaltyReceiver);
    }
}
