// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TinftTicket} from "../src/TinftTicket.sol";
import {TinftTransferValidator} from "../src/TinftTransferValidator.sol";
import {TinftRoyaltySplit} from "../src/TinftRoyaltySplit.sol";
import {TinftEscrow} from "../src/TinftEscrow.sol";

/// @notice Deploy del core (M1+M2+M3) su Base (Sepolia per ora):
///         split royalty 0,5/0,5 + validator + ticket + escrow, con i permessi
///         (operatore di trasferimento e modulo di vendita) già configurati.
///         Uso: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract Deploy is Script {
    function run() external {
        address owner = msg.sender;
        address tinftPayee = vm.envOr("TINFT_PAYEE", owner);
        address organizerPayee = vm.envOr("ORGANIZER_PAYEE", owner);

        vm.startBroadcast();
        TinftRoyaltySplit split = new TinftRoyaltySplit(tinftPayee, organizerPayee);
        TinftTransferValidator validator = new TinftTransferValidator(owner);
        TinftTicket ticket = new TinftTicket("TINFT Ticket", "TINFT", owner, address(split));
        TinftEscrow escrow = new TinftEscrow(address(ticket));

        ticket.setTransferValidator(address(validator));
        validator.setOperator(address(escrow), true); // l'escrow può muovere i token vincolati
        ticket.setSaleOperator(address(escrow), true); // e aggiornare il costo base (R3)
        vm.stopBroadcast();

        console2.log("TinftRoyaltySplit:     ", address(split));
        console2.log("TinftTransferValidator:", address(validator));
        console2.log("TinftTicket:           ", address(ticket));
        console2.log("TinftEscrow:           ", address(escrow));
    }
}
