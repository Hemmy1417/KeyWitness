"""Copies of the same bytes, seen together, on the record as well as in the findings.

The findings count a copy whose twin was seen, and a validator does not
dissent over it. The record's list of unexamined images has to say the same:
the right to ask again, and the rules that decide whether a readjudication
round counts and where the bond goes, all read that list."""

import json

import pytest

from conftest import CLAIMANT, GEN, RESPONDENT, STRANGER, Refused, S, crit, jpeg, judge, look

BOND = GEN // 10


def one_look_in(n_seen=1):
    """A leading validator that sees the images of its first `n_seen` looks and none after."""
    calls = {"n": 0}

    def answer(prompt, images):
        calls["n"] += 1
        seen = calls["n"] <= n_seen
        return {"images": [{"n": i, "seen": seen, "shows": "a dry ceiling" if seen else "", "text": [],
                            "dates": [], "subject_doubts": "", "quality": "GOOD"}
                           for i in range(1, len(images) + 1)]}
    return answer


def _copies(h, supported=True):
    cid = h.opened()
    x = h.photo(cid, tag="same-bytes")
    y = h.photo(cid, by=RESPONDENT, tag="same-bytes")
    d = h.doc(cid, by=CLAIMANT, doc_type="CONTRACTOR_STATEMENT", text="Statement: all listed tasks were done.")
    h.ready_all(cid)
    h.clear_answers()
    rows = ([crit("C1", "SUPPORTED", [x, y, d]), crit("C2", "SUPPORTED", [x, y, d])] if supported
            else [crit("C1", "INSUFFICIENT", [], adequate=False), crit("C2", "INSUFFICIENT", [], adequate=False)])
    return cid, x, y, d, rows


def test_a_copy_whose_twin_was_seen_is_not_listed_as_unexamined(h):
    cid, x, y, d, rows = _copies(h)
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=look(), validator_judge=judge(*rows))
    dec = h.view("get_decision", h.call("request_assessment", cid)["decision_id"])
    assert dec["seen_ids"] == [x], "the leader's own list is kept as it gave it"
    assert dec["unseen_ids"] == [], "the same bytes were examined"
    assert y in dec["criteria"][0]["basis"], "and the findings counted the copy"


def test_the_model_is_told_a_copy_that_did_not_open_shows_what_its_twin_shows(h):
    cid, x, y, d, rows = _copies(h)
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=look(), validator_judge=judge(*rows))
    h.call("request_assessment", cid)
    prompt = [q for q in h.prompts if q["role"] == "leader" and q["kind"] == "judge"][-1]["prompt"]
    line = next(part for part in prompt.split("\n- ") if part.startswith(y + ":"))
    assert f"the same bytes as {x}, so it shows the same" in line and "a dry ceiling" in line
    assert "do not cite it" not in line


def test_an_image_with_no_seen_copy_is_still_not_to_be_cited(h):
    cid = h.opened()
    x = h.photo(cid, tag="claimant-bytes")
    y = h.photo(cid, by=RESPONDENT, tag="respondent-bytes")
    d = h.doc(cid, by=CLAIMANT, doc_type="CONTRACTOR_STATEMENT", text="Statement: all listed tasks were done.")
    h.ready_all(cid)
    h.clear_answers()
    rows = [crit("C1", "SUPPORTED", [x, d]), crit("C2", "SUPPORTED", [x, d])]
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=one_look_in(),
              validator_judge=judge(*rows))
    h.call("request_assessment", cid)
    prompt = [q for q in h.prompts if q["role"] == "leader" and q["kind"] == "judge"][-1]["prompt"]
    line = next(part for part in prompt.split("\n- ") if part.startswith(y + ":"))
    assert "could not be examined, so it counts for nothing; do not cite it" in line


def test_no_free_retry_when_every_distinct_image_was_examined(h):
    cid, x, y, d, rows = _copies(h)
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=look(), validator_judge=judge(*rows))
    h.call("request_assessment", cid)
    h.refused("request_assessment", cid, by=RESPONDENT, match="no image went unexamined")
    assert h.view("get_case", cid)["retried_by"] == []


