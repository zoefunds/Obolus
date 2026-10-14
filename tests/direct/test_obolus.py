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

CONTRACT = Path(__file__).parent.parent.parent / "contracts" / "obolus.py"

GEN = 10**18
NOW = int(time.time())
HOUR = 3600
DAY = 86400


def hx(addr) -> str:
    if isinstance(addr, bytes):
        return "0x" + addr.hex()
    return addr.as_hex


def settled_amount(c, vault_id, address) -> int:
    """Sum every settlement recorded for `vault_id` payable to `address` —
    the USDC-migration replacement for the old get_balance_of(address)
    check, now that payouts are relayed to Base Sepolia's ObolusEscrow
    instead of held as an internal on-contract balance."""
    target = hx(address).lower()
    return sum(
        s["amount_usdc"]
        for s in c.get_settlements_for_vault(vault_id)
        if s["recipient"].lower() == target
    )


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

def archived(url: str, ts: str = "20240101000000") -> str:
    """Wrap a URL as a Wayback Machine snapshot link — the contract now
    requires every evidence/contest URL to be a committed archive.org
    snapshot, not a live (mutable) page. See _require_committed_url."""
    return f"https://web.archive.org/web/{ts}/{url}"


DEATH_URLS = json.dumps(
    [archived("https://news.example.com/obituary"), archived("https://registry.example.gov/death/123")]
)
CONTEST_URLS = json.dumps([archived("https://social.example.com/live-post-today")])


def fresh(vm, claimant_bond=0, contester_bond=0, relayer=None):
    vm.sender = OWNER
    vm.value = 0
    warp(vm, NOW)
    return deploy_contract(CONTRACT, vm, claimant_bond, contester_bond, hx(relayer) if relayer else "")


_payment_seq = [0]


def pay(vm, c, vault_id, payer, amount, relayer=OWNER) -> str:
    """Simulate the backend relayer attesting a confirmed Base Sepolia
    deposit: in production this only ever follows reading a real
    Deposited event off-chain (see backend/src/baseSepolia.js's
    readConfirmedDeposit); here it's the direct-mode stand-in for that
    same trust boundary. Returns the payment_id to spend via
    fund_vault/submit_death_claim/contest_claim."""
    _payment_seq[0] += 1
    payment_id = f"pay-{_payment_seq[0]}"
    vm.sender = relayer
    vm.value = 0
    c.record_payment(payment_id, vault_id, hx(payer), amount)
    return payment_id


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
    vm.value = 0
    warp(vm, now_ts)
    vid = c.create_vault(
        hx(beneficiary),
        name,
        json.dumps(akas or ["Janey Public"]),
        birth_year,
        window,
    )
    if deposit > 0:
        payment_id = pay(vm, c, vid, grantor, deposit)
        vm.sender = grantor
        vm.value = 0
        c.fund_vault(vid, payment_id)
    return vid


def verdict(determination, confidence, reasoning="because evidence", summary="source excerpt",
            identity_match="CONFIRMED", provenance="STRONG"):
    return json.dumps(
        {
            "determination": determination,
            "confidence": confidence,
            "reasoning": reasoning,
            "evidence_summary": summary,
            "identity_match": identity_match,
            "provenance": provenance,
            "decisive_sources": [archived("https://registry.example.gov/death/123")],
        }
    )


def mock_sources(vm, body="Official obituary: Jane Q. Public passed away."):
    vm.mock_web(r".*", {"status": 200, "body": body})


def open_claim(vm, c, vault_id, claimant=CLAIMANT, bond=0, now_ts=NOW, image_url="") -> int:
    vm.sender = claimant
    vm.value = 0
    warp(vm, now_ts)
    payment_id = pay(vm, c, vault_id, claimant, bond) if bond > 0 else ""
    vm.sender = claimant
    vm.value = 0
    return c.submit_death_claim(vault_id, DEATH_URLS, image_url, "I am the executor", payment_id)


