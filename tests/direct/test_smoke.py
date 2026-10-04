"""The happy path end to end, and the ledger after every step."""

from conftest import CLAIMANT, GEN, STRANGER, crit, judge, look


def test_config_and_stats(h):
    cfg = h.view("get_config")
    assert cfg["rules"] == "keywitness-rules-1"
    assert "SUPPORTED" in cfg["findings"]
    assert h.view("get_stats")["case"] == "0"


def test_supported_case_pays_the_claimant(h):
    cid = h.opened()
    h.conserved()
    p = h.photo(cid, tag="roof-after")
    d = h.doc(cid, by=CLAIMANT, text="Invoice: replaced 4 slates and resealed the flashing on 2 Oct 2026.",
              doc_type="INVOICE", criteria=["C2"])
    h.ready_all(cid)
    h.answers(look_ans=look(shows="a roof with new slates and fresh flashing"),
              judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p, d])))
    out = h.call("request_assessment", cid, by=CLAIMANT)
    assert out["overall"] == "SUPPORTED", out
    h.refused("finalize", cid, by=STRANGER, match="can still be challenged")
    h.later(3601)
    out = h.call("finalize", cid, by=STRANGER)
    assert out["state"] == "FINAL"
    assert h.credit(CLAIMANT) == 2 * GEN
    h.conserved()
    h.call("withdraw", by=CLAIMANT)
    assert h.transfers[-1] == {"to": CLAIMANT, "wei": 2 * GEN}
    h.conserved()
    r = h.view("get_receipt", cid)
    assert r["core"]["decision"]["overall"] == "SUPPORTED"
    assert len(r["digest"]) == 64
