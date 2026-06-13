// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITransferValidator} from "./interfaces/ITransferValidator.sol";

/// @title TinftTransferValidator
/// @notice Policy di trasferimento ad allowlist di operatori per i biglietti TINFT.
///         Durante la vita "viva" del biglietto ogni trasferimento deve passare
///         da un modulo TINFT in allowlist (vendita, escrow, regalo). I
///         trasferimenti diretti wallet-to-wallet sono bloccati: è ciò che rende
///         la royalty 1% e le regole anti-bagarinaggio realmente *enforced* sul
///         mercato secondario (cfr. handoff §1, §4).
contract TinftTransferValidator is ITransferValidator, Ownable {
    /// @notice operatore => abilitato a muovere token vincolati alla policy
    mapping(address operator => bool allowed) public isAllowedOperator;

    event OperatorAllowlisted(address indexed operator, bool allowed);

    error OperatorNotAllowlisted(address caller);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Aggiunge/rimuove un operatore (es. il modulo vendita/escrow TINFT).
    function setOperator(address operator, bool allowed) external onlyOwner {
        isAllowedOperator[operator] = allowed;
        emit OperatorAllowlisted(operator, allowed);
    }

    /// @inheritdoc ITransferValidator
    /// @dev Mint (from==0) e burn (to==0) non arrivano qui come trasferimenti
    ///      vincolati: li filtra il token. `from`/`to` sono riservati a policy
    ///      future; in M1 si valida solo il `caller`.
    function validateTransfer(address caller, address, address) external view {
        if (!isAllowedOperator[caller]) revert OperatorNotAllowlisted(caller);
    }
}
