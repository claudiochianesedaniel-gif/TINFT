// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";

/// @notice Deploy del core (M1+M2) su Base (Sepolia per ora):
///         split royalty 0,5/0,5 + validator + ticket agganciato a entrambi.
///         Uso: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract Deploy is Script {
    function run() external {
        address owner = msg.sender;
        // beneficiari royalty: TINFT (0,5%) e organizzatore (0,5%)
        address tinftPayee = vm.envOr("TINFT_PAYEE", owner);
        address organizerPayee = vm.envOr("ORGANIZER_PAYEE", owner);

        vm.startBroadcast();
        TinftRoyaltySplit split = new TinftRoyaltySplit(tinftPayee, organizerPayee);
        TinftTransferValidator validator = new TinftTransferValidator(owner);
        TinftTicket ticket = new TinftTicket("TINFT Ticket", "TINFT", owner, address(split));
        ticket.setTransferValidator(address(validator));
        vm.stopBroadcast();

        console2.log("TinftRoyaltySplit:     ", address(split));
        console2.log("TinftTransferValidator:", address(validator));
        console2.log("TinftTicket:           ", address(ticket));
    }
}
