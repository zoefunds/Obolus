"""Direct tests for the worked consumer example.

Direct mode in this harness models one active contract address per
VMContext, so it cannot faithfully simulate the cross-contract view call
`succession_triggered()` makes into a separately-deployed VDE instance
(deploying two live contracts in one VMContext silently aliases their
storage instead of keeping them isolated — a direct-mode limitation, not a
bug in either contract). That call path is therefore exercised only on a
real network (see docs/CONTRACT.md, "Honest limits"), same as this
project's own cross-contract-adjacent paths. What direct mode CAN and does
verify here is every piece of DigitalLegacyRegistry's own deterministic
logic in isolation.
"""

import time
from pathlib import Path

from gltest.direct import deploy_contract, create_address

EXAMPLE = Path(__file__).parent.parent.parent / "examples" / "estate_planner_example.py"

NOW = int(time.time())

OWNER = create_address("owner")
GRANTOR = create_address("grantor")
SUCCESSOR = create_address("successor")
VDE_PLACEHOLDER = create_address("vde_placeholder")


def hx(addr) -> str:
    return "0x" + addr.hex() if isinstance(addr, bytes) else addr.as_hex


def deploy_registry(vm):
    vm.sender = OWNER
    vm.value = 0
    return deploy_contract(EXAMPLE, vm, hx(VDE_PLACEHOLDER))


def test_register_succession_records_successor_and_vault(vm):
    registry = deploy_registry(vm)
    vm.sender = GRANTOR
    vm.value = 0
    registry.register_succession(hx(SUCCESSOR), 7)
    assert registry.get_successor(hx(GRANTOR)).lower() == hx(SUCCESSOR).lower()


def test_get_successor_empty_for_unregistered_owner(vm):
    registry = deploy_registry(vm)
    assert registry.get_successor(hx(GRANTOR)) == ""


def test_succession_triggered_false_when_never_registered(vm):
    registry = deploy_registry(vm)
    assert registry.succession_triggered(hx(GRANTOR)) is False


def test_re_registration_overwrites_prior_successor(vm):
    registry = deploy_registry(vm)
    vm.sender = GRANTOR
    vm.value = 0
    other_successor = create_address("other_successor")
    registry.register_succession(hx(SUCCESSOR), 1)
    registry.register_succession(hx(other_successor), 2)
    assert registry.get_successor(hx(GRANTOR)).lower() == hx(other_successor).lower()
