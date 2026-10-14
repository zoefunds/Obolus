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
    address public settlementAuthorizer; // independent key that signs finalized GenLayer rulings

    mapping(bytes32 => Pool) public pools;                          // vaultId => pool
    mapping(bytes32 => mapping(address => uint256)) public claimable; // vaultId => recipient => USDC owed
    mapping(address => uint256) public totalClaimable;               // recipient => USDC owed across ALL vaults

    // Monotonic counter folded into every paymentId so two deposits with
    // an identical (vaultId, payer, amount) tuple never collide — each
    // real transfer gets its own unique, never-reused identifier the
    // GenLayer contract's record_payment/_consume_payment binds a
    // principal/bond declaration to (see contracts/obolus.py).
    uint256 public paymentNonce;
    mapping(bytes32 => bool) public paymentExists; // paymentId => recorded, for cheap existence checks

    // Every settlement batch the relayer pushes must carry a unique
    // settlementId (derived off-chain from GenLayer's own Settlement.id,
    // which is never reused). Rejecting a repeat here is what stops a
    // retried relay call — e.g. a Base settle() that succeeded but whose
    // follow-up mark_settlements_relayed call on GenLayer then failed —
    // from allocating the same settlement a second time.
    mapping(bytes32 => bool) public settledIds; // individual GenLayer settlement id => already applied
    mapping(bytes32 => Deposit) public deposits;

    struct Deposit {
        bytes32 vaultId;
        address payer;
        uint256 amount;
        bool refunded;
    }

    bool private _locked; // reentrancy guard

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event Deposited(bytes32 indexed vaultId, address indexed from, uint256 amount, bytes32 paymentId);
    event Settled(bytes32 indexed vaultId, bytes32 indexed rulingHash, uint256 recipientCount, uint256 totalAllocated);
    event SettlementApplied(bytes32 indexed settlementId, bytes32 indexed vaultId, address indexed recipient, uint256 amount);
    event Claimed(bytes32 indexed vaultId, address indexed recipient, uint256 amount);
    event RelayerUpdated(address indexed newRelayer);
    event OwnerUpdated(address indexed newOwner);
    event DepositRefunded(bytes32 indexed paymentId, bytes32 indexed vaultId, address indexed payer, uint256 amount);
    event SettlementAuthorizerUpdated(address indexed newAuthorizer);

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

    modifier onlySettlementAuthorizer() {
        require(msg.sender == settlementAuthorizer, "ObolusEscrow: not authorizer");
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
    constructor(address usdcToken, address relayer_, address settlementAuthorizer_) {
        require(usdcToken != address(0), "ObolusEscrow: zero usdc");
        require(relayer_ != address(0), "ObolusEscrow: zero relayer");
        require(settlementAuthorizer_ != address(0), "ObolusEscrow: zero authorizer");
        require(settlementAuthorizer_ != relayer_, "ObolusEscrow: authorizer must be independent");
        usdc = IERC20(usdcToken);
        owner = msg.sender;
        relayer = relayer_;
        settlementAuthorizer = settlementAuthorizer_;
    }

    // ------------------------------------------------------------------
    // Funding — anyone can deposit USDC into a vault's pool (initial
    // funding, top-ups, claimant bonds, contester bonds all share the same
    // per-vault pool; GenLayer tracks which portion is which). Caller must
    // have approved this contract for `amount` beforehand.
    // ------------------------------------------------------------------
    function fundVault(bytes32 vaultId, uint256 amount) external nonReentrant returns (bytes32 paymentId) {
        require(amount > 0, "ObolusEscrow: amount must be > 0");
        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        require(ok, "ObolusEscrow: USDC transferFrom failed");
        pools[vaultId].deposited += amount;

        paymentId = keccak256(
            abi.encodePacked(address(this), vaultId, msg.sender, amount, paymentNonce)
        );
        paymentNonce += 1;
        paymentExists[paymentId] = true;
        deposits[paymentId] = Deposit(vaultId, msg.sender, amount, false);

        emit Deposited(vaultId, msg.sender, amount, paymentId);
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
        bytes32 rulingHash,
        bytes32[] calldata settlementIds,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 authorizationDeadline,
        bytes calldata authorization
    ) external onlyRelayer {
        require(recipients.length == amounts.length, "ObolusEscrow: length mismatch");
        require(settlementIds.length == amounts.length, "ObolusEscrow: id length mismatch");
        require(recipients.length > 0, "ObolusEscrow: no recipients");
        require(block.timestamp <= authorizationDeadline, "ObolusEscrow: authorization expired");
        bytes32 digest = settlementAuthorizationDigest(
            vaultId, rulingHash, settlementIds, recipients, amounts, authorizationDeadline
        );
        require(_recover(digest, authorization) == settlementAuthorizer, "ObolusEscrow: invalid authorization");

        _allocate(vaultId, rulingHash, settlementIds, recipients, amounts);
    }

    function _allocate(
        bytes32 vaultId,
        bytes32 rulingHash,
        bytes32[] calldata settlementIds,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) internal {

        Pool storage pool = pools[vaultId];

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(settlementIds[i] != bytes32(0), "ObolusEscrow: zero settlement id");
            require(!settledIds[settlementIds[i]], "ObolusEscrow: settlement already applied");
            // settledIds is written only after this validation loop. Without
            // an intra-batch check, [id, id] would pass both reads and credit
            // the same signed entitlement twice in one malformed batch.
            for (uint256 j = 0; j < i; j++) {
                require(settlementIds[j] != settlementIds[i], "ObolusEscrow: duplicate settlement id");
            }
            require(recipients[i] != address(0), "ObolusEscrow: zero recipient address");
            total += amounts[i];
        }
        require(
            total <= pool.deposited - pool.allocated,
            "ObolusEscrow: total exceeds undeposited/unallocated pool"
        );

        pool.allocated += total;

        for (uint256 i = 0; i < recipients.length; i++) {
            settledIds[settlementIds[i]] = true;
            emit SettlementApplied(settlementIds[i], vaultId, recipients[i], amounts[i]);
            if (amounts[i] == 0) continue;
            claimable[vaultId][recipients[i]] += amounts[i];
            totalClaimable[recipients[i]] += amounts[i];
        }

        emit Settled(vaultId, rulingHash, recipients.length, total);
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
        require(newRelayer != settlementAuthorizer, "ObolusEscrow: relayer must be independent");
        relayer = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    /// @notice The owner cannot seize the authorization role. Only the
    /// existing independent authorizer may hand its role to a replacement.
    function rotateSettlementAuthorizer(address newAuthorizer) external onlySettlementAuthorizer {
        require(newAuthorizer != address(0), "ObolusEscrow: zero authorizer");
        require(newAuthorizer != relayer, "ObolusEscrow: authorizer must be independent");
        settlementAuthorizer = newAuthorizer;
        emit SettlementAuthorizerUpdated(newAuthorizer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ObolusEscrow: zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /// @notice Refund one specific deposit only after the independent
    /// settlement authorizer confirms that its GenLayer attestation/funding
    /// failed. The owner has no withdrawal path and the payer cannot choose
    /// another recipient. The signed paymentId makes this one-shot and
    /// prevents active principal or bonds being swept administratively.
    function refundFailedPayment(
        bytes32 paymentId,
        uint256 authorizationDeadline,
        bytes calldata authorization
    ) external nonReentrant {
        Deposit storage deposit = deposits[paymentId];
        require(deposit.payer == msg.sender, "ObolusEscrow: only payer may refund");
        require(!deposit.refunded, "ObolusEscrow: payment already refunded");
        require(block.timestamp <= authorizationDeadline, "ObolusEscrow: authorization expired");
        bytes32 digest = refundAuthorizationDigest(paymentId, authorizationDeadline);
        require(_recover(digest, authorization) == settlementAuthorizer, "ObolusEscrow: invalid authorization");
        Pool storage pool = pools[deposit.vaultId];
        require(deposit.amount <= pool.deposited - pool.allocated, "ObolusEscrow: funds already allocated");
        deposit.refunded = true;
        pool.deposited -= deposit.amount;
        bool ok = usdc.transfer(deposit.payer, deposit.amount);
        require(ok, "ObolusEscrow: USDC transfer failed");
        emit DepositRefunded(paymentId, deposit.vaultId, deposit.payer, deposit.amount);
    }

    function settlementAuthorizationDigest(
        bytes32 vaultId,
        bytes32 rulingHash,
        bytes32[] calldata settlementIds,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 payload = keccak256(abi.encode(
            block.chainid, address(this), vaultId, rulingHash,
            keccak256(abi.encode(settlementIds)),
            keccak256(abi.encode(recipients)),
            keccak256(abi.encode(amounts)), deadline
        ));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
    }

    function refundAuthorizationDigest(bytes32 paymentId, uint256 deadline)
        public view returns (bytes32)
    {
        Deposit storage deposit = deposits[paymentId];
        bytes32 payload = keccak256(abi.encode(
            block.chainid, address(this), bytes32("REFUND_FAILED_PAYMENT"),
            paymentId, deposit.vaultId, deposit.payer, deposit.amount, deadline
        ));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "ObolusEscrow: bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0,
            "ObolusEscrow: malleable signature");
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "ObolusEscrow: bad signature v");
        return ecrecover(digest, v, r, s);
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
