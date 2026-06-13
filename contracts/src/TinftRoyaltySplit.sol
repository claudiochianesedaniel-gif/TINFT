// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TinftRoyaltySplit
/// @notice Ripartisce la royalty dell'1% in due quote uguali da 0,5%:
///         metà a TINFT, metà all'organizzatore (due wallet DISTINTI).
///         È il destinatario royalty EIP-2981 della collezione e riceve l'1%
///         trattenuto dal modulo di vendita TINFT su ogni vendita secondaria.
///
/// @dev    Pattern *pull-payment*: alla ricezione dei fondi non si fanno chiamate
///         esterne (si accreditano solo i saldi), così l'incasso non può MAI
///         fallire o restare bloccato. I beneficiari ritirano con `withdraw()`;
///         se il ritiro di uno fallisce, non blocca quello dell'altro.
///         Lavora con valuta nativa (ETH su Base). Per regolamenti in stablecoin
///         si aggiungerà una variante ERC-20 nei moduli pagamenti (M7).
contract TinftRoyaltySplit {
    /// @notice beneficiario 0,5% — piattaforma TINFT
    address public immutable TINFT;
    /// @notice beneficiario 0,5% — organizzatore dell'evento/collezione
    address public immutable ORGANIZER;

    /// @notice saldo ritirabile per beneficiario
    mapping(address payee => uint256 amount) public pending;
    /// @notice totale royalty ricevute (lordo)
    uint256 public totalReceived;

    event RoyaltyReceived(address indexed from, uint256 amount, uint256 toTinft, uint256 toOrganizer);
    event Withdrawn(address indexed payee, uint256 amount);

    error ZeroAddress();
    error PayeesMustDiffer();
    error NothingToWithdraw();
    error WithdrawFailed();

    /// @param tinft_      wallet TINFT (0,5%)
    /// @param organizer_  wallet organizzatore (0,5%) — deve essere diverso da TINFT
    constructor(address tinft_, address organizer_) {
        if (tinft_ == address(0) || organizer_ == address(0)) revert ZeroAddress();
        if (tinft_ == organizer_) revert PayeesMustDiffer();
        TINFT = tinft_;
        ORGANIZER = organizer_;
    }

    /// @notice Riceve la royalty e la accredita 50/50 ai due beneficiari.
    receive() external payable {
        _distribute(msg.value);
    }

    /// @notice Variante esplicita di ricezione (equivalente a `receive`).
    function deposit() external payable {
        _distribute(msg.value);
    }

    /// @notice Ritira il saldo maturato dal chiamante.
    function withdraw() external {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[msg.sender] = 0; // effetti prima dell'interazione (anti-reentrancy)
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Quota maturata e ritirabile da `payee`.
    function releasable(address payee) external view returns (uint256) {
        return pending[payee];
    }

    /// @dev Metà a TINFT; il resto (in caso di importo dispari) all'organizzatore,
    ///      così la somma accreditata è sempre esattamente pari al ricevuto.
    function _distribute(uint256 amount) internal {
        uint256 toTinft = amount / 2;
        uint256 toOrganizer = amount - toTinft;
        pending[TINFT] += toTinft;
        pending[ORGANIZER] += toOrganizer;
        totalReceived += amount;
        emit RoyaltyReceived(msg.sender, amount, toTinft, toOrganizer);
    }
}
