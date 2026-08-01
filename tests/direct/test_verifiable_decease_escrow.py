"""Direct (in-memory) unit tests for the VerifiableDeceaseEscrow contract.

Runs the contract natively via gltest.direct — no simulator, no network.
Web and LLM calls are mocked; live consensus behaviour is covered separately
by the StudioNet integration evidence in docs/CONTRACT.md.

Run: pytest tests/direct/ -v
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
from gltest.direct import deploy_contract, create_address

CONTRACT = Path(__file__).parent.parent.parent / "contracts" / "verifiable_decease_escrow.py"

GEN = 10**18
NOW = int(time.time())
HOUR = 3600
DAY = 86400


def hx(addr) -> str:
    if isinstance(addr, bytes):
        return "0x" + addr.hex()
    return addr.as_hex


def warp(vm, ts: int) -> None:
    """Set the VM's chain clock to an exact unix timestamp. The contract
    derives all of its now_ts values from datetime.datetime.now() (patched
    by VMContext.activate() to read vm's warped clock), so controlling
    time here is how these tests drive contest-window boundaries instead
    of the old caller-supplied now_ts argument."""
    vm.warp(datetime.fromtimestamp(ts, tz=timezone.utc).isoformat())


OWNER = create_address("owner")
GRANTOR = create_address("grantor")
BENEFICIARY = create_address("beneficiary")
CLAIMANT = create_address("claimant")
CONTESTER = create_address("contester")
STRANGER = create_address("stranger")

DEATH_URLS = json.dumps(["https://news.example.com/obituary", "https://registry.example.gov/death/123"])
CONTEST_URLS = json.dumps(["https://social.example.com/live-post-today"])


def fresh(vm, claimant_bond=0, contester_bond=0):
    vm.sender = OWNER
    vm.value = 0
    warp(vm, NOW)
    return deploy_contract(CONTRACT, vm, claimant_bond, contester_bond)


def make_vault(
    vm,
    c,
    grantor=GRANTOR,
    beneficiary=BENEFICIARY,
    deposit=10 * GEN,
    window=DAY,
    name="Jane Q. Public",
    akas=None,
    birth_year=1960,
    now_ts=NOW,
) -> int:
    vm.sender = grantor
    vm.value = deposit
    warp(vm, now_ts)
    return c.create_vault(
        hx(beneficiary),
        name,
        json.dumps(akas or ["Janey Public"]),
        birth_year,
        window,
    )


def verdict(determination, confidence, reasoning="because evidence", summary="source excerpt"):
    return json.dumps(
        {
            "determination": determination,
            "confidence": confidence,
            "reasoning": reasoning,
            "evidence_summary": summary,
        }
    )


def mock_sources(vm, body="Official obituary: Jane Q. Public passed away."):
    vm.mock_web(r".*", {"status": 200, "body": body})


def open_claim(vm, c, vault_id, claimant=CLAIMANT, bond=0, now_ts=NOW, image_url="") -> int:
    vm.sender = claimant
    vm.value = bond
    warp(vm, now_ts)
    return c.submit_death_claim(vault_id, DEATH_URLS, image_url, "I am the executor")


# ---------------------------------------------------------------------------
# Deployment & config
# ---------------------------------------------------------------------------

def test_deploy_and_config(vm):
    c = fresh(vm, claimant_bond=GEN // 100, contester_bond=GEN // 200)
    cfg = c.get_config()
    assert cfg["owner"].lower() == hx(OWNER).lower()
    assert cfg["paused"] is False
    assert cfg["min_claimant_bond_wei"] == GEN // 100
    assert cfg["min_contester_bond_wei"] == GEN // 200


def test_only_owner_can_pause(vm):
    c = fresh(vm)
    vm.sender = STRANGER
    with vm.expect_revert():
        c.pause()


def test_owner_can_pause_and_unpause(vm):
    c = fresh(vm)
    vm.sender = OWNER
    c.pause()
    assert c.get_platform_stats()["paused"] is True
    c.unpause()
    assert c.get_platform_stats()["paused"] is False


# ---------------------------------------------------------------------------
# Vault creation — input validation branches
# ---------------------------------------------------------------------------

def test_create_vault_happy_path(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vault = c.get_vault(vid)
    assert vault["status"] == "ACTIVE"
    assert vault["balance_wei"] == 10 * GEN
    assert vault["grantor"].lower() == hx(GRANTOR).lower()
    assert vault["beneficiary"].lower() == hx(BENEFICIARY).lower()
    assert vault["subject_name"] == "Jane Q. Public"
    assert vault["subject_aka"] == ["Janey Public"]


def test_create_vault_requires_positive_deposit(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Jane", "[]", 1960, DAY)


def test_create_vault_rejects_zero_address_beneficiary(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault("0x" + "00" * 20, "Jane", "[]", 1960, DAY)


def test_create_vault_rejects_self_as_beneficiary(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault(hx(GRANTOR), "Jane", "[]", 1960, DAY)


def test_create_vault_rejects_empty_name(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "   ", "[]", 1960, DAY)


def test_create_vault_rejects_malformed_aka_json(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Jane", "not json", 1960, DAY)


def test_create_vault_rejects_too_many_akas(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Jane", json.dumps(["a"] * 7), 1960, DAY)


def test_create_vault_clamps_contest_window(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=10)  # below minimum
    assert c.get_vault(vid)["contest_window_seconds"] == HOUR  # clamped up to MIN
    vid2 = make_vault(vm, c, window=999 * DAY)  # above maximum
    assert c.get_vault(vid2)["contest_window_seconds"] == 180 * DAY  # clamped down to MAX


# ---------------------------------------------------------------------------
# Funding, beneficiary change, cancellation
# ---------------------------------------------------------------------------

def test_fund_vault_adds_to_balance(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=5 * GEN)
    vm.sender = STRANGER  # anyone may top up
    vm.value = 2 * GEN
    c.fund_vault(vid)
    assert c.get_vault(vid)["balance_wei"] == 7 * GEN


def test_fund_vault_rejects_zero_value(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.fund_vault(vid)


def test_set_beneficiary_only_grantor(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.set_beneficiary(vid, hx(STRANGER))


def test_set_beneficiary_updates_and_transfer_does_not_reset_grantor_powers(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = GRANTOR
    vm.value = 0
    c.set_beneficiary(vid, hx(STRANGER))
    assert c.get_vault(vid)["beneficiary"].lower() == hx(STRANGER).lower()
    # Grantor still retains their powers after changing the beneficiary
    # (transferring one privilege never silently resets another).
    c.set_beneficiary(vid, hx(BENEFICIARY))
    assert c.get_vault(vid)["beneficiary"].lower() == hx(BENEFICIARY).lower()


def test_cancel_vault_refunds_grantor(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=4 * GEN)
    vm.sender = GRANTOR
    vm.value = 0
    c.cancel_vault(vid)
    assert c.get_vault(vid)["status"] == "CANCELLED"
    assert c.get_vault(vid)["balance_wei"] == 0
    assert c.get_balance_of(hx(GRANTOR)) == 4 * GEN


def test_cancel_vault_only_grantor(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.cancel_vault(vid)


def test_cancel_vault_blocked_once_claim_pending(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    open_claim(vm, c, vid)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.cancel_vault(vid)


# ---------------------------------------------------------------------------
# Claim submission
# ---------------------------------------------------------------------------

def test_submit_death_claim_moves_vault_to_pending(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    cid = open_claim(vm, c, vid)
    vault = c.get_vault(vid)
    assert vault["status"] == "CLAIM_PENDING"
    assert vault["active_claim_id"] == cid
    claim = c.get_claim(cid)
    assert claim["status"] == "OPEN"
    assert claim["claimant"].lower() == hx(CLAIMANT).lower()


def test_submit_death_claim_requires_evidence_url(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = CLAIMANT
    vm.value = 0
    with vm.expect_revert():
        c.submit_death_claim(vid, "[]", "", "note")


def test_submit_death_claim_rejects_malformed_json(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = CLAIMANT
    vm.value = 0
    with vm.expect_revert():
        c.submit_death_claim(vid, "not json", "", "note")


def test_submit_death_claim_below_minimum_bond_rejected(vm):
    c = fresh(vm, claimant_bond=GEN // 10)
    vid = make_vault(vm, c)
    vm.sender = CLAIMANT
    vm.value = GEN // 100  # below minimum
    with vm.expect_revert():
        c.submit_death_claim(vid, DEATH_URLS, "", "note")


def test_submit_death_claim_blocked_when_vault_not_active(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    open_claim(vm, c, vid)  # vault now CLAIM_PENDING
    with pytest.raises(Exception):
        open_claim(vm, c, vid)  # second claim while one is pending


def test_submit_death_claim_only_against_existing_vault(vm):
    c = fresh(vm)
    vm.sender = CLAIMANT
    vm.value = 0
    with vm.expect_revert():
        c.submit_death_claim(999, DEATH_URLS, "", "note")


# ---------------------------------------------------------------------------
# Contests
# ---------------------------------------------------------------------------

def test_contest_claim_within_window(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")
    claim = c.get_claim(cid)
    assert claim["status"] == "CONTESTED"
    assert claim["contest_count"] == 1
    contests = c.get_contests_for_claim(cid)
    assert len(contests) == 1
    assert contests[0]["contester"].lower() == hx(CONTESTER).lower()


def test_contest_claim_after_window_rejected(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = 0
    warp(vm, NOW + 2 * HOUR)
    with vm.expect_revert():
        c.contest_claim(cid, CONTEST_URLS, "")


def test_contest_claim_below_minimum_bond_rejected(vm):
    c = fresh(vm, contester_bond=GEN // 10)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = GEN // 100
    warp(vm, NOW + HOUR)
    with vm.expect_revert():
        c.contest_claim(cid, CONTEST_URLS, "")


def test_second_contest_appends_without_erasing_first(vm):
    """Regression test for the append-only fix: a second contest must never
    silently replace or erase the first contester's evidence and bond —
    both are retained as separate rows, both bonds stay staked (not
    refunded) until resolution."""
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    first_urls = json.dumps(["https://social.example.com/first-contester-proof"])
    vm.sender = CONTESTER
    vm.value = GEN // 100
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, first_urls, "")

    second_contester = create_address("second_contester")
    second_urls = json.dumps(["https://social.example.com/second-contester-proof"])
    vm.sender = second_contester
    vm.value = GEN // 100
    warp(vm, NOW + 2 * HOUR)
    c.contest_claim(cid, second_urls, "")

    # neither bond is refunded early — both remain staked pending resolution
    assert c.get_balance_of(hx(CONTESTER)) == 0
    assert c.get_balance_of(hx(second_contester)) == 0

    claim = c.get_claim(cid)
    assert claim["contest_count"] == 2
    assert claim["total_contester_bond_wei"] == GEN // 50

    contests = c.get_contests_for_claim(cid)
    assert len(contests) == 2
    assert contests[0]["contester"].lower() == hx(CONTESTER).lower()
    assert contests[0]["urls"] == ["https://social.example.com/first-contester-proof"]
    assert contests[1]["contester"].lower() == hx(second_contester).lower()
    assert contests[1]["urls"] == ["https://social.example.com/second-contester-proof"]


def test_contest_limit_per_claim_enforced(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    import _contract_verifiable_decease_escrow as mod

    for i in range(mod.MAX_CONTESTS_PER_CLAIM):
        vm.sender = create_address(f"contester_{i}")
        vm.value = 0
        warp(vm, NOW + HOUR)
        c.contest_claim(cid, CONTEST_URLS, "")

    vm.sender = create_address("one_too_many")
    vm.value = 0
    with vm.expect_revert():
        c.contest_claim(cid, CONTEST_URLS, "")


def test_resolve_confirmed_forfeits_every_contesters_bond(vm):
    """Multiple append-only contests must each be routed individually on
    resolution — none pooled, none dropped."""
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY, deposit=3 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    second_contester = create_address("second_contester")
    vm.sender = CONTESTER
    vm.value = GEN // 100
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")
    vm.sender = second_contester
    vm.value = GEN // 100
    warp(vm, NOW + 2 * HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)

    # both overruled contesters' bonds flow to the beneficiary, not stranded
    assert c.get_balance_of(hx(BENEFICIARY)) == 3 * GEN + GEN // 50
    assert c.get_balance_of(hx(CONTESTER)) == 0
    assert c.get_balance_of(hx(second_contester)) == 0


# ---------------------------------------------------------------------------
# Resolution gating (deterministic timing) — the cheap gate before the
# expensive nondet round.
# ---------------------------------------------------------------------------

def test_is_resolvable_false_before_window_closes(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    warp(vm, NOW + HOUR)
    assert c.is_resolvable(cid) is False
    warp(vm, NOW + DAY)
    assert c.is_resolvable(cid) is True


def test_resolve_claim_rejected_before_window_closes(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    with vm.expect_revert():
        c.resolve_claim(cid)


def test_resolve_claim_allowed_exactly_at_boundary(vm):
    """Boundary test: now_ts == contest_deadline_ts must be resolvable,
    not one second before and not requiring one second after."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    deadline = c.get_claim(cid)["contest_deadline_ts"]
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, deadline)  # exactly at boundary
    result = c.resolve_claim(cid)
    assert result["status"] == "CONFIRMED"