def test_an_image_with_no_seen_copy_is_still_unexamined(h):
    cid = h.opened()
    x = h.photo(cid, tag="claimant-bytes")
    y = h.photo(cid, by=RESPONDENT, tag="respondent-bytes")
    d = h.doc(cid, by=CLAIMANT, doc_type="CONTRACTOR_STATEMENT", text="Statement: all listed tasks were done.")
    h.ready_all(cid)
    h.clear_answers()
    rows = [crit("C1", "SUPPORTED", [x, d]), crit("C2", "SUPPORTED", [x, d])]
    # Leader and validator both lose the second image, so the round is recorded with it unexamined.
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=one_look_in(),
              validator_judge=judge(*rows))
    dec = h.view("get_decision", h.call("request_assessment", cid)["decision_id"])
    assert dec["unseen_ids"] == [y]


def test_a_failed_challenge_is_not_a_network_fault_because_a_copy_was_left_out(h):
    cid, x, y, d, rows = _copies(h)
    h.answers(look_ans=look(), judge_ans=judge(*rows))
    h.call("request_assessment", cid)
    h.call("challenge", cid, "The statement was written before the work.", by=RESPONDENT, value=BOND)
    h.doc(cid, by=RESPONDENT, text="Second note, 6 October: nothing new to see.", doc_type="OTHER_RECORD")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=one_look_in(), judge_ans=judge(*rows), validator_look=look(), validator_judge=judge(*rows))
    out = h.call("readjudicate", cid, by=STRANGER)
    r = h.view("get_decision", out["decision_id"])
    c = h.view("get_case", cid)
    assert r["unseen_ids"] == [] and r["status"] != "NO_RESULT"
    assert c["challenge"]["network_fault"] is False
    assert c["challenge"]["outcome"], "the round counted and the challenge is decided"
    assert h.credit(CLAIMANT) == BOND and h.credit(RESPONDENT) == 0, "the challenge failed: the bond goes across"
    h.conserved()


def test_a_sound_challenge_is_not_defeated_by_the_other_side_copying_its_new_image(h):
    cid, x, y, d, rows = _copies(h, supported=False)
    h.answers(look_ans=look(), judge_ans=judge(*rows))
    h.call("request_assessment", cid)
    h.call("challenge", cid, "The inspector's page shows the finished work.", by=CLAIMANT, value=BOND)
    n = h.photo(cid, tag="new-page")
    h.later(3700)
    m = h.photo(cid, by=RESPONDENT, tag="new-page")
    h.later(3600)
    good = [crit("C1", "SUPPORTED", [x, n, m, d]), crit("C2", "SUPPORTED", [x, n, m, d])]
    calls = {"n": 0}

    def misses_the_challengers_copy(prompt, images):
        calls["n"] += 1
        first = calls["n"] == 1
        return {"images": [{"n": i, "seen": not (first and i == 2), "shows": "a page", "text": [], "dates": [],
                            "subject_doubts": "", "quality": "GOOD"} for i in range(1, len(images) + 1)]}

    h.clear_answers()
    h.answers(look_ans=misses_the_challengers_copy, judge_ans=judge(*good), validator_look=look(),
              validator_judge=judge(*good))
    out = h.call("readjudicate", cid, by=STRANGER)
    r = h.view("get_decision", out["decision_id"])
    assert n not in r["seen_ids"] and r["unseen_ids"] == []
    assert r["status"] != "NO_RESULT" and r["overall"] == "SUPPORTED"
    assert h.view("get_case", cid)["standing"] == out["decision_id"]
    assert h.credit(CLAIMANT) >= BOND, "the challenge succeeded: the bond comes back"
    h.conserved()


# ---- a finding never turns on who filed a copy -------------------------------------------------------

P, X, Y, Q = "E-0001", "E-0002", "E-0003", "E-0004"
MODEL = ("SUPPORTED", "NOT_ESTABLISHED", "CONFLICTING", "INSUFFICIENT")
MARKS = ("", "s", "a", "sa")


def _settled(h, roles, marks, finding, twins, independent=False):
    ctx = {"roles": roles, "instructions": set(), "reused": set(), "twins": twins}
    row = {"finding": finding, "supports": [x for x in roles if "s" in marks[x]],
           "against": [x for x in roles if "a" in marks[x]], "adequate": True}
    return h.m._settle_criterion(row, {"id": "C1", "needs_independent": independent}, ctx, set(roles))


