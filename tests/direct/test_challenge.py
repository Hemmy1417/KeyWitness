"""Challenges, readjudication, retries, finality and where every atto goes."""

import pytest

from conftest import CLAIMANT, GEN, INSPECTOR, RESPONDENT, STRANGER, crit, judge, look, look_by

BOND = GEN // 10


def _decided(h, c1="SUPPORTED", c2="SUPPORTED", **over):
    cid = h.opened(**over)
    p = h.photo(cid, tag="ch-roof")
    d = h.doc(cid, by=RESPONDENT, text="Inspection on 4 Oct: slates replaced, loft dry.")
    h.ready_all(cid)
    h.clear_answers()
    rows = []
    for c, f in (("C1", c1), ("C2", c2)):
        if f == "INSUFFICIENT":
            rows.append(crit(c, f, [], adequate=False))
        elif f == "NOT_ESTABLISHED":
            rows.append(crit(c, f, [d, p]))
        else:
            rows.append(crit(c, f, [p, d]))
    h.answers(look_ans=look(), judge_ans=judge(*rows))
    h.call("request_assessment", cid)
    return cid, p, d


def _standing(h, cid):
    return h.view("get_decision", h.view("get_case", cid)["standing"])


def _challenge(h, cid, by, value=BOND, reason="The inspection was done before the work finished."):
    return h.call("challenge", cid, reason, by=by, value=value)


def test_only_the_side_the_decision_went_against_challenges(h):
    cid, p, d = _decided(h)  # SUPPORTED: went against the respondent
    out = _challenge(h, cid, by=CLAIMANT)
    assert out["refused"] and "only the respondent" in out["reason"]
    out = _challenge(h, cid, by=STRANGER)
    assert out["refused"]
    out = _challenge(h, cid, by=RESPONDENT)
    assert out["state"] == "UNDER_CHALLENGE"
    h.conserved()


def test_challenge_refusals_credit_the_value_back(h):
    cid, p, d = _decided(h)
    out = _challenge(h, cid, by=RESPONDENT, value=BOND + 1)
    assert out["refused"] and "exactly the bond" in out["reason"]
    assert h.credit(RESPONDENT) == BOND + 1
    out = _challenge(h, cid, by=RESPONDENT, reason="no")
    assert out["refused"] and "at least 10 characters" in out["reason"]
    out = _challenge(h, cid, by=RESPONDENT, reason="The inspection came first. " * 40)
    assert out["refused"] and "the reason may be at most 1000 characters" in out["reason"]
    assert h.credit(RESPONDENT) == 3 * BOND + 1 and h.view("get_case", cid)["challenge"] is None
    h.conserved()


def test_challenge_window_and_one_challenge_only(h):
    cid, p, d = _decided(h, c1="INSUFFICIENT", c2="INSUFFICIENT")  # against the claimant
    _challenge(h, cid, by=CLAIMANT)
    out = _challenge(h, cid, by=CLAIMANT)
    assert out["refused"] and "only a standing decision" in out["reason"]
    late, _, _ = _decided(h, c1="INSUFFICIENT", c2="INSUFFICIENT")
    h.later(3600)
    out = _challenge(h, late, by=CLAIMANT)
    assert out["refused"] and "window has closed" in out["reason"]
    h.conserved()