def test_resolve_claim_one_second_before_boundary_rejected(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    deadline = c.get_claim(cid)["contest_deadline_ts"]
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, deadline - 1)
    with vm.expect_revert():
        c.resolve_claim(cid)


def test_resolve_claim_is_permissionless(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER  # nobody privileged
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "CONFIRMED"


# ---------------------------------------------------------------------------
# Resolution outcomes — CONFIRMED / REFUTED / INCONCLUSIVE, fund routing
# ---------------------------------------------------------------------------

def test_resolve_confirmed_pays_beneficiary_and_refunds_claimant_bond(vm):
    c = fresh(vm, claimant_bond=GEN // 100)
    vid = make_vault(vm, c, window=HOUR, deposit=6 * GEN)
    cid = open_claim(vm, c, vid, bond=GEN // 100, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)

    assert result["status"] == "CONFIRMED"
    vault = c.get_vault(vid)
    assert vault["status"] == "PAYOUT_READY"
    assert vault["balance_wei"] == 0
    assert vault["active_claim_id"] == 0
    assert c.get_balance_of(hx(BENEFICIARY)) == 6 * GEN
    assert c.get_balance_of(hx(CLAIMANT)) == GEN // 100
    stats = c.get_platform_stats()
    assert stats["total_claims_confirmed"] == 1
    assert stats["total_escrowed_wei"] == 0


def test_resolve_confirmed_forfeits_overruled_contester_bond_to_beneficiary(vm):
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY, deposit=3 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = GEN // 100
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)

    # contester was overruled: bond flows to the beneficiary along with the
    # vault balance, never stranded
    assert c.get_balance_of(hx(BENEFICIARY)) == 3 * GEN + GEN // 100
    assert c.get_balance_of(hx(CONTESTER)) == 0


def test_resolve_refuted_slashes_claimant_bond_into_vault_and_reopens(vm):
    c = fresh(vm, claimant_bond=GEN // 100)
    vid = make_vault(vm, c, window=HOUR, deposit=5 * GEN)
    cid = open_claim(vm, c, vid, bond=GEN // 100, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("ALIVE_OR_REFUTED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)

    assert result["status"] == "REFUTED"
    vault = c.get_vault(vid)
    assert vault["status"] == "ACTIVE"  # reopened, never stranded
    assert vault["balance_wei"] == 5 * GEN + GEN // 100  # slashed bond stays in escrow
    assert vault["active_claim_id"] == 0
    assert c.get_balance_of(hx(CLAIMANT)) == 0  # bond forfeited, not returned
    assert c.get_platform_stats()["total_claims_refuted"] == 1


def test_resolve_refuted_returns_contester_bond(vm):
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = GEN // 100
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("ALIVE_OR_REFUTED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)
    assert c.get_balance_of(hx(CONTESTER)) == GEN // 100  # vindicated, refunded


def test_resolve_inconclusive_returns_both_bonds_and_reopens_vault(vm):
    c = fresh(vm, claimant_bond=GEN // 100, contester_bond=GEN // 50)
    vid = make_vault(vm, c, window=DAY, deposit=2 * GEN)
    cid = open_claim(vm, c, vid, bond=GEN // 100, now_ts=NOW)
    vm.sender = CONTESTER
    vm.value = GEN // 50
    warp(vm, NOW + HOUR)
    c.contest_claim(cid, CONTEST_URLS, "")

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    result = c.resolve_claim(cid)

    assert result["status"] == "INCONCLUSIVE"
    vault = c.get_vault(vid)
    assert vault["status"] == "ACTIVE"
    assert vault["balance_wei"] == 2 * GEN  # untouched
    assert c.get_balance_of(hx(CLAIMANT)) == GEN // 100  # bond returned, no fault
    assert c.get_balance_of(hx(CONTESTER)) == GEN // 50  # bond returned, no fault
    assert c.get_platform_stats()["total_claims_inconclusive"] == 1


def test_medium_confidence_never_flips_a_terminal_state(vm):
    """A model trying to exceed what the contract allows: MEDIUM confidence
    DECEASED must NOT be treated as confirmation, however concrete the
    determination looks — the contract enforces the HIGH-only floor
    regardless of what the model claims."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "MEDIUM"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"
    assert c.get_vault(vid)["status"] == "ACTIVE"
    assert c.get_vault(vid)["balance_wei"] == GEN  # untouched


def test_reopened_vault_accepts_a_fresh_claim(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid1 = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid1)

    cid2 = open_claim(vm, c, vid, claimant=create_address("second_claimant"), now_ts=NOW + 2 * HOUR)
    assert cid2 != cid1
    assert c.get_vault(vid)["active_claim_id"] == cid2
    assert c.get_vault(vid)["status"] == "CLAIM_PENDING"


# ---------------------------------------------------------------------------
# Idempotency / replay — a settled claim can never be re-settled, funds
# can never be double-paid.
# ---------------------------------------------------------------------------

def test_resolve_claim_cannot_run_twice(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=3 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)
    with vm.expect_revert():
        c.resolve_claim(cid)
    # balance was credited exactly once
    assert c.get_balance_of(hx(BENEFICIARY)) == 3 * GEN


def test_double_withdraw_rejected(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=2 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)

    vm.sender = BENEFICIARY
    vm.value = 0
    c.withdraw(2 * GEN)
    assert c.get_balance_of(hx(BENEFICIARY)) == 0
    with vm.expect_revert():
        c.withdraw(1)  # nothing left


def test_withdraw_more_than_balance_rejected(vm):
    c = fresh(vm)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.withdraw(GEN)


def test_withdraw_zero_rejected(vm):
    c = fresh(vm)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.withdraw(0)


# ---------------------------------------------------------------------------
# External-read / model-output failure handling
# ---------------------------------------------------------------------------

def test_all_sources_fetch_failed_does_not_confirm_death(vm):
    """An external read failing must never be interpreted as 'the person is
    absent' or as evidence of anything. If every source fails, the model
    (mocked here to behave per the contract's own prompt instructions)
    should land on INSUFFICIENT, not CONFIRMED."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.strict_mocks = False  # no mock_web registered -> fetch fails
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW", reasoning="all sources failed to load"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"
    assert c.get_vault(vid)["balance_wei"] == GEN  # untouched


def test_empty_llm_output_is_handled_without_crashing_state(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", "not json at all, just prose")
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    with vm.expect_revert():
        c.resolve_claim(cid)
    # claim remains resolvable-state (not corrupted) after a hard LLM error
    assert c.get_claim(cid)["status"] in ("OPEN", "CONTESTED")


def test_fenced_json_llm_output_is_parsed(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    fenced = "```json\n" + verdict("DECEASED", "HIGH") + "\n```"
    vm.mock_llm(r".*", fenced)
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "CONFIRMED"


def test_looks_like_image_rejects_non_image_bytes(vm):
    """Regression test for a bug found on live StudioNet: a raw byte fetch
    that lands on a non-image URL (e.g. a broken/expired image link serving
    an HTML error page) must never be treated as a valid image. Passing
    those bytes to exec_prompt previously raised NondetException
    ({'causes': ['INVALID_IMAGE']}) and crashed the whole resolution round
    instead of just dropping that one image and continuing on text
    evidence — see docs/CONTRACT.md, "Honest limits"."""
    c = fresh(vm)
    import sys

    module = sys.modules["_contract_verifiable_decease_escrow"]
    looks_like_image = module._looks_like_image

    assert looks_like_image(b"<html><body>404 Not Found</body></html>") is False
    assert looks_like_image(b"") is False
    assert looks_like_image(b"short") is False
    assert looks_like_image(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20) is True
    assert looks_like_image(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20) is True


def test_unrecognized_determination_defaults_to_insufficient(vm):
    """Model inventing an out-of-vocabulary value must be clamped to the
    safe INSUFFICIENT direction, never treated as a confirming verdict."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", json.dumps({"determination": "MAYBE_ISH", "confidence": "HIGH"}))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"


def test_unrecognized_confidence_defaults_to_low(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", json.dumps({"determination": "DECEASED", "confidence": "super sure"}))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"  # HIGH required, "super sure" -> LOW


# ---------------------------------------------------------------------------
# Access control after ownership-adjacent mutation (transfer of a privilege
# must not silently reset unrelated constraints)
# ---------------------------------------------------------------------------

def test_set_owner_transfers_admin_powers_cleanly(vm):
    c = fresh(vm)
    vm.sender = OWNER
    vm.value = 0
    c.set_owner(hx(STRANGER))
    # old owner has lost admin power
    vm.sender = OWNER
    with vm.expect_revert():
        c.pause()
    # new owner has it, and minimums set earlier are still enforced
    vm.sender = STRANGER
    c.pause()
    assert c.get_platform_stats()["paused"] is True


def test_set_owner_rejects_zero_address(vm):
    c = fresh(vm)
    vm.sender = OWNER
    vm.value = 0
    with vm.expect_revert():
        c.set_owner("0x" + "00" * 20)


def test_pause_blocks_new_vaults_but_not_resolution_or_withdraw(vm):
    """Funds already at stake must remain resolvable/withdrawable even
    while paused, so pausing can never be used to trap value."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    vm.sender = OWNER
    vm.value = 0
    c.pause()

    vm.sender = GRANTOR
    vm.value = GEN
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Someone Else", "[]", 1970, DAY)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)  # still works while paused
    assert result["status"] == "CONFIRMED"

    vm.sender = BENEFICIARY
    vm.value = 0
    c.withdraw(GEN)  # still works while paused
    assert c.get_balance_of(hx(BENEFICIARY)) == 0


# ---------------------------------------------------------------------------
# Views / indexing
# ---------------------------------------------------------------------------

def test_get_vaults_for_grantor_and_beneficiary(vm):
    c = fresh(vm)
    vid1 = make_vault(vm, c, grantor=GRANTOR, beneficiary=BENEFICIARY)
    vid2 = make_vault(vm, c, grantor=GRANTOR, beneficiary=STRANGER)
    assert set(c.get_vaults_for_grantor(hx(GRANTOR))) == {vid1, vid2}
    assert c.get_vaults_for_beneficiary(hx(BENEFICIARY)) == [vid1]
    assert c.get_vaults_for_beneficiary(hx(STRANGER)) == [vid2]


def test_get_claims_for_vault_lists_all_attempts(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid1 = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid1)
    cid2 = open_claim(vm, c, vid, claimant=create_address("second_claimant"), now_ts=NOW + 2 * HOUR)

    claims = c.get_claims_for_vault(vid)
    ids = {claim["id"] for claim in claims}
    assert ids == {cid1, cid2}


def test_get_vault_unknown_id_reverts(vm):
    c = fresh(vm)
    with vm.expect_revert():
        c.get_vault(4242)


def test_platform_stats_track_escrow_totals_across_lifecycle(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=3 * GEN)
    assert c.get_platform_stats()["total_escrowed_wei"] == 3 * GEN
    vm.sender = GRANTOR
    vm.value = 0
    c.cancel_vault(vid)
    assert c.get_platform_stats()["total_escrowed_wei"] == 0