def _rows():
    for mp in MARKS:
        for mx in MARKS:
            for mq in MARKS:
                for finding in MODEL:
                    yield {P: mp, X: mx, Q: mq}, finding


@pytest.mark.parametrize("owner,copier", [("CLAIMANT", "RESPONDENT"), ("RESPONDENT", "CLAIMANT"),
                                          ("INSPECTOR", "RESPONDENT"), ("INSPECTOR", "CLAIMANT")])
def test_an_unnamed_copy_never_helps_the_party_that_filed_it(h, owner, copier):
    """X is someone's item and Y is a copy of it that the model does not name. With the copy on the case the
    finding must never be better for the copier than without it, whatever the model said about everything else.
    Filing a copy of evidence is free, so anything it bought would be for sale to both sides."""
    better = {"CLAIMANT": lambda f: f == "SUPPORTED", "RESPONDENT": lambda f: f != "SUPPORTED"}[copier]
    for q_role in ("CLAIMANT", "RESPONDENT", "INSPECTOR"):
        without = {P: "CLAIMANT", X: owner, Q: q_role}
        with_copy = dict(without, **{Y: copier})
        for marks, finding in _rows():
            for independent in (False, True):
                a = _settled(h, without, marks, finding, {}, independent)["finding"]
                b = _settled(h, with_copy, dict(marks, **{Y: ""}), finding, {X: [Y], Y: [X]}, independent)["finding"]
                assert not (better(b) and not better(a)), (owner, copier, q_role, marks, finding, independent, a, b)


def test_the_respondent_gains_nothing_by_copying_a_photograph_the_model_weighed_against_the_claim(h):
    roles = {P: "CLAIMANT", X: "CLAIMANT"}
    marks = {P: "s", X: "a"}
    alone = _settled(h, roles, marks, "SUPPORTED", {})
    copied = _settled(h, dict(roles, **{Y: "RESPONDENT"}), dict(marks, **{Y: ""}), "SUPPORTED", {X: [Y], Y: [X]})
    assert alone["finding"] == copied["finding"] == "CONFLICTING", "the claimant's own item already told against it"
    assert alone["floors"] == copied["floors"] == ["F3"]


@pytest.mark.parametrize("first", ["CLAIMANT", "RESPONDENT"])
def test_filing_the_other_sides_report_first_or_second_changes_nothing(h, first):
    """The respondent's adverse report and the claimant's copy of it, in either filing order, with the model naming
    only the claimant's copy against: the report weighs against the claim."""
    second = "RESPONDENT" if first == "CLAIMANT" else "CLAIMANT"
    roles = {P: "CLAIMANT", X: first, Y: second}
    named = X if first == "CLAIMANT" else Y
    marks = {P: "s", X: "", Y: ""}
    marks[named] = "a"
    out = _settled(h, roles, marks, "SUPPORTED", {X: [Y], Y: [X]})
    assert out["finding"] == "CONFLICTING" and sorted(out["contrary"]) == [X, Y]


def test_an_item_named_both_ways_counts_only_against_whoever_filed_it(h):
    for filer in ("CLAIMANT", "RESPONDENT", "INSPECTOR"):
        out = _settled(h, {P: "CLAIMANT", X: filer}, {P: "s", X: "sa"}, "SUPPORTED", {})
        assert out["finding"] == "CONFLICTING" and out["basis"] == [P] and out["contrary"] == [X], filer
    # And for a finding against the claim: it rests on what is against, so the double-named item is what opposes it.
    out = _settled(h, {P: "RESPONDENT", X: "RESPONDENT"}, {P: "a", X: "sa"}, "NOT_ESTABLISHED", {})
    assert out["finding"] == "CONFLICTING" and out["floors"] == ["F3"]


# ---- what travels is what was judged -----------------------------------------------------------------

def _answer(h, cid, x, d, mangle):
    rows = [crit("C1", "SUPPORTED", [x, d]), crit("C2", "SUPPORTED", [x, d])]
    good = judge(*rows)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=mangle(good))
    h.answers(judge_ans=good)
    return h.call("request_assessment", cid)