def test_no_new_evidence_closes_the_challenge_and_pays_the_other_side(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.refused("readjudicate", cid, by=STRANGER, match="may file new evidence until")
    h.refused("close_challenge", cid, by=STRANGER, match="runs until")
    h.later(3600)
    h.refused("readjudicate", cid, by=STRANGER, match="filed no new evidence")
    out = h.call("close_challenge", cid, by=STRANGER)
    assert "no new evidence" in out["outcome"]
    assert h.credit(CLAIMANT) == BOND
    assert _standing(h, cid)["overall"] == "SUPPORTED"
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == BOND + 2 * GEN
    h.conserved()


def test_evidence_from_the_other_side_alone_does_not_carry_a_challenge(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.call("submit_text", cid, '{"doc_type": "INVOICE"}', "Claimant answers the challenge with an invoice.",
           by=CLAIMANT)
    h.later(3600)
    h.refused("readjudicate", cid, by=STRANGER, match="filed no new evidence")


def test_readjudication_that_changes_the_finding_returns_the_bond(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    n = h.doc(cid, by=RESPONDENT, text="Second inspection 6 Oct: the loft is wet again below the repair.",
              criteria=["C1", "C2"])
    h.later(3600)
    h.refused("readjudicate", cid, by=STRANGER, match="the other side may answer the new evidence until")
    h.later(3600)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [n, p]),
                                               crit("C2", "CONFLICTING", [p], [n])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["overall"] == "NOT_ESTABLISHED" and out["changed"] is True and out["reversed"] is True
    j = [x["prompt"] for x in h.prompts if x["kind"] == "judge"][-1]
    assert "READJUDICATION after a challenge by the respondent" in j
    assert f"Items filed during the challenge: {n}" in j
    assert "<<<ARGUMENT" in j
    first = h.view("get_decision", "D-0001")
    assert first["status"] == "SUPERSEDED" and first["superseded_by"] == out["decision_id"]
    second = _standing(h, cid)
    assert second["round"] == 2 and second["supersedes"] == "D-0001"
    assert h.credit(RESPONDENT) == BOND
    h.call("finalize", cid, by=STRANGER)  # the readjudication is the last word
    assert h.credit(RESPONDENT) == BOND + 2 * GEN
    h.conserved()


def test_readjudication_that_confirms_pays_the_bond_to_the_other_side(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.doc(cid, by=RESPONDENT, text="A photo caption claiming damp, without a photo.")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["changed"] is False and out["reversed"] is False
    assert h.credit(CLAIMANT) == BOND
    h.conserved()


def test_a_new_label_on_the_same_side_does_not_return_the_bond(h):
    """Claimant challenges INSUFFICIENT; the readjudication says NOT_ESTABLISHED. The label changed but the
    decision still favours the respondent, so the challenge failed and the bond goes to the respondent."""
    cid, p, d = _decided(h, c1="INSUFFICIENT", c2="INSUFFICIENT")
    assert _challenge(h, cid, by=CLAIMANT)["state"] == "UNDER_CHALLENGE"
    n = h.photo(cid, by=CLAIMANT, tag="closer-roof")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [d, n]),
                                               crit("C2", "NOT_ESTABLISHED", [d, n])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["overall"] == "NOT_ESTABLISHED" and out["changed"] is True and out["reversed"] is False
    assert h.credit(RESPONDENT) == BOND and h.credit(CLAIMANT) == 0
    assert h.view("get_case", cid)["challenge"]["bond_to"] == "RESPONDENT"
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(RESPONDENT) == BOND + 2 * GEN
    h.conserved()


def test_a_claimant_challenge_that_reaches_supported_returns_the_bond(h):
    cid, p, d = _decided(h, c1="INSUFFICIENT", c2="SUPPORTED")
    _challenge(h, cid, by=CLAIMANT)
    n = h.photo(cid, by=CLAIMANT, tag="finished-roof")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [n, d]), crit("C2", "SUPPORTED", [p, d])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["overall"] == "SUPPORTED" and out["reversed"] is True
    assert h.credit(CLAIMANT) == BOND
    assert h.view("get_case", cid)["challenge"]["bond_to"] == "CHALLENGER"
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == BOND + 2 * GEN
    h.conserved()


def test_new_evidence_and_no_recorded_readjudication_moves_nobodys_money(h):
    """New evidence was filed, and no readjudication was ever recorded: nobody ran one, or the validators never
    agreed (a round that fails consensus leaves no trace the contract can see). Nothing was decided, so the bond
    goes back and the first decision stands. The other side could have run the readjudication itself, and would
    have won the bond if it confirmed."""
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.call("submit_text", cid, '{"doc_type": "OTHER_RECORD"}', "A note of no real substance at all.", by=RESPONDENT)
    h.later(3600)
    h.refused("close_challenge", cid, by=STRANGER, match="anyone can run the readjudication until")
    h.later(3600 + 3 * 86400 - 1)
    h.refused("close_challenge", cid, by=STRANGER, match="anyone can run the readjudication until")
    h.later(1)
    out = h.call("close_challenge", cid, by=STRANGER)
    assert "no readjudication was recorded in time" in out["outcome"]
    assert h.credit(RESPONDENT) == BOND and h.credit(CLAIMANT) == 0
    assert h.view("get_case", cid)["challenge"]["bond_to"] == "CHALLENGER"
    assert len(h.view("get_case", cid)["decisions"]) == 1
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == 2 * GEN, "the first decision stood"
    h.conserved()


def test_the_other_side_can_run_the_readjudication_and_win_the_bond(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.call("submit_text", cid, '{"doc_type": "OTHER_RECORD"}', "I disagree with the decision.", by=RESPONDENT)
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
    out = h.call("readjudicate", cid, by=CLAIMANT)
    assert out["reversed"] is False and h.credit(CLAIMANT) == BOND
    h.conserved()


def test_readjudication_rounds_are_bounded_and_then_the_challenge_closes(h):
    cid = h.opened(allowed=["PHOTO"], required=[])
    p = h.photo(cid, tag="rb-photo")
    h.ready_all(cid)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    _challenge(h, cid, by=RESPONDENT)
    h.photo(cid, by=RESPONDENT, tag="rb-new")
    h.later(7200)
    for _ in range(3):
        h.clear_answers()
        h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "SUPPORTED", []),
                                                              crit("C2", "SUPPORTED", [])))
        assert h.call("readjudicate", cid, by=STRANGER)["overall"] == "NOT_ASSESSED"
    assert h.view("get_case", cid)["challenge"]["rounds"] == 3
    h.refused("readjudicate", cid, by=STRANGER, match="tried the most times allowed")
    out = h.call("close_challenge", cid, by=STRANGER)  # no need to wait out the grace
    # No round could open the photograph the challenger filed, so none of them shows that the fault was the
    # network's and not that file's. The bond goes to the other side.
    assert "new evidence could not be examined" in out["outcome"] and h.credit(CLAIMANT) == BOND
    assert h.view("get_case", cid)["challenge"]["network_fault"] is False
    assert len(h.view("get_case", cid)["decisions"]) == 4
    h.conserved()


