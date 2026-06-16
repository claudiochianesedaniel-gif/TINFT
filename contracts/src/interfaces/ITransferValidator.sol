// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ITransferValidator
/// @notice Interfaccia minimale di un transfer validator in stile ERC-721C.
///         Il token chiama `validateTransfer` su ogni trasferimento che non sia
///         mint o burn; il validator DEVE fare revert per bloccare un
///         trasferimento non consentito.
interface ITransferValidator {
    /// @param caller indirizzo che ha avviato il trasferimento (msg.sender sul token)
    /// @param from   proprietario attuale
    /// @param to     destinatario
    function validateTransfer(address caller, address from, address to) external view;
}
