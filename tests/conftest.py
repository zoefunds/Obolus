"""Shared pytest fixtures for direct-mode tests.

Harness workaround (documented divergence from vanilla gltest.direct):
loading a contract module registers it as the process-global
``__known_contract__``. Since each test in this suite deploys a fresh
contract instance by re-importing the module, that registration must be
cleared between tests or every deploy after the first raises
"only one contract is allowed".
"""

import sys

import pytest
from gltest.direct import VMContext


@pytest.fixture
def vm():
    """An activated VMContext.

    Harness workaround: ``os.fdopen`` (and the warped-clock patch) is only
    installed for the duration of ``VMContext.activate()`` — a nondet call
    (web fetch, exec_prompt, eq_principle) made outside that context reads a
    real, non-existent OS file descriptor and raises ``OSError: Bad file
    descriptor`` instead of returning the mocked response. Every test in
    this suite therefore runs inside one open ``activate()`` span for its
    whole body, exactly like the reference contract's test suite does.
    """
    v = VMContext()
    with v.activate():
        yield v


@pytest.fixture(autouse=True)
def _reset_known_contract():
    yield
    for name, module in list(sys.modules.items()):
        if not name.startswith("_contract_"):
            continue
        genvm_contracts = getattr(module, "gl", None)
        contracts_module = None
        if genvm_contracts is not None:
            contracts_module = getattr(genvm_contracts, "genvm_contracts", None)
        if contracts_module is not None and hasattr(contracts_module, "__known_contract__"):
            contracts_module.__known_contract__ = None
        del sys.modules[name]

    gvc = sys.modules.get("genlayer.gl.genvm_contracts")
    if gvc is not None:
        gvc.__known_contract__ = None


def warp_to(direct_vm, iso: str) -> None:
    """Advance the VM clock everywhere a contract can read it.
    VerifiableDeceaseEscrow derives all of its now_ts values from
    datetime.datetime.now() (patched by VMContext.activate() to read the
    VM's warped clock) rather than trusting a caller-supplied timestamp,
    so this is how tests control contest-window boundaries.
    """
    direct_vm.warp(iso)
    gl = sys.modules.get("genlayer.gl")
    if gl is None:
        return
    raw = getattr(gl, "message_raw", None)
    if isinstance(raw, dict):
        raw["datetime"] = iso
    nested = getattr(getattr(gl, "message", None), "raw", None)
    if isinstance(nested, dict):
        nested["datetime"] = iso
