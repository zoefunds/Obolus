// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ObolusEscrow, IERC20} from "../ObolusEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function expectRevert(bytes calldata revertData) external;
}
contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function decimals() external pure returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ObolusEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant AUTHORIZER_KEY = 0xA11CE;
    address private relayer;
    address private authorizer;
    address private payer;
    address private beneficiary;
    MockUSDC private usdc;
    ObolusEscrow private escrow;
    bytes32 private constant VAULT = bytes32(uint256(7));

    function setUp() public {
        relayer = vm.addr(0xB0B);
        authorizer = vm.addr(AUTHORIZER_KEY);
        payer = vm.addr(0xCAFE);
        beneficiary = vm.addr(0xBEEF);
        usdc = new MockUSDC();
        escrow = new ObolusEscrow(address(usdc), relayer, authorizer);
        usdc.mint(payer, 1_000_000);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _fund(uint256 amount) private returns (bytes32 paymentId) {
        vm.prank(payer);
        paymentId = escrow.fundVault(VAULT, amount);
    }

    function _arrays(bytes32 id, address recipient, uint256 amount)
        private pure returns (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts)
    {
        ids = new bytes32[](1); ids[0] = id;
        recipients = new address[](1); recipients[0] = recipient;
        amounts = new uint256[](1); amounts[0] = amount;
    }

    function _authorization(bytes32 ruling, bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts, uint256 deadline)
        private returns (bytes memory)
    {
        bytes32 digest = escrow.settlementAuthorizationDigest(VAULT, ruling, ids, recipients, amounts, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function testOwnerHasNoWithdrawalSurface() public {
        _fund(100);
        (bool ok,) = address(escrow).call(abi.encodeWithSignature("withdrawUnallocated(bytes32,address,uint256)", VAULT, address(this), 100));
        require(!ok, "owner withdrawal unexpectedly exists");
        require(usdc.balanceOf(address(escrow)) == 100, "principal moved");
    }

    function testRelayerCannotSettleWithoutIndependentAuthorization() public {
        _fund(100);
        (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts) = _arrays(bytes32(uint256(1)), beneficiary, 100);
        vm.expectRevert(bytes("ObolusEscrow: bad signature length"));
        vm.prank(relayer);
        escrow.settle(VAULT, bytes32(uint256(9)), ids, recipients, amounts, block.timestamp + 60, "");
    }

    function testRecipientSubstitutionInvalidatesAuthorization() public {
        _fund(100);
        bytes32 ruling = bytes32(uint256(9));
        uint256 deadline = block.timestamp + 60;
        (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts) = _arrays(bytes32(uint256(1)), beneficiary, 100);
        bytes memory signature = _authorization(ruling, ids, recipients, amounts, deadline);
        recipients[0] = payer;
        vm.expectRevert(bytes("ObolusEscrow: invalid authorization"));
        vm.prank(relayer);
        escrow.settle(VAULT, ruling, ids, recipients, amounts, deadline, signature);
    }

    function testOverlappingEntitlementCannotReplay() public {
        _fund(200);
        bytes32 ruling = bytes32(uint256(9));
        uint256 deadline = block.timestamp + 60;
        (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts) = _arrays(bytes32(uint256(1)), beneficiary, 100);
        bytes memory signature = _authorization(ruling, ids, recipients, amounts, deadline);
        vm.prank(relayer);
        escrow.settle(VAULT, ruling, ids, recipients, amounts, deadline, signature);
        signature = _authorization(ruling, ids, recipients, amounts, deadline);
        vm.expectRevert(bytes("ObolusEscrow: settlement already applied"));
        vm.prank(relayer);
        escrow.settle(VAULT, ruling, ids, recipients, amounts, deadline, signature);
    }

    function testAllocatedDepositCannotBeRefunded() public {
        bytes32 paymentId = _fund(100);
        bytes32 ruling = bytes32(uint256(9));
        uint256 deadline = block.timestamp + 60;
        (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts) = _arrays(bytes32(uint256(1)), beneficiary, 100);
        bytes memory settlementSignature = _authorization(ruling, ids, recipients, amounts, deadline);
        vm.prank(relayer);
        escrow.settle(VAULT, ruling, ids, recipients, amounts, deadline, settlementSignature);
        bytes32 digest = escrow.refundAuthorizationDigest(paymentId, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZER_KEY, digest);
        vm.expectRevert(bytes("ObolusEscrow: funds already allocated"));
        vm.prank(payer);
        escrow.refundFailedPayment(paymentId, deadline, abi.encodePacked(r, s, v));
    }

    function testBeneficiaryCanClaimAuthorizedUSDC() public {
        _fund(100);
        bytes32 ruling = bytes32(uint256(9));
        uint256 deadline = block.timestamp + 60;
        (bytes32[] memory ids, address[] memory recipients, uint256[] memory amounts) = _arrays(bytes32(uint256(1)), beneficiary, 100);
        bytes memory settlementSignature = _authorization(ruling, ids, recipients, amounts, deadline);
        vm.prank(relayer);
        escrow.settle(VAULT, ruling, ids, recipients, amounts, deadline, settlementSignature);
        vm.prank(beneficiary);
        escrow.claim(VAULT);
        require(usdc.balanceOf(beneficiary) == 100, "beneficiary not paid");
        require(escrow.getClaimable(VAULT, beneficiary) == 0, "claimable not cleared");
    }
}
