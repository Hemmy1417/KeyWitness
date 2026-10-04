"""Receipts and digests: what a verifier recomputes outside the contract."""

import hashlib
import json

import pytest

from conftest import CLAIMANT, RESPONDENT, STRANGER, crit, judge, look


def canon(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha(value):
    return hashlib.sha256(canon(value).encode("ascii")).hexdigest()


MUTABLE = ("status", "supersedes", "superseded_by", "challenge_window_ends", "decision_digest")


def _decided(h):
    cid = h.opened()
    p = h.photo(cid, tag="rc-photo")
    d = h.doc(cid, by=RESPONDENT, text="The inspection on 4 October confirms the slates were replaced.")
    h.ready_all(cid)
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
    h.call("request_assessment", cid)
    return cid


def test_no_receipt_before_a_decision(h):
    cid = h.opened()
    with pytest.raises(Exception, match="no decision yet"):
        h.view("get_receipt", cid)


def test_receipt_digest_is_the_canonical_json_of_its_core(h):
    cid = _decided(h)
    r = h.view("get_receipt", cid)
    assert sha(r["core"]) == r["digest"]
    assert r["core"]["schema"] == "keywitness.receipt/1"
    assert r["core"]["terms"]["digest"] == h.digest(cid)
    assert r["core"]["decision"]["overall"] == "SUPPORTED"
    assert r["core"]["parties"]["claimant"] == CLAIMANT


def test_a_tampered_core_no_longer_matches(h):
    cid = _decided(h)
    r = h.view("get_receipt", cid)
    core = json.loads(json.dumps(r["core"]))
    core["decision"]["overall"] = "NOT_ESTABLISHED"
    assert sha(core) != r["digest"]


def test_decision_digest_survives_lifecycle_changes(h):
    cid = _decided(h)
    d = h.view("get_decision", "D-0001")
    assert sha({k: v for k, v in d.items() if k not in MUTABLE}) == d["decision_digest"]
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    d2 = h.view("get_decision", "D-0001")
    assert d2["status"] == "FINAL"
    assert sha({k: v for k, v in d2.items() if k not in MUTABLE}) == d["decision_digest"]


def test_receipt_changes_when_the_case_settles(h):
    cid = _decided(h)
    before = h.view("get_receipt", cid)["digest"]
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    after = h.view("get_receipt", cid)
    assert after["digest"] != before and after["core"]["settlement"]["to_role"] == "CLAIMANT"
    assert after["core"]["case_state"] == "FINAL"


def test_manifest_digest_covers_the_snapshot(h):
    _decided(h)
    d = h.view("get_decision", "D-0001")
    assert sha(d["evidence"]) == d["manifest_digest"]


def test_the_receipt_carries_the_whole_decision_so_its_digest_can_be_recomputed_from_the_file(h):
    """A receipt's own digest changes as the case moves on (a challenge, the settlement). The decision inside
    does not: with every field present, a verifier recomputes the decision digest from the receipt alone and
    checks it against get_decision, however much later."""
    cid = _decided(h)
    early = h.view("get_receipt", cid)
    block = early["core"]["decision"]
    assert block == h.view("get_decision", "D-0001")
    assert sha({k: v for k, v in block.items() if k not in MUTABLE}) == block["decision_digest"]
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    late = h.view("get_receipt", cid)
    assert late["digest"] != early["digest"], "the case moved on"
    assert late["core"]["decision"]["decision_digest"] == block["decision_digest"], "the decision did not"
    still = h.view("get_decision", "D-0001")
    assert sha({k: v for k, v in still.items() if k not in MUTABLE}) == block["decision_digest"]