def test_a_challengers_file_nobody_can_open_is_new_evidence_brought_in_name_only(h):
    """A free delay, closed. The first decision is made in code (a required photograph is missing). The claimant
    challenges and brings a file no validator can open. Rounds that cannot examine it are not second decisions,
    and after the rounds allowed the bond goes to the other side: nothing shows the network was at fault."""
    cid = h.opened(allowed=["PHOTO", "TEXT_DOCUMENT"], required=[{"type": "PHOTO", "min": 1}])
    h.doc(cid, by=RESPONDENT, text="The agent's note: no repair was carried out.")
    h.ready_all(cid)
    h.clear_answers()
    assert h.call("request_assessment", cid)["overall"] == "INSUFFICIENT"
    _challenge(h, cid, by=CLAIMANT)
    bad = h.photo(cid, by=CLAIMANT, tag="will-not-open")
    h.later(7200)
    for _ in range(3):
        h.clear_answers()
        h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "INSUFFICIENT", [], adequate=False),
                                                              crit("C2", "INSUFFICIENT", [], adequate=False)))
        out = h.call("readjudicate", cid, by=STRANGER)
        assert h.view("get_decision", out["decision_id"])["status"] == "NO_RESULT"
        assert h.view("get_decision", out["decision_id"])["unseen_ids"] == [bad]
    out = h.call("close_challenge", cid, by=STRANGER)
    assert "the challenger's new evidence could not be examined" in out["outcome"]
    assert h.credit(RESPONDENT) == BOND and h.credit(CLAIMANT) == 0
    assert h.view("get_case", cid)["standing"] == "D-0001"
    h.conserved()


