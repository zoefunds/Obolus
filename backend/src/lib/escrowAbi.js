/** ABI subset for ObolusEscrow.sol (contracts/base/ObolusEscrow.sol),
 * deployed on Base Sepolia. Kept hand-written and minimal — only the
 * functions/events the backend actually calls. */
export const OBOLUS_ESCROW_ABI = [
  "function fundVault(bytes32 vaultId, uint256 amount) external",
  "function settle(bytes32 vaultId, address[] recipients, uint256[] amounts) external",
  "function claim(bytes32 vaultId) external",
  "function claimMany(bytes32[] vaultIds) external",
  "function getPool(bytes32 vaultId) external view returns (uint256 deposited, uint256 allocated)",
  "function getClaimable(bytes32 vaultId, address recipient) external view returns (uint256)",
  "function totalClaimable(address recipient) external view returns (uint256)",
  "function relayer() external view returns (address)",
  "function owner() external view returns (address)",
  "event Settled(bytes32 indexed vaultId, uint256 recipientCount, uint256 totalAllocated)",
  "event Claimed(bytes32 indexed vaultId, address indexed recipient, uint256 amount)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];