def contest(vm, c, claim_id, vault_id=None, sender=CONTESTER, bond=0, urls=None, image_url="") -> None:
    payment_id = ""
    if bond > 0:
        assert vault_id is not None, "contest() needs vault_id to mint a payment when bond > 0"
        payment_id = pay(vm, c, vault_id, sender, bond)
    vm.sender = sender
    vm.value = 0
    c.contest_claim(claim_id, urls if urls is not None else CONTEST_URLS, image_url, payment_id)


# ---------------------------------------------------------------------------
# Deployment & config
# ---------------------------------------------------------------------------

def test_deploy_and_config(vm):
    c = fresh(vm, claimant_bond=GEN // 100, contester_bond=GEN // 200)
    cfg = c.get_config()
    assert cfg["owner"].lower() == hx(OWNER).lower()
    assert cfg["paused"] is False
    assert cfg["min_claimant_bond_usdc"] == GEN // 100
    assert cfg["min_contester_bond_usdc"] == GEN // 200


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
    assert vault["balance_usdc"] == 10 * GEN
    assert vault["grantor"].lower() == hx(GRANTOR).lower()
    assert vault["beneficiary"].lower() == hx(BENEFICIARY).lower()
    assert vault["subject_name"] == "Jane Q. Public"
    assert vault["subject_aka"] == ["Janey Public"]


def test_create_vault_starts_at_zero_balance(vm):
    """amount_usdc was removed from create_vault entirely — a vault now
    always starts unfunded and only ever gains balance through
    fund_vault's payment-bound path (see test_fund_vault_* below)."""
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    warp(vm, NOW)
    vid = c.create_vault(hx(BENEFICIARY), "Jane", "[]", 1960, DAY)
    assert c.get_vault(vid)["balance_usdc"] == 0
    assert c.get_vault(vid)["status"] == "ACTIVE"


def test_create_vault_rejects_zero_address_beneficiary(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault("0x" + "00" * 20, "Jane", "[]", 1960, DAY)


def test_create_vault_rejects_self_as_beneficiary(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault(hx(GRANTOR), "Jane", "[]", 1960, DAY)


def test_create_vault_rejects_empty_name(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "   ", "[]", 1960, DAY)


def test_create_vault_rejects_malformed_aka_json(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Jane", "not json", 1960, DAY)


def test_create_vault_rejects_too_many_akas(vm):
    c = fresh(vm)
    vm.sender = GRANTOR
    vm.value = 0
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
    payment_id = pay(vm, c, vid, STRANGER, 2 * GEN)  # anyone may top up
    vm.sender = STRANGER
    vm.value = 0
    c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == 7 * GEN


def test_fund_vault_rejects_unknown_payment_id(vm):
    """An 'unpaid declaration' — no matching Payment row at all — is
    rejected outright, whether the payment_id is simply wrong or was
    never attested by the relayer in the first place."""
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.fund_vault(vid, "never-recorded")


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
    assert c.get_vault(vid)["balance_usdc"] == 0
    assert settled_amount(c, vid, GRANTOR) == 4 * GEN


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
        c.submit_death_claim(vid, "[]", "", "note", "")


def test_submit_death_claim_rejects_malformed_json(vm):
    c = fresh(vm)
    vid = make_vault(vm, c)
    vm.sender = CLAIMANT
    vm.value = 0
    with vm.expect_revert():
        c.submit_death_claim(vid, "not json", "", "note", "")


def test_submit_death_claim_below_minimum_bond_rejected(vm):
    c = fresh(vm, claimant_bond=GEN // 10)
    vid = make_vault(vm, c)
    payment_id = pay(vm, c, vid, CLAIMANT, GEN // 100)  # below minimum, but a real payment
    vm.sender = CLAIMANT
    vm.value = 0
    with vm.expect_revert():
        c.submit_death_claim(vid, DEATH_URLS, "", "note", payment_id)


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
        c.submit_death_claim(999, DEATH_URLS, "", "note", "")


# ---------------------------------------------------------------------------
# Contests
# ---------------------------------------------------------------------------

def test_contest_claim_within_window(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    warp(vm, NOW + HOUR)
    contest(vm, c, cid)
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
    warp(vm, NOW + 2 * HOUR)
    with vm.expect_revert():
        contest(vm, c, cid)


def test_contest_claim_below_minimum_bond_rejected(vm):
    c = fresh(vm, contester_bond=GEN // 10)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    warp(vm, NOW + HOUR)
    with vm.expect_revert():
        contest(vm, c, cid, vid, bond=GEN // 100)  # below minimum


def test_second_contest_appends_without_erasing_first(vm):
    """Regression test for the append-only fix: a second contest must never
    silently replace or erase the first contester's evidence and bond —
    both are retained as separate rows, both bonds stay staked (not
    refunded) until resolution."""
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    first_urls = json.dumps([archived("https://social.example.com/first-contester-proof")])
    warp(vm, NOW + HOUR)
    contest(vm, c, cid, vid, sender=CONTESTER, bond=GEN // 100, urls=first_urls)

    second_contester = create_address("second_contester")
    second_urls = json.dumps([archived("https://social.example.com/second-contester-proof")])
    warp(vm, NOW + 2 * HOUR)
    contest(vm, c, cid, vid, sender=second_contester, bond=GEN // 100, urls=second_urls)

    # neither bond is refunded early — both remain staked pending resolution
    assert settled_amount(c, vid, CONTESTER) == 0
    assert settled_amount(c, vid, second_contester) == 0

    claim = c.get_claim(cid)
    assert claim["contest_count"] == 2
    assert claim["total_contester_bond_usdc"] == GEN // 50

    contests = c.get_contests_for_claim(cid)
    assert len(contests) == 2
    assert contests[0]["contester"].lower() == hx(CONTESTER).lower()
    assert contests[0]["urls"] == [archived("https://social.example.com/first-contester-proof")]
    assert contests[1]["contester"].lower() == hx(second_contester).lower()
    assert contests[1]["urls"] == [archived("https://social.example.com/second-contester-proof")]


def test_contest_limit_per_claim_enforced(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    import _contract_obolus as mod

    for i in range(mod.MAX_CONTESTS_PER_CLAIM):
        warp(vm, NOW + HOUR)
        contest(vm, c, cid, vid, sender=create_address(f"contester_{i}"))

    warp(vm, NOW + HOUR)
    with vm.expect_revert():
        contest(vm, c, cid, vid, sender=create_address("one_too_many"))


def test_resolve_confirmed_forfeits_every_contesters_bond(vm):
    """Multiple append-only contests must each be routed individually on
    resolution — none pooled, none dropped."""
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY, deposit=3 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    second_contester = create_address("second_contester")
    warp(vm, NOW + HOUR)
    contest(vm, c, cid, vid, sender=CONTESTER, bond=GEN // 100)
    warp(vm, NOW + 2 * HOUR)
    contest(vm, c, cid, vid, sender=second_contester, bond=GEN // 100)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)

    # both overruled contesters' bonds flow to the beneficiary, not stranded
    assert settled_amount(c, vid, BENEFICIARY) == 3 * GEN + GEN // 50
    assert settled_amount(c, vid, CONTESTER) == 0
    assert settled_amount(c, vid, second_contester) == 0


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
    assert vault["balance_usdc"] == 0
    assert vault["active_claim_id"] == 0
    assert settled_amount(c, vid, BENEFICIARY) == 6 * GEN
    assert settled_amount(c, vid, CLAIMANT) == GEN // 100
    stats = c.get_platform_stats()
    assert stats["total_claims_confirmed"] == 1
    assert stats["total_escrowed_usdc"] == 0


def test_resolve_confirmed_forfeits_overruled_contester_bond_to_beneficiary(vm):
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY, deposit=3 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    warp(vm, NOW + HOUR)
    contest(vm, c, cid, vid, sender=CONTESTER, bond=GEN // 100)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)

    # contester was overruled: bond flows to the beneficiary along with the
    # vault balance, never stranded
    assert settled_amount(c, vid, BENEFICIARY) == 3 * GEN + GEN // 100
    assert settled_amount(c, vid, CONTESTER) == 0


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
    assert vault["balance_usdc"] == 5 * GEN + GEN // 100  # slashed bond stays in escrow
    assert vault["active_claim_id"] == 0
    assert settled_amount(c, vid, CLAIMANT) == 0  # bond forfeited, not returned
    assert c.get_platform_stats()["total_claims_refuted"] == 1


def test_resolve_refuted_returns_contester_bond(vm):
    c = fresh(vm, contester_bond=GEN // 100)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    warp(vm, NOW + HOUR)
    contest(vm, c, cid, vid, sender=CONTESTER, bond=GEN // 100)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("ALIVE_OR_REFUTED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)
    assert settled_amount(c, vid, CONTESTER) == GEN // 100  # vindicated, refunded


def test_resolve_inconclusive_returns_both_bonds_and_reopens_vault(vm):
    c = fresh(vm, claimant_bond=GEN // 100, contester_bond=GEN // 50)
    vid = make_vault(vm, c, window=DAY, deposit=2 * GEN)
    cid = open_claim(vm, c, vid, bond=GEN // 100, now_ts=NOW)
    warp(vm, NOW + HOUR)
    contest(vm, c, cid, vid, sender=CONTESTER, bond=GEN // 50)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + DAY)
    result = c.resolve_claim(cid)

    assert result["status"] == "INCONCLUSIVE"
    vault = c.get_vault(vid)
    assert vault["status"] == "ACTIVE"
    assert vault["balance_usdc"] == 2 * GEN  # untouched
    assert settled_amount(c, vid, CLAIMANT) == GEN // 100  # bond returned, no fault
    assert settled_amount(c, vid, CONTESTER) == GEN // 50  # bond returned, no fault
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
    assert c.get_vault(vid)["balance_usdc"] == GEN  # untouched


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
    # settlement was recorded exactly once
    assert settled_amount(c, vid, BENEFICIARY) == 3 * GEN


def test_settlements_are_pending_until_marked_relayed(vm):
    """Settlements start unrelayed (the backend relayer's sweep target) and
    move out of get_pending_settlements once mark_settlements_relayed is
    called — the bookkeeping flag the relayer flips after successfully
    pushing them to ObolusEscrow.settle() on Base Sepolia."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=2 * GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)

    pending = c.get_pending_settlements(vid)
    assert len(pending) == 1  # beneficiary payout (claimant posted no bond here)
    ids = [s["id"] for s in pending]

    vm.sender = OWNER
    c.mark_settlements_relayed(json.dumps(ids), "0x" + "ab" * 32)
    assert c.get_pending_settlements(vid) == []
    relayed = c.get_settlements_for_vault(vid)
    assert all(s["relayed"] for s in relayed)


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
    assert c.get_vault(vid)["balance_usdc"] == GEN  # untouched


def test_submitted_but_unfetched_decisive_source_cannot_confirm_death(vm):
    """A malicious/incorrect model cannot promote an unavailable submitted
    URL into decision-critical provenance merely by echoing its URL."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    vm.strict_mocks = False  # every web fetch fails
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"
    assert c.get_vault(vid)["balance_usdc"] == GEN


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

    module = sys.modules["_contract_obolus"]
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


def test_pause_blocks_new_vaults_but_not_resolution(vm):
    """Funds already at stake must remain resolvable even while paused, so
    pausing can never be used to trap value."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)

    vm.sender = OWNER
    vm.value = 0
    c.pause()

    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.create_vault(hx(BENEFICIARY), "Someone Else", "[]", 1970, DAY)

    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)  # still works while paused
    assert result["status"] == "CONFIRMED"
    assert settled_amount(c, vid, BENEFICIARY) == GEN


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
    assert c.get_platform_stats()["total_escrowed_usdc"] == 3 * GEN
    vm.sender = GRANTOR
    vm.value = 0
    c.cancel_vault(vid)
    assert c.get_platform_stats()["total_escrowed_usdc"] == 0


# ---------------------------------------------------------------------------
# Payment binding — every principal/bond record must trace to a unique,
# confirmed, correctly-addressed payment. Exercises record_payment /
# _consume_payment directly, exactly as a caller going around the website
# and hitting this contract straight would, since there is no other code
# path for any of these writes.
# ---------------------------------------------------------------------------

def test_record_payment_only_relayer(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    vm.sender = STRANGER  # not the relayer (defaults to OWNER)
    vm.value = 0
    with vm.expect_revert():
        c.record_payment("pay-x", vid, hx(GRANTOR), GEN)


def test_record_payment_rejects_duplicate_payment_id(vm):
    """A duplicate payment record — whether a genuine double-submission or
    a retried relayer call after a prior success — must never be recorded
    twice, since that would let the same on-chain deposit back two
    separate ledger entries."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    vm.sender = OWNER
    vm.value = 0
    c.record_payment("dup-1", vid, hx(GRANTOR), GEN)
    with vm.expect_revert():
        c.record_payment("dup-1", vid, hx(GRANTOR), GEN)


def test_record_payment_rejects_zero_amount(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    vm.sender = OWNER
    vm.value = 0
    with vm.expect_revert():
        c.record_payment("pay-zero", vid, hx(GRANTOR), 0)


def test_fund_vault_unpaid_declaration_rejected(vm):
    """No Payment row was ever recorded for this payment_id at all — the
    core "unpaid declaration" case: a caller (including one calling this
    contract directly, bypassing the website entirely) cannot conjure a
    principal out of thin air."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    vm.sender = GRANTOR
    vm.value = 0
    with vm.expect_revert():
        c.fund_vault(vid, "no-such-payment")


def test_fund_vault_cannot_reuse_payment_across_two_vaults(vm):
    """Proves a payment_id is bound to the ONE vault it was recorded for —
    the same confirmed deposit cannot fund a second, unrelated vault."""
    c = fresh(vm)
    vid_a = make_vault(vm, c, deposit=0)
    vid_b = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid_a, GRANTOR, GEN)

    vm.sender = GRANTOR
    vm.value = 0
    c.fund_vault(vid_a, payment_id)
    assert c.get_vault(vid_a)["balance_usdc"] == GEN

    with vm.expect_revert():
        c.fund_vault(vid_b, payment_id)
    assert c.get_vault(vid_b)["balance_usdc"] == 0


def test_fund_vault_cannot_spend_another_participants_deposit(vm):
    """A payment recorded for GRANTOR's deposit can never be spent by
    STRANGER, even though STRANGER can see/guess the payment_id and the
    correct vault — proving a caller cannot spend another participant's
    deposit."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid, GRANTOR, GEN)

    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == 0

    # The rightful payer can still spend it themself.
    vm.sender = GRANTOR
    vm.value = 0
    c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == GEN


def test_fund_vault_cannot_double_spend_same_payment(vm):
    """Proves a retry cannot allocate twice: once a payment_id is
    consumed, a second attempt to spend it — whether a genuine reuse
    attempt or a naive retry after a transient error — is rejected, and
    the vault balance reflects the deposit exactly once."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid, GRANTOR, GEN)

    vm.sender = GRANTOR
    vm.value = 0
    c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == GEN

    with vm.expect_revert():
        c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == GEN  # unchanged — no double allocation


def test_submit_death_claim_cannot_reuse_vault_funding_payment_as_bond(vm):
    """A payment already consumed to fund the vault's principal cannot
    also be replayed as a claimant's bond — the same confirmed deposit
    can never back two different ledger entries."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=GEN)  # consumes payment_id internally
    claim_payment_id = pay(vm, c, vid, CLAIMANT, GEN // 10)
    # Sanity: a *fresh* payment works fine as a bond.
    vm.sender = CLAIMANT
    vm.value = 0
    cid = c.submit_death_claim(vid, DEATH_URLS, "", "note", claim_payment_id)
    assert c.get_claim(cid)["claimant_bond_usdc"] == GEN // 10

    # But trying to reuse it again (e.g. for a contest) fails outright.
    vm.sender = CONTESTER
    vm.value = 0
    with vm.expect_revert():
        c.contest_claim(cid, CONTEST_URLS, "", claim_payment_id)


def test_contest_claim_cannot_spend_another_participants_deposit(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    payment_id = pay(vm, c, vid, CONTESTER, GEN // 10)

    vm.sender = STRANGER  # not CONTESTER
    vm.value = 0
    with vm.expect_revert():
        c.contest_claim(cid, CONTEST_URLS, "", payment_id)


def test_set_relayer_only_owner(vm):
    c = fresh(vm)
    vm.sender = STRANGER
    vm.value = 0
    with vm.expect_revert():
        c.set_relayer(hx(STRANGER))


def test_set_relayer_rotates_who_may_record_payments(vm):
    c = fresh(vm)
    new_relayer = create_address("new_relayer")
    vm.sender = OWNER
    vm.value = 0
    c.set_relayer(hx(new_relayer))
    assert c.get_config()["relayer"].lower() == hx(new_relayer).lower()

    vid = make_vault(vm, c, deposit=0)
    # OWNER is no longer the relayer — can't attest payments anymore.
    vm.sender = OWNER
    vm.value = 0
    with vm.expect_revert():
        c.record_payment("pay-y", vid, hx(GRANTOR), GEN)
    # The new relayer can.
    payment_id = pay(vm, c, vid, GRANTOR, GEN, relayer=new_relayer)
    vm.sender = GRANTOR
    vm.value = 0
    c.fund_vault(vid, payment_id)
    assert c.get_vault(vid)["balance_usdc"] == GEN


def test_get_payment_reflects_consumption(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid, GRANTOR, GEN)
    assert c.get_payment(payment_id)["consumed"] is False
    vm.sender = GRANTOR
    vm.value = 0
    c.fund_vault(vid, payment_id)
    assert c.get_payment(payment_id)["consumed"] is True


def test_refund_void_is_relayer_only_and_permanently_blocks_consumption(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid, GRANTOR, GEN)
    vm.sender = STRANGER
    with vm.expect_revert():
        c.void_payment_for_refund(payment_id)
    vm.sender = OWNER
    c.void_payment_for_refund(payment_id)
    assert c.get_payment(payment_id)["refunded"] is True
    vm.sender = GRANTOR
    with vm.expect_revert():
        c.fund_vault(vid, payment_id)


def test_consumed_payment_cannot_be_voided_for_refund(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = pay(vm, c, vid, GRANTOR, GEN)
    vm.sender = GRANTOR
    c.fund_vault(vid, payment_id)
    vm.sender = OWNER
    with vm.expect_revert():
        c.void_payment_for_refund(payment_id)


def test_refund_tombstone_before_attestation_blocks_late_record_payment(vm):
    """A refund cannot race an ACCEPTED-but-not-final record_payment.
    The finalized tombstone exists without a Payment row and makes every
    later attestation for the refunded Base payment id fail."""
    c = fresh(vm)
    vid = make_vault(vm, c, deposit=0)
    payment_id = "pending-attestation-refund"
    vm.sender = OWNER
    c.void_payment_for_refund(payment_id)
    assert c.is_payment_voided(payment_id) is True
    with vm.expect_revert():
        c.record_payment(payment_id, vid, hx(GRANTOR), GEN)


def test_refund_tombstone_is_relayer_only_even_without_payment_row(vm):
    c = fresh(vm)
    vm.sender = STRANGER
    with vm.expect_revert():
        c.void_payment_for_refund("missing-payment")
    assert c.is_payment_voided("missing-payment") is False


# ---------------------------------------------------------------------------
# Relay-layer scenario: Base settlement succeeds, then the follow-up
# GenLayer marking call fails and is retried. This is the GenLayer-side
# half of that guarantee — mark_settlements_relayed is idempotent
# bookkeeping (see its docstring) and get_pending_settlements never
# re-offers an already-relayed row, so a retried relayer sweep can never
# re-push the same settlement twice from GenLayer's own state. The Base
# Sepolia half (ObolusEscrow.settledIds rejecting a replayed
# individual settlement id) is covered by backend/test/baseSepolia.test.js.
# ---------------------------------------------------------------------------

def test_mark_settlements_relayed_is_idempotent_after_partial_failure(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid, now_ts=NOW)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    vm.value = 0
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)

    pending_before = c.get_pending_settlements(vid)
    assert len(pending_before) > 0
    ids = [s["id"] for s in pending_before]

    # Simulates: Base settle() succeeded, but the relayer's follow-up
    # mark_settlements_relayed call crashed before this ran. A retried
    # sweep calls get_pending_settlements again — still returns the same
    # rows — then this succeeds on retry.
    vm.sender = OWNER
    c.mark_settlements_relayed(json.dumps(ids), "0x" + "cd" * 32)
    assert c.get_pending_settlements(vid) == []

    # A second retry of the same mark call (e.g. a naive at-least-once
    # relayer) is a harmless no-op, not a second credit of anything —
    # there is nothing left pending to re-mark, and total_paid_out_usdc
    # (driven only by resolve_claim's _record_settlement, never by
    # marking) is unchanged.
    total_before = c.get_platform_stats()["total_paid_out_usdc"]
    c.mark_settlements_relayed(json.dumps(ids), "0x" + "cd" * 32)
    assert c.get_platform_stats()["total_paid_out_usdc"] == total_before


def test_false_settlement_acknowledgment_is_rejected(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)
    ids = [s["id"] for s in c.get_pending_settlements(vid)]
    vm.sender = STRANGER
    with vm.expect_revert():
        c.mark_settlements_relayed(json.dumps(ids), "0x" + "ef" * 32)
    assert len(c.get_pending_settlements(vid)) == len(ids)


def test_full_settlement_index_survives_a_forged_relayer_acknowledgment(vm):
    """The Base reconciler consumes the complete index, so even a configured
    relayer writing a fabricated hash cannot make an entitlement undiscoverable."""
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH"))
    vm.sender = STRANGER
    warp(vm, NOW + HOUR)
    c.resolve_claim(cid)
    original = c.get_settlements_page(vid, 0, 100)
    ids = [s["id"] for s in original]
    vm.sender = OWNER
    c.mark_settlements_relayed(json.dumps(ids), "0x" + "ef" * 32)
    assert c.get_pending_settlements_page(vid, 0, 100) == []
    assert c.get_settlements_page(vid, 0, 100) == [
        {**row, "relayed": True, "base_tx_hash": "0x" + "ef" * 32}
        for row in original
    ]


def test_high_death_verdict_without_identity_and_provenance_cannot_release(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid)
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("DECEASED", "HIGH", identity_match="UNCERTAIN", provenance="WEAK"))
    vm.sender = STRANGER
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"
    assert c.get_vault(vid)["balance_usdc"] == GEN


def test_conflicting_death_and_proof_of_life_evidence_is_inconclusive(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    cid = open_claim(vm, c, vid)
    contest(vm, c, cid, vid, urls=json.dumps([archived("https://registry.example.gov/alive/123")]))
    mock_sources(vm, body="Conflicting official death notice and later proof-of-life record")
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW", identity_match="UNCERTAIN", provenance="WEAK"))
    vm.sender = STRANGER
    warp(vm, NOW + HOUR)
    result = c.resolve_claim(cid)
    assert result["status"] == "INCONCLUSIVE"
    assert c.get_vault(vid)["status"] == "ACTIVE"
    assert c.get_vault(vid)["balance_usdc"] == GEN


def test_all_twenty_contests_are_accepted_considered_and_refunded(vm):
    c = fresh(vm)
    vid = make_vault(vm, c, window=DAY, deposit=GEN)
    cid = open_claim(vm, c, vid)
    for idx in range(20):
        warp(vm, NOW + idx + 1)
        url = json.dumps([archived(f"https://proof.example/{idx}")])
        contest(vm, c, cid, vid, urls=url)
    assert len(c.get_contests_for_claim(cid)) == 20
    contests = c._get_contests_for_claim(cid)
    aggregated, _image = c._aggregate_contest_evidence(contests)
    assert len(aggregated) == 20
    assert set(aggregated) == {
        archived(f"https://proof.example/{idx}") for idx in range(20)
    }
    with vm.expect_revert():
        contest(vm, c, cid, vid, urls=json.dumps([archived("https://proof.example/overflow")]))
    mock_sources(vm)
    vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW", identity_match="UNCERTAIN", provenance="WEAK"))
    vm.sender = STRANGER
    warp(vm, NOW + DAY)
    c.resolve_claim(cid)
    # Zero-bond contests create no payment rows, but every one was retained
    # through resolution and none can be silently omitted from storage.
    assert c.get_claim(cid)["contest_count"] == 20


def test_second_challenger_image_is_rejected_before_bond_consumption(vm):
    """GenVM has one challenger-image slot. A later attachment must be
    rejected explicitly, not accepted and silently omitted, and rejection
    must happen before consuming its real Base-backed bond payment."""
    c = fresh(vm, contester_bond=1)
    vid = make_vault(vm, c, window=DAY, deposit=GEN)
    cid = open_claim(vm, c, vid)
    first_image = archived("https://proof.example/first-image")
    contest(vm, c, cid, vid, bond=1, image_url=first_image)

    second_payment = pay(vm, c, vid, STRANGER, 1)
    vm.sender = STRANGER
    with vm.expect_revert():
        c.contest_claim(
            cid,
            json.dumps([archived("https://proof.example/later")]),
            archived("https://proof.example/later-image"),
            second_payment,
        )
    assert c.get_payment(second_payment)["consumed"] is False
    assert c.get_claim(cid)["contest_count"] == 1


def test_settlement_index_remains_complete_beyond_sixty_four_rows(vm):
    c = fresh(vm, claimant_bond=1, contester_bond=1)
    vid = make_vault(vm, c, window=HOUR, deposit=GEN)
    for round_idx in range(4):
        start = NOW + round_idx * (HOUR + 10)
        cid = open_claim(vm, c, vid, bond=1, now_ts=start)
        for idx in range(20):
            warp(vm, start + idx + 1)
            contest(vm, c, cid, vid, bond=1, urls=json.dumps([archived(f"https://proof.example/{round_idx}/{idx}")]))
        mock_sources(vm)
        vm.mock_llm(r".*", verdict("INSUFFICIENT", "LOW", identity_match="UNCERTAIN", provenance="WEAK"))
        vm.sender = STRANGER
        warp(vm, start + HOUR)
        c.resolve_claim(cid)
    rows = c.get_settlements_for_vault(vid)
    assert len(rows) == 84
    assert len(c.get_settlements_page(vid, 60, 100)) == 24
    assert len(c.get_pending_settlements_page(vid, 64, 100)) == 20