def test_the_other_sides_unreadable_reply_never_holds_a_round_up(h):
    """If any unseen new image made a round incomplete, the side defending a decision could file one bad image
    in its reply, make every round fail, and collect the bond."""
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    n = h.doc(cid, by=RESPONDENT, text="Second inspection 6 Oct: the loft is wet again below the repair.",
              criteria=["C1", "C2"])
    h.later(3600)
    spoiler = h.photo(cid, by=CLAIMANT, tag="spoiler")
    h.later(3600)
    h.clear_answers()
    h.answers(look_ans=look_by({"spoiler": {"seen": False}}, default={"seen": True, "shows": "a roof"}),
              judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [n, p]), crit("C2", "CONFLICTING", [p], [n])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["reversed"] is True and h.credit(RESPONDENT) == BOND
    assert _standing(h, cid)["unseen_ids"] == [spoiler]
    h.conserved()


def test_readjudication_reads_the_stored_bytes_of_the_whole_file(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.doc(cid, by=RESPONDENT, text="New inspection notes filed during the challenge.")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
    h.call("readjudicate", cid, by=STRANGER)
    second = _standing(h, cid)
    assert [e["evidence_id"] for e in second["evidence"]][:2] == [p, d]
    assert second["evidence"][2]["new_in_challenge"] is True
    assert second["manifest_digest"] != h.view("get_decision", "D-0001")["manifest_digest"]


def test_challenge_times_out_when_no_readjudication_completes(h):
    cid = h.opened(allowed=["PHOTO"], required=[])
    p = h.photo(cid, tag="only-photo")
    h.ready_all(cid)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    _challenge(h, cid, by=RESPONDENT)
    h.photo(cid, by=RESPONDENT, tag="resp-new")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "SUPPORTED", []), crit("C2", "SUPPORTED", [])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["overall"] == "NOT_ASSESSED"
    assert h.view("get_decision", out["decision_id"])["status"] == "NO_RESULT"
    assert h.view("get_case", cid)["standing"] == "D-0001"
    h.refused("close_challenge", cid, by=STRANGER, match="anyone can run the readjudication until")
    h.later(3 * 86400)
    h.refused("readjudicate", cid, by=STRANGER, match="window has closed")
    out = h.call("close_challenge", cid, by=STRANGER)
    # The one round recorded could not open the challenger's own new photograph, so it proves nothing about
    # the network.
    assert "new evidence could not be examined" in out["outcome"]
    assert h.credit(CLAIMANT) == BOND and h.credit(RESPONDENT) == 0
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == 2 * GEN + BOND
    h.conserved()


def _blind_round(h, cid, by):
    h.clear_answers()
    h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "SUPPORTED", []), crit("C2", "SUPPORTED", [])))
    return h.call("request_assessment", cid, by=by)


def test_not_assessed_is_asked_again_once_by_the_side_it_went_against(h):
    cid = h.opened(allowed=["PHOTO"], required=[], funder="CLAIMANT")
    h.photo(cid, tag="na-photo")
    h.ready_all(cid)
    assert _blind_round(h, cid, RESPONDENT)["overall"] == "NOT_ASSESSED"
    h.refused("request_assessment", cid, by=RESPONDENT, match="only the claimant, whom this decision went against")
    assert _blind_round(h, cid, CLAIMANT)["overall"] == "NOT_ASSESSED"
    h.refused("request_assessment", cid, match="the claimant has already asked for the assessment again")
    decisions = h.view("get_case", cid)["decisions"]
    assert len(decisions) == 2
    assert h.view("get_decision", decisions[0])["superseded_by"] == decisions[1]
    h.later(3600)
    out = h.call("finalize", cid, by=STRANGER)
    # Two panels could not examine the only evidence for the claim. That is a claim not established, and the
    # claimant who deposited the sum does not get it back by filing something nobody can open.
    assert out["settlement"]["to_role"] == "RESPONDENT" and "could not be examined" in out["settlement"]["why"]
    assert h.credit(RESPONDENT) == 2 * GEN and h.credit(CLAIMANT) == 0
    h.conserved()


