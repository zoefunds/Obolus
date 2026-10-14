/** ABI subset for ObolusEscrow.sol (contracts/base/ObolusEscrow.sol),
 * deployed on Base Sepolia. Kept hand-written and minimal — only the
 * functions/events the backend actually calls. */
export const OBOLUS_ESCROW_ABI = [
  "function fundVault(bytes32 vaultId, uint256 amount) external returns (bytes32 paymentId)",
  "function settle(bytes32 vaultId, bytes32 rulingHash, bytes32[] settlementIds, address[] recipients, uint256[] amounts, uint256 authorizationDeadline, bytes authorization) external",
  "function settlementAuthorizationDigest(bytes32 vaultId, bytes32 rulingHash, bytes32[] settlementIds, address[] recipients, uint256[] amounts, uint256 deadline) external view returns (bytes32)",
  "function refundFailedPayment(bytes32 paymentId, uint256 authorizationDeadline, bytes authorization) external",
  "function refundAuthorizationDigest(bytes32 paymentId, uint256 deadline) external view returns (bytes32)",
  "function claim(bytes32 vaultId) external",
  "function claimMany(bytes32[] vaultIds) external",
  "function getPool(bytes32 vaultId) external view returns (uint256 deposited, uint256 allocated)",
  "function getClaimable(bytes32 vaultId, address recipient) external view returns (uint256)",
  "function totalClaimable(address recipient) external view returns (uint256)",
  "function paymentExists(bytes32 paymentId) external view returns (bool)",
  "function deposits(bytes32 paymentId) external view returns (bytes32 vaultId, address payer, uint256 amount, bool refunded)",
  "function settledIds(bytes32 settlementId) external view returns (bool)",
  "function settlementAuthorizer() external view returns (address)",
  "function relayer() external view returns (address)",
  "function owner() external view returns (address)",
  "event Deposited(bytes32 indexed vaultId, address indexed from, uint256 amount, bytes32 paymentId)",
  "event Settled(bytes32 indexed vaultId, bytes32 indexed rulingHash, uint256 recipientCount, uint256 totalAllocated)",
  "event SettlementApplied(bytes32 indexed settlementId, bytes32 indexed vaultId, address indexed recipient, uint256 amount)",
  "event DepositRefunded(bytes32 indexed paymentId, bytes32 indexed vaultId, address indexed payer, uint256 amount)",
  "event Claimed(bytes32 indexed vaultId, address indexed recipient, uint256 amount)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];