def _plain(h):
    cid = h.opened()
    x = h.photo(cid, tag="roof")
    d = h.doc(cid, by=RESPONDENT, text="Inspection: the slates were replaced and the loft is dry.")
    h.ready_all(cid)
    return cid, x, d


@pytest.mark.parametrize("field,pad", [("id", " " * 10), ("finding", " " * 24)])
def test_padding_never_cuts_the_word_it_pads(h, field, pad):
    cid, x, d = _plain(h)

    def mangle(good):
        out = dict(good, criteria=[dict(r, **{field: pad + r[field]}) for r in good["criteria"]])
        return out

    out = _answer(h, cid, x, d, mangle)
    assert out["overall"] == "SUPPORTED"
    assert S.calls["judge"]["leader"] == 1, "the padded answer was accepted as it stood, not asked for again"


def test_a_long_id_is_dropped_and_never_cut_into_another_criterions_id(h):
    row = {"id": "C1       draft", "finding": "NOT_ESTABLISHED", "supports": [], "against": [],
           "evidence_adequate": True, "missing": [], "rationale": ""}
    real = {"id": "C1", "finding": "SUPPORTED", "supports": ["E-0001"], "against": [], "evidence_adequate": True,
            "missing": [], "rationale": ""}
    out = h.m._trim({"criteria": [row, real]}, [])
    assert [r["id"] for r in out["criteria"]] == ["", "C1"]
    assert out["criteria"][1]["finding"] == "SUPPORTED"
    assert h.m._trim({"criteria": [dict(real, id="\ud800C1")]}, [])["criteria"][0]["id"] == ""


def test_evidence_ids_travel_once_each_whatever_the_padding_or_repetition(h):
    row = {"id": "C1", "finding": "SUPPORTED", "supports": [" " * 11 + "E-0001"] + ["E-0002"] * 45 + ["E-0003"],
           "against": [], "evidence_adequate": True, "missing": [], "rationale": ""}
    out = h.m._trim({"criteria": [row], "instructions_found": ["E-0002"] * 45 + ["E-0001"]}, [])
    assert out["criteria"][0]["supports"] == ["E-0001", "E-0002", "E-0003"]
    assert out["instructions_found"] == ["E-0002", "E-0001"]


def test_judgments_past_the_cut_are_asked_for_again_not_sent(h):
    cid, x, d = _plain(h)
    stray = [{"id": f"X{i}", "finding": "SUPPORTED", "supports": [], "against": [], "evidence_adequate": True,
              "missing": [], "rationale": ""} for i in range(12)]
    out = _answer(h, cid, x, d, lambda good: dict(good, criteria=stray + good["criteria"]))
    assert out["overall"] == "SUPPORTED", "the second, well-formed answer is the one that travelled"
    assert not any("DISSENT" in p for p in h.prints)


def test_judgments_past_the_cut_twice_fail_the_node_and_record_nothing(h):
    cid, x, d = _plain(h)
    rows = [crit("C1", "SUPPORTED", [x, d]), crit("C2", "SUPPORTED", [x, d])]
    stray = [{"id": f"X{i}", "finding": "SUPPORTED", "supports": [], "against": [], "evidence_adequate": True,
              "missing": [], "rationale": ""} for i in range(12)]
    bad = dict(judge(*rows), criteria=stray + rows)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=bad)
    with pytest.raises(Refused):
        h.call("request_assessment", cid)
    assert h.view("get_case", cid)["decisions"] == []


# ---- a refusal is always text the network can carry --------------------------------------------------

@pytest.mark.parametrize("method", ["submit_text", "submit_image"])
def test_a_refusal_never_repeats_what_cannot_be_encoded(h, method):
    cid = h.opened()
    meta = json.dumps({"doc_type": "OTHER_RECORD", "title": "Note", "criteria": ["\ud800"], "kind": "PHOTO",
                       "file_name": "a.jpg"})
    payload = "A note of at least ten characters." if method == "submit_text" else jpeg("refusal")
    try:
        h.call(method, cid, meta, payload)
        raise AssertionError("it must be refused")
    except Refused as e:
        text = str(e)
    assert "is not a criterion of this case" in text
    text.encode("utf-8")