def test_not_assessed_can_be_challenged_with_evidence_that_can_be_examined(h):
    cid = h.opened(allowed=["PHOTO"], required=[])
    h.photo(cid, tag="na2-photo")
    h.ready_all(cid)
    assert _blind_round(h, cid, CLAIMANT)["overall"] == "NOT_ASSESSED"
    out = _challenge(h, cid, by=RESPONDENT)
    assert out["refused"] and "only the claimant" in out["reason"]
    assert _challenge(h, cid, by=CLAIMANT)["state"] == "UNDER_CHALLENGE"
    n = h.photo(cid, by=CLAIMANT, tag="na2-clear")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look_by({"na2-photo": {"seen": False}}, default={"seen": True, "shows": "a repaired roof"}),
              judge_ans=judge(crit("C1", "SUPPORTED", [n]), crit("C2", "SUPPORTED", [n])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["overall"] == "SUPPORTED" and out["reversed"] is True and h.credit(CLAIMANT) == BOND
    h.conserved()


def test_a_decision_that_could_not_see_an_image_can_be_asked_for_again(h):
    """The claimant's photograph did not reach the leader, a line of text from the respondent did, and the
    result was an assessed INSUFFICIENT. Validators that could not look have not judged that evidence."""
    cid = h.opened()
    p = h.photo(cid, tag="unlucky-roof")
    d = h.doc(cid, by=RESPONDENT, text="The respondent disputes that the repair was done.")
    h.ready_all(cid)
    h.clear_answers()
    h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "INSUFFICIENT", [], adequate=False),
                                                          crit("C2", "INSUFFICIENT", [], adequate=False)))
    first = h.call("request_assessment", cid)
    assert first["overall"] == "INSUFFICIENT" and _standing(h, cid)["unseen_ids"] == [p]
    h.refused("request_assessment", cid, by=RESPONDENT, match="only the claimant, whom this decision went against")
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p, d])))
    second = h.call("request_assessment", cid, by=CLAIMANT)
    assert second["overall"] == "SUPPORTED" and _standing(h, cid)["unseen_ids"] == []
    assert h.view("get_decision", first["decision_id"])["status"] == "SUPERSEDED"
    case = h.view("get_case", cid)
    assert case["retries_used"] == 1 and case["retried_by"] == ["CLAIMANT"]
    # Every image was examined now: the way to contest this one is a challenge.
    h.refused("request_assessment", cid, by=RESPONDENT, match="no image went unexamined")
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == 2 * GEN
    h.conserved()


def test_asking_again_is_bounded_so_an_unreadable_file_buys_one_more_assessment_and_no_more(h):
    cid = h.opened()
    h.photo(cid, tag="never-opens")
    h.doc(cid, by=RESPONDENT, text="The respondent disputes that the repair was done.")
    h.ready_all(cid)
    for by in (CLAIMANT, CLAIMANT):
        h.clear_answers()
        h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "INSUFFICIENT", [], adequate=False),
                                                              crit("C2", "INSUFFICIENT", [], adequate=False)))
        assert h.call("request_assessment", cid, by=by)["overall"] == "INSUFFICIENT"
    h.refused("request_assessment", cid, match="the claimant has already asked for the assessment again")
    h.later(3600)
    h.refused("request_assessment", cid, match="the claimant has already asked for the assessment again")
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(RESPONDENT) == 2 * GEN
    h.conserved()


def test_a_decided_case_is_not_assessed_again(h):
    cid, p, d = _decided(h)
    h.refused("request_assessment", cid, match="the way to contest it is a challenge")
    h.refused("request_assessment", cid, by=RESPONDENT, match="no image went unexamined")


@pytest.mark.parametrize("overall,payee", [("SUPPORTED", "CLAIMANT"), ("NOT_ESTABLISHED", "RESPONDENT"),
                                           ("INSUFFICIENT", "RESPONDENT")])
