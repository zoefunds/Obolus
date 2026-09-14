// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ObolusEscrow
/// @notice Payment layer for Obolus, deployed on Base Sepolia. Holds real
///         USDC per vault (grantor funding + claimant/contester bonds) and
///         lets recipients self-claim once a settlement round is pushed.
///         Judgment (death verdicts, contest resolution, bond routing)
///         happens entirely off this chain, on GenLayer
///         (contracts/obolus.py) — this contract only ever sees a vault id
///         and a list of (recipient, amount) pushed here by a trusted
///         relayer after GenLayer resolves a claim or cancels a vault.
/// @dev No external dependencies (no OpenZeppelin import) so it can be
///      compiled/deployed with nothing more than solc.
// ----------------------------------------------------------------------
// Minimal ERC20 interface (USDC on Base Sepolia).
// ----------------------------------------------------------------------
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract ObolusEscrow {
    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------
    struct Pool {
        uint256 deposited;   // total USDC ever deposited under this vault id
        uint256 allocated;   // total USDC ever committed via settle()
    }

    IERC20 public immutable usdc;
    address public owner;
    address public relayer; // backend service authorized to push settlements

    mapping(bytes32 => Pool) public pools;                          // vaultId => pool
    mapping(bytes32 => mapping(address => uint256)) public claimable; // vaultId => recipient => USDC owed
    mapping(address => uint256) public totalClaimable;               // recipient => USDC owed across ALL vaults

    bool private _locked; // reentrancy guard

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event Deposited(bytes32 indexed vaultId, address indexed from, uint256 amount);
    event Settled(bytes32 indexed vaultId, uint256 recipientCount, uint256 totalAllocated);
    event Claimed(bytes32 indexed vaultId, address indexed recipient, uint256 amount);
    event RelayerUpdated(address indexed newRelayer);
    event OwnerUpdated(address indexed newOwner);
    event UnallocatedWithdrawn(bytes32 indexed vaultId, address indexed to, uint256 amount);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "ObolusEscrow: not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "ObolusEscrow: not relayer");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "ObolusEscrow: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    /// @param usdcToken USDC contract address on Base Sepolia.
    /// @param relayer_ Backend service wallet allowed to call settle().
    constructor(address usdcToken, address relayer_) {
        require(usdcToken != address(0), "ObolusEscrow: zero usdc");
        require(relayer_ != address(0), "ObolusEscrow: zero relayer");
        usdc = IERC20(usdcToken);
        owner = msg.sender;
        relayer = relayer_;
    }

    // ------------------------------------------------------------------
    // Funding — anyone can deposit USDC into a vault's pool (initial
    // funding, top-ups, claimant bonds, contester bonds all share the same
    // per-vault pool; GenLayer tracks which portion is which). Caller must
    // have approved this contract for `amount` beforehand.
    // ------------------------------------------------------------------
    function fundVault(bytes32 vaultId, uint256 amount) external nonReentrant {
        require(amount > 0, "ObolusEscrow: amount must be > 0");
        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        require(ok, "ObolusEscrow: USDC transferFrom failed");
        pools[vaultId].deposited += amount;
        emit Deposited(vaultId, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Relayer — pushes one GenLayer-finalized settlement round for a vault
    // (a resolve_claim verdict, or a cancel_vault refund). Unlike a
    // single-use "winners" gate, a vault can be settled multiple times over
    // its life (REFUTED/INCONCLUSIVE reopens it for a fresh claim), so this
    // only checks that cumulative allocation across every settle() call
    // never exceeds what has actually been deposited.
    // ------------------------------------------------------------------
    function settle(
        bytes32 vaultId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyRelayer {
        require(recipients.length == amounts.length, "ObolusEscrow: length mismatch");
        require(recipients.length > 0, "ObolusEscrow: no recipients");

        Pool storage pool = pools[vaultId];

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "ObolusEscrow: zero recipient address");
            total += amounts[i];
        }
        require(
            total <= pool.deposited - pool.allocated,
            "ObolusEscrow: total exceeds undeposited/unallocated pool"
        );

        pool.allocated += total;

        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] == 0) continue;
            claimable[vaultId][recipients[i]] += amounts[i];
            totalClaimable[recipients[i]] += amounts[i];
        }

        emit Settled(vaultId, recipients.length, total);
    }

    // ------------------------------------------------------------------
    // Claims — self-serve pull pattern, checks-effects-interactions.
    // ------------------------------------------------------------------
    function claim(bytes32 vaultId) external nonReentrant {
        uint256 amount = claimable[vaultId][msg.sender];
        require(amount > 0, "ObolusEscrow: nothing claimable");

        claimable[vaultId][msg.sender] = 0;
        totalClaimable[msg.sender] -= amount;

        bool ok = usdc.transfer(msg.sender, amount);
        require(ok, "ObolusEscrow: USDC transfer failed");

        emit Claimed(vaultId, msg.sender, amount);
    }

    /// @notice Claim across several vaults in one transaction.
    function claimMany(bytes32[] calldata vaultIds) external nonReentrant {
        uint256 total = 0;
        for (uint256 i = 0; i < vaultIds.length; i++) {
            bytes32 id = vaultIds[i];
            uint256 amount = claimable[id][msg.sender];
            if (amount == 0) continue;
            claimable[id][msg.sender] = 0;
            total += amount;
            emit Claimed(id, msg.sender, amount);
        }
        require(total > 0, "ObolusEscrow: nothing claimable");
        totalClaimable[msg.sender] -= total;
        bool ok = usdc.transfer(msg.sender, total);
        require(ok, "ObolusEscrow: USDC transfer failed");
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------
    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "ObolusEscrow: zero relayer");
        relayer = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ObolusEscrow: zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /// @notice Owner can pull back USDC deposited under a vault but never
    ///         allocated via settle() (e.g. a cancelled/never-claimed
    ///         vault). Cannot touch anything already allocated/claimable.
    function withdrawUnallocated(bytes32 vaultId, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "ObolusEscrow: zero recipient");
        Pool storage pool = pools[vaultId];
        uint256 available = pool.deposited - pool.allocated;
        require(amount <= available, "ObolusEscrow: exceeds unallocated amount");
        pool.deposited -= amount;
        bool ok = usdc.transfer(to, amount);
        require(ok, "ObolusEscrow: USDC transfer failed");
        emit UnallocatedWithdrawn(vaultId, to, amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function getPool(bytes32 vaultId) external view returns (uint256 deposited, uint256 allocated) {
        Pool storage pool = pools[vaultId];
        return (pool.deposited, pool.allocated);
    }

    function getClaimable(bytes32 vaultId, address recipient) external view returns (uint256) {
        return claimable[vaultId][recipient];
    }
}