def test_finalize_moves_the_held_sum_by_the_agreed_rule(h, overall, payee):
    c = {"SUPPORTED": ("SUPPORTED", "SUPPORTED"), "NOT_ESTABLISHED": ("NOT_ESTABLISHED", "SUPPORTED"),
         "INSUFFICIENT": ("INSUFFICIENT", "SUPPORTED")}[overall]
    cid, p, d = _decided(h, c1=c[0], c2=c[1])
    assert _standing(h, cid)["overall"] == overall
    h.later(3600)
    out = h.call("finalize", cid, by=STRANGER)
    who = CLAIMANT if payee == "CLAIMANT" else RESPONDENT
    assert h.credit(who) == 2 * GEN and out["settlement"]["to_role"] == payee
    h.conserved()


def test_record_only_case_finalizes_without_money(h):
    cid = h.opened(held_sum_wei="0", funder="")
    p = h.photo(cid, tag="rec-only")
    h.ready_all(cid)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    h.later(3600)
    out = h.call("finalize", cid, by=STRANGER)
    assert out["state"] == "FINAL" and out["settlement"] is None
    h.conserved()


def test_lapse_when_nobody_asks_for_the_assessment(h):
    cid = h.opened()
    h.photo(cid, tag="lapse")
    h.refused("lapse_case", cid, by=STRANGER, match="can still ask for the assessment until")
    h.later(3600)  # the evidence period is over, but the grace has just begun
    h.refused("lapse_case", cid, by=STRANGER, match="can still ask for the assessment until")
    h.later(3 * 86400 - 1)
    h.refused("lapse_case", cid, by=STRANGER, match="can still ask for the assessment until")
    h.later(1)
    h.call("lapse_case", cid, by=STRANGER)
    assert h.view("get_case", cid)["state"] == "LAPSED"
    assert h.credit(RESPONDENT) == 2 * GEN
    h.conserved()


def test_withdraw_pays_only_what_is_owed_to_the_caller(h):
    h.refused("withdraw", by=STRANGER, match="nothing is owed")
    cid, p, d = _decided(h)
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    h.call("withdraw", by=CLAIMANT)
    assert h.transfers == [{"to": CLAIMANT, "wei": 2 * GEN}]
    h.refused("withdraw", by=CLAIMANT, match="nothing is owed")
    assert h.view("get_credit", CLAIMANT) == {"owed": "0", "paid": str(2 * GEN)}
    h.conserved()


def test_one_challenge_per_case_even_after_it_closes(h):
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.later(3600)
    h.call("close_challenge", cid, by=STRANGER)
    assert h.view("get_case", cid)["state"] == "DETERMINED"
    out = _challenge(h, cid, by=RESPONDENT)
    assert out["refused"] and "already been challenged once" in out["reason"]
    h.conserved()


def test_the_challenger_files_first_and_the_other_side_has_as_long_again_to_answer(h):
    """Without a reply window the challenger could file in the last second, run the readjudication at once and
    leave the other side no chance to answer what was filed."""
    cid, p, d = _decided(h)
    out = _challenge(h, cid, by=RESPONDENT)
    ch = h.view("get_case", cid)["challenge"]
    assert out["evidence_ends"] == ch["evidence_ends"] < ch["reply_ends"] == out["reply_ends"] < ch["close_after"]
    h.later(3599)
    n = h.doc(cid, by=RESPONDENT, text="Filed in the last second: a second inspection found the loft wet.")
    h.later(1)
    assert h.view("get_case", cid)["state"] == "UNDER_CHALLENGE"
    h.refused("submit_text", cid, '{"doc_type": "INSPECTION_REPORT"}', "A late inspection note filed too late.",
              by=RESPONDENT, match="the challenger's time to file new evidence has ended")
    h.refused("readjudicate", cid, by=RESPONDENT, match="the other side may answer the new evidence until")
    answer = h.doc(cid, by=CLAIMANT, doc_type="CONTRACTOR_STATEMENT",
                   text="The contractor's answer: the loft was dry on 7 October, after the second inspection.")
    h.later(3600)
    h.refused("submit_text", cid, '{"doc_type": "INVOICE"}', "The claimant's second answer, too late.",
              by=CLAIMANT, match="the time to answer the challenge has ended")
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d, answer], [n]),
                                               crit("C2", "SUPPORTED", [p, d, answer])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["reversed"] is False and h.credit(CLAIMANT) == BOND
    assert answer in [e["evidence_id"] for e in _standing(h, cid)["evidence"]]
    h.conserved()


def test_the_inspector_may_answer_a_challenge_too(h):
    cid = h.opened(inspector=INSPECTOR)
    p = h.photo(cid, tag="insp-roof")
    r = h.doc(cid, by=INSPECTOR, text="Independent inspection: every listed slate replaced.", criteria=["C1", "C2"])
    h.ready_all(cid, inspector=INSPECTOR)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, r]), crit("C2", "SUPPORTED", [p, r])))
    h.call("request_assessment", cid)
    _challenge(h, cid, by=RESPONDENT)
    h.doc(cid, by=RESPONDENT, text="The respondent's new note on the north face.")
    h.later(3600)
    again = h.doc(cid, by=INSPECTOR, text="Independent re-inspection: the north face is sealed.", criteria=["C2"])
    assert h.view("get_evidence", again)["during_challenge"] is True


def test_a_round_that_loses_sight_of_what_the_first_panel_saw_is_not_a_second_decision(h):
    """The first panel saw the photograph. A readjudication whose leader cannot see it has not judged the same
    file, whatever it concludes: nothing changes, it may be run again, and the fault is recorded as the
    network's, so the bond goes back if no round ever completes."""
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    n = h.photo(cid, by=RESPONDENT, tag="new-and-seen")
    h.later(7200)
    h.clear_answers()
    h.answers(look_ans=look_by({"ch-roof": {"seen": False}}, default={"seen": True, "shows": "a wet loft"}),
              judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [n, d]), crit("C2", "NOT_ESTABLISHED", [n, d])))
    out = h.call("readjudicate", cid, by=STRANGER)
    lost = h.view("get_decision", out["decision_id"])
    assert lost["status"] == "NO_RESULT" and lost["unseen_ids"] == [p] and lost["overall"] == "NOT_ESTABLISHED"
    case = h.view("get_case", cid)
    assert case["standing"] == "D-0001" and case["state"] == "UNDER_CHALLENGE"
    assert case["challenge"]["network_fault"] is True and case["challenge"]["rounds"] == 1
    assert h.credit(RESPONDENT) == 0 and h.credit(CLAIMANT) == 0, "no bond has moved"
    # Run again with a leader that sees everything: now it is a decision.
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [n, d]),
                                               crit("C2", "NOT_ESTABLISHED", [n, d])))
    out = h.call("readjudicate", cid, by=STRANGER)
    assert out["reversed"] is True and h.credit(RESPONDENT) == BOND
    h.conserved()


# ---- audit 4 ---------------------------------------------------------------------------------------

def test_each_side_may_ask_again_once_so_neither_can_spend_the_others_turn(h):
    """The respondent files an image nobody can open. A decision for the claimant that examined everything else
    can then be asked for again by the respondent, and if that one goes against the claimant the claimant has
    the same right. With one shared allowance the respondent could take both turns and the claimant none."""
    cid = h.opened()
    p = h.photo(cid, tag="good-roof")
    h.photo(cid, by=RESPONDENT, tag="never-opens")
    h.ready_all(cid)

    def ask(by, supported):
        h.clear_answers()
        rows = ([crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])] if supported else
                [crit("C1", "INSUFFICIENT", [], adequate=False), crit("C2", "INSUFFICIENT", [], adequate=False)])
        h.answers(look_ans=look_by({"never-opens": {"seen": False}}, default={"seen": True, "shows": "a roof"}),
                  judge_ans=judge(*rows))
        return h.call("request_assessment", cid, by=by)["overall"]

    assert ask(CLAIMANT, True) == "SUPPORTED"
    h.refused("request_assessment", cid, by=CLAIMANT, match="only the respondent, whom this decision went against")
    assert ask(RESPONDENT, False) == "INSUFFICIENT"   # the respondent's one turn
    h.refused("request_assessment", cid, by=RESPONDENT, match="only the claimant, whom this decision went against")
    assert ask(CLAIMANT, True) == "SUPPORTED"         # the claimant's one turn
    h.refused("request_assessment", cid, by=RESPONDENT, match="the respondent has already asked")
    case = h.view("get_case", cid)
    assert case["retried_by"] == ["RESPONDENT", "CLAIMANT"] and case["retries_used"] == 2
    assert len(case["decisions"]) == 3
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    assert h.credit(CLAIMANT) == 2 * GEN and h.credit(RESPONDENT) == 0
    h.conserved()


def test_a_round_that_could_not_open_the_challengers_own_file_never_blames_the_network(h):
    """The challenger's only new item is an image nobody can open, so every round fails by the challenger's own
    doing. One of the rounds also misses a photograph the first panel had seen. That round proves nothing about
    the network either, and the bond must not come back for it."""
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.photo(cid, by=RESPONDENT, tag="never-opens")
    h.later(7200)
    for unseen in (("never-opens",), ("never-opens", "ch-roof"), ("never-opens",)):
        h.clear_answers()
        h.answers(look_ans=look_by({t: {"seen": False} for t in unseen}, default={"seen": True, "shows": "a roof"}),
                  judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
        out = h.call("readjudicate", cid, by=STRANGER)
        assert h.view("get_decision", out["decision_id"])["status"] == "NO_RESULT"
    assert h.view("get_case", cid)["challenge"]["network_fault"] is False
    out = h.call("close_challenge", cid, by=STRANGER)
    assert "new evidence could not be examined" in out["outcome"]
    assert h.credit(CLAIMANT) == BOND and h.credit(RESPONDENT) == 0
    h.conserved()


def test_a_blind_round_still_returns_the_bond_when_the_challenger_brought_only_text(h):
    """Text cannot fail to open. A round that lost sight of what the first panel saw is then the network's."""
    cid, p, d = _decided(h)
    _challenge(h, cid, by=RESPONDENT)
    h.doc(cid, by=RESPONDENT, text="Second inspection, 6 October: the loft is wet again.", doc_type="OTHER_RECORD")
    h.later(7200)
    for _ in range(3):
        h.clear_answers()
        h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "INSUFFICIENT", [], adequate=False),
                                                              crit("C2", "INSUFFICIENT", [], adequate=False)))
        h.call("readjudicate", cid, by=STRANGER)
    assert h.view("get_case", cid)["challenge"]["network_fault"] is True
    out = h.call("close_challenge", cid, by=STRANGER)
    assert "could not see images the first decision had seen" in out["outcome"] and h.credit(RESPONDENT) == BOND
    h.conserved()


def test_a_challenge_reason_too_long_is_refused_and_never_cut(h):
    """Padded with characters that are removed, a long reason used to lose its tail without a word."""
    cid, p, d = _decided(h)
    padded = "The inspection was done before the work finished. " + "\u200b" * 9000 + "And the tail matters."
    out = h.call("challenge", cid, padded, by=RESPONDENT, value=BOND)
    assert out["refused"] and "at most 1000 characters" in out["reason"] and out["credited_wei"] == str(BOND)
    assert h.view("get_case", cid)["challenge"] is None
    out = h.call("challenge", cid, "x" * 1001, by=RESPONDENT, value=BOND)
    assert out["refused"] and "at most 1000 characters" in out["reason"]
    assert _challenge(h, cid, by=RESPONDENT, reason="y" * 1000)["state"] == "UNDER_CHALLENGE"
    assert len(h.view("get_case", cid)["challenge"]["reason"]) == 1000
    h.conserved()
