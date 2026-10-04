"""Terms: validation, versions, acceptance by digest, funding, and the draft's exits."""

import json

import pytest

from conftest import (CLAIMANT, GEN, INSPECTOR, RESPONDENT, SECOND, STRANGER, terms)


def _open_refused(h, match, **over):
    return h.refused("open_case", json.dumps(terms(**over)), by=CLAIMANT, match=match)


@pytest.mark.parametrize("over,match", [
    ({"title": "Roof"}, "title of at least 5"),
    ({"event_kind": "FLOOD_INDEX"}, "event kind must be one of"),
    ({"property_ref": "x"}, "short reference"),
    ({"property_ref": "call me at a@b.com"}, "nickname, not contact details"),
    ({"property_ref": "see https://example.com"}, "nickname, not contact details"),
    ({"time_zone": "London time"}, "IANA name"),
    ({"deadline": "3 October"}, "must look like"),
    ({"window_start": "2026-10-05", "deadline": "2026-10-03"}, "window start is after the deadline"),
    ({"claim": "done"}, "at least 10 characters"),
    ({"criteria": []}, "between 1 and 6 criteria"),
    ({"criteria": [{"text": "c" * 10}] * 7}, "between 1 and 6 criteria"),
    ({"criteria": [{"text": "abc"}]}, "at least 5 characters"),
    ({"criteria": [{"text": "same words", "needs_independent": False},
                   {"text": "Same Words", "needs_independent": False}]}, "say the same thing"),
    ({"criteria": [{"text": "valid criterion", "needs_independent": "yes"}]}, "true or false"),
    ({"allowed": []}, "at least one allowed evidence kind"),
    ({"allowed": ["HOLOGRAM"]}, "not an evidence kind"),
    ({"required": [{"type": "AUDIO", "min": 1}]}, "not a requirement type"),
    ({"allowed": ["TEXT_DOCUMENT"], "required": [{"type": "PHOTO", "min": 1}]}, "do not allow"),
    ({"allowed": ["PHOTO"], "required": [{"type": "DOC:INVOICE", "min": 1}]}, "no document kind is allowed"),
    ({"required": [{"type": "PHOTO", "min": 1}, {"type": "PHOTO", "min": 2}]}, "twice"),
    ({"required": [{"type": "PHOTO", "min": 9}]}, "between 1 and 3"),
    ({"respondent": "not-an-address"}, "wallet address"),
    ({"respondent": CLAIMANT}, "different wallet"),
    ({"inspector": RESPONDENT}, "independent of both"),
    ({"criteria": [{"text": "Inspector confirms dryness.", "needs_independent": True}]}, "name an inspector"),
    ({"held_sum_wei": "1.5"}, "string of digits"),
    ({"held_sum_wei": "1000"}, "between 0.01 and 1000 GEN"),
    ({"funder": "INSPECTOR"}, "which party funds"),
    ({"challenge_bond_wei": "5"}, "between 0.01 and 100 GEN"),
    ({"evidence_period_seconds": 60}, "between 600 and"),
    ({"challenge_window_seconds": 99 * 86400}, "between 3600 and"),
    ({"challenge_window_seconds": 600}, "the challenge window in seconds must be between 3600 and"),
    ({"challenge_evidence_seconds": 599}, "between 600 and"),
    ({"required": [{"type": "PHOTO", "min": 3}, {"type": "VIDEO_FRAME", "min": 3}]}, "more than one party may file"),
    ({"required": [{"type": "TEXT_DOCUMENT", "min": 3}, {"type": "DOC:INVOICE", "min": 2}]},
     "more than one party may file"),
    ({"title": {"a": "hello world"}}, "the title must be text"),
    ({"claim": ["The roof was repaired in time."]}, "the claim must be text"),
    ({"criteria": [{"text": 12345678}]}, "criterion 1 must be text"),
    ({"deadline": 0}, "the deadline must be text"),
    ({"deadline": False}, "the deadline must be text"),
    ({"time_zone": ["UTC"]}, "the time zone must be text"),
    ({"respondent": 12345}, "wallet address"),
    ({"held_sum_wei": True}, "string of digits"),
    ({"held_sum_wei": 10 ** 60}, "string of digits"),
    ({"funder": "nobody"}, "which party funds"),
    ({"funder": ""}, "which party funds"),
    ({"held_sum_wei": "0", "funder": "nobody"}, "which party funds"),
    ({"event_kind": 5}, "event kind must be one of"),
    ({"allowed": ["PHOTO", 3]}, "not an evidence kind"),
    ({"follows_case": 7}, "earlier case id"),
    ({"deadline": "0999-10-03"}, "must look like"),
    ({"follows_case": "case one"}, "earlier case id"),
    ({"follows_case": "KW-0099"}, "no earlier case"),
    ({"follows_case": "KW-" + "0" * 20 + "1"}, "earlier case id"),
    ({"limitations": "none"}, "at most 4 limitations"),
    ({"limitations": ["a limitation"] * 5}, "at most 4 limitations"),
    ({"limitations": ["a limitation", 7]}, "limitation 2 must be text"),
    ({"limitations": ["a limitation", None]}, "limitation 2 must be text"),
])
def test_every_term_is_validated_in_the_contract(h, over, match):
    _open_refused(h, match, **over)


@pytest.mark.parametrize("over,match", [
    ({"title": "t" * 121}, "the title may be at most 120"),
    ({"property_ref": "p" * 81}, "the property reference may be at most 80"),
    ({"claim": "c" * 401}, "the claim may be at most 400"),
    ({"criteria": [{"text": "The roof is dry."}, {"text": "k" * 301}]}, "criterion 2 may be at most 300"),
    ({"limitations": ["fine", "l" * 301]}, "limitation 2 may be at most 300"),
    ({"time_zone": "Europe/" + "L" * 60}, "the time zone may be at most 60"),
])
def test_text_that_defines_the_agreement_is_refused_when_too_long_never_cut(h, over, match):
    """Cut to fit, "all slates replaced, except above the porch" could be stored as "all slates replaced"."""
    _open_refused(h, match, **over)
    assert h.view("get_stats")["case"] == "0"


def test_text_at_the_limit_is_stored_whole(h):
    cid = h.open(title="t" * 120, claim="c" * 400, criteria=[{"text": "k" * 300}], limitations=["l" * 300, " "])
    t = h.view("get_terms", cid, 1)
    assert (len(t["title"]), len(t["claim"]), len(t["criteria"][0]["text"])) == (120, 400, 300)
    assert t["limitations"] == ["l" * 300], "a blank line is not a limitation"


@pytest.mark.parametrize("field", ["deadline", "window_start"])
@pytest.mark.parametrize("value,match", [
    ("2026-10-03T17:00:00", "no seconds and no offset"),
    ("2026-10-03T17:00Z", "no seconds and no offset"),
    ("2026-10-03T17:00+01:00", "no seconds and no offset"),
    ("2026-10-03 17:00", "no seconds and no offset"),
    ("2026-10-03T17:00 " + "x" * 60, "no seconds and no offset"),
    ("2026-02-30", "not a real date and time"),
    ("2026-13-01T09:00", "not a real date and time"),
    ("2026-10-03T24:30", "not a real date and time"),
])
def test_a_time_with_seconds_an_offset_or_an_impossible_date_is_refused_not_reinterpreted(h, field, value, match):
    """Cut to 16 characters, 17:00 UTC would be stored as 17:00 in the case's own zone, an hour or more out."""
    _open_refused(h, match, **{field: value})


def test_a_day_with_no_time_is_the_whole_day(h):
    # The window opens during its last day: a deadline given as a day falls as that day ends.
    cid = h.open(window_start="2026-10-03T09:00", deadline="2026-10-03")
    t = h.view("get_terms", cid, 1)
    assert (t["window_start"], t["deadline"]) == ("2026-10-03T09:00", "2026-10-03")
    _open_refused(h, "window start is after the deadline", window_start="2026-10-04", deadline="2026-10-03")
    _open_refused(h, "window start is after the deadline", window_start="2026-10-03T17:01",
                  deadline="2026-10-03T17:00")


def test_open_records_version_one_and_its_digest(h):
    out = h.call("open_case", json.dumps(terms()), by=CLAIMANT)
    assert out["case_id"] == "KW-0001" and out["version"] == 1
    t = h.view("get_terms", "KW-0001", 1)
    assert t["digest"] == out["digest"]
    assert [c["id"] for c in t["criteria"]] == ["C1", "C2"]
    assert t["claimant"] == CLAIMANT and t["respondent"] == RESPONDENT
    case = h.view("get_case", "KW-0001")
    assert case["state"] == "DRAFT" and case["accepted_version"] == 0
    assert "KW-0001" in [c["case_id"] for c in h.view("cases_of", RESPONDENT, 0, 10)["cases"]]


def test_terms_digest_is_the_canonical_json_of_the_stored_terms(h):
    import hashlib
    cid = h.open()
    t = h.view("get_terms", cid, 1)
    digest = t.pop("digest")
    canon = json.dumps(t, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    assert hashlib.sha256(canon.encode("ascii")).hexdigest() == digest


def test_claimant_revises_while_draft_and_every_version_is_kept(h):
    cid = h.open()
    v1 = h.digest(cid)
    out = h.call("revise_terms", cid, json.dumps(terms(claim="A different, sharper claim about the roof.")))
    assert out["version"] == 2 and out["digest"] != v1
    assert h.view("get_terms", cid, 1)["digest"] == v1
    h.refused("revise_terms", cid, json.dumps(terms()), by=STRANGER, match="only the claimant")
    h.refused("revise_terms", cid, json.dumps(terms(respondent=SECOND)), match="same respondent")


def test_acceptance_binds_the_exact_digest(h):
    cid = h.open()
    old = h.digest(cid)
    h.call("revise_terms", cid, json.dumps(terms(claim="The repair was finished and the loft is dry.")))
    h.refused("accept_case", cid, old, by=RESPONDENT, match="does not match the current terms")
    h.refused("accept_case", cid, h.digest(cid), by=STRANGER, match="only the named respondent")
    out = h.accept(cid)
    assert out["version"] == 2
    case = h.view("get_case", cid)
    assert case["accepted_version"] == 2 and case["accepted_digest"] == h.digest(cid)


def test_criteria_cannot_change_after_acceptance(h):
    cid = h.open()
    h.accept(cid)
    h.refused("revise_terms", cid, json.dumps(terms(criteria=[{"text": "Something easier to show."}])),
              match="frozen once the respondent has accepted")
    h.refused("accept_case", cid, h.digest(cid), by=RESPONDENT, match="no longer awaiting acceptance")


def test_case_opens_only_when_accepted_inspected_and_funded(h):
    cid = h.open(inspector=INSPECTOR)
    h.accept(cid)
    assert h.view("get_case", cid)["state"] == "DRAFT"
    h.call("accept_inspector", cid, h.digest(cid), by=INSPECTOR)
    assert h.view("get_case", cid)["state"] == "DRAFT"
    h.fund(cid, by=RESPONDENT)
    case = h.view("get_case", cid)
    assert case["state"] == "OPEN" and case["evidence_deadline"]
    h.conserved()


def test_record_only_case_opens_on_acceptance(h):
    cid = h.open(held_sum_wei="0", funder="")
    h.accept(cid)
    assert h.view("get_case", cid)["state"] == "OPEN"


def test_inspector_role_is_accepted_only_by_the_named_wallet(h):
    cid = h.open(inspector=INSPECTOR)
    h.refused("accept_inspector", cid, h.digest(cid), by=STRANGER, match="only the inspector named")
    h.refused("accept_inspector", cid, "0" * 64, by=INSPECTOR, match="does not match the current terms")
    h.refused("accept_inspector", cid, 7, by=INSPECTOR, match="does not match the current terms")
    h.call("accept_inspector", cid, h.digest(cid), by=INSPECTOR)
    h.refused("accept_inspector", cid, h.digest(cid), by=INSPECTOR, match="already accepted")


def test_revised_terms_need_the_inspector_to_accept_again(h):
    """An inspector accepts one exact version. If the claimant then publishes terms that lean on the inspector
    for every criterion, the earlier acceptance does not carry over."""
    cid = h.open(inspector=INSPECTOR)
    first = h.digest(cid)
    h.call("accept_inspector", cid, first, by=INSPECTOR)
    assert h.view("get_case", cid)["inspector_accepted"] is True
    h.call("revise_terms", cid, json.dumps(terms(inspector=INSPECTOR, criteria=[
        {"text": "The inspector confirms every listed task.", "needs_independent": True}])))
    assert h.view("get_case", cid)["inspector_accepted"] is False
    h.refused("accept_inspector", cid, first, by=INSPECTOR, match="does not match the current terms")
    h.accept(cid)
    h.fund(cid)
    assert h.view("get_case", cid)["state"] == "DRAFT", "it does not open on terms the inspector never saw"
    h.call("accept_inspector", cid, h.digest(cid), by=INSPECTOR)
    assert h.view("get_case", cid)["state"] == "OPEN"


def test_funding_refusals_are_credited_back_not_raised(h):
    cid = h.open()
    out = h.call("fund_case", cid, by=RESPONDENT, value=2 * GEN)
    assert out["refused"] and "after acceptance" in out["reason"]
    assert h.credit(RESPONDENT) == 2 * GEN
    h.accept(cid)
    out = h.call("fund_case", cid, by=CLAIMANT, value=2 * GEN)
    assert out["refused"] and "respondent deposits" in out["reason"]
    out = h.call("fund_case", cid, by=RESPONDENT, value=GEN)
    assert out["refused"] and "exactly the held sum" in out["reason"]
    h.conserved()
    h.fund(cid, by=RESPONDENT)
    out = h.call("fund_case", cid, by=RESPONDENT, value=2 * GEN)
    assert out["refused"]
    h.conserved()
    assert h.credit(CLAIMANT) == 2 * GEN
    assert h.credit(RESPONDENT) == 2 * GEN + GEN + 2 * GEN


def test_funding_without_value_is_an_ordinary_refusal(h):
    cid = h.open()
    h.accept(cid)
    h.refused("fund_case", cid, by=RESPONDENT, value=0, match="exactly the held sum")


def test_claimant_funder(h):
    cid = h.open(funder="CLAIMANT")
    h.accept(cid)
    h.fund(cid, by=CLAIMANT)
    case = h.view("get_case", cid)
    assert case["state"] == "OPEN" and case["funder_address"] == CLAIMANT


def test_decline_and_withdraw_and_expire_are_exits(h):
    a = h.open()
    h.refused("decline_case", a, "no", by=STRANGER, match="only the named respondent")
    h.refused("decline_case", a, "n" * 1001, by=RESPONDENT, match="the reason may be at most 1000")
    h.call("decline_case", a, "I never agreed to this repair scope", by=RESPONDENT)
    assert h.view("get_case", a)["state"] == "DECLINED"
    b = h.open()
    h.accept(b)
    h.fund(b)
    # Funded and open: withdrawal is no longer the claimant's alone.
    h.refused("withdraw_case", b, match="before it opens for evidence")
    c = h.open(inspector=INSPECTOR)
    h.accept(c)
    h.fund(c)
    h.call("withdraw_case", c, by=CLAIMANT)
    assert h.view("get_case", c)["state"] == "WITHDRAWN"
    assert h.credit(RESPONDENT) == 2 * GEN  # the depositor, recorded from the deposit
    d = h.open()
    h.refused("expire_case", d, by=STRANGER, match="stays open until")
    h.later(7 * 86400)
    h.call("expire_case", d, by=STRANGER)
    assert h.view("get_case", d)["state"] == "EXPIRED"
    h.conserved()


def test_a_claimant_has_at_most_five_unfinished_cases(h):
    ids = [h.open() for _ in range(5)]
    h.refused("open_case", json.dumps(terms()), by=CLAIMANT, match="at most 5 unfinished")
    h.call("withdraw_case", ids[0], by=CLAIMANT)
    assert h.open()


def test_follow_up_cites_an_earlier_final_case_between_the_same_parties(h):
    first = h.final()
    out = h.call("open_case", json.dumps(terms(follows_case=first)), by=CLAIMANT)
    assert h.view("get_terms", out["case_id"], 1)["follows_case"] == first
    assert h.view("get_case", out["case_id"])["thread"] == first == h.view("get_case", first)["thread"]
    # Either way round: the respondent may open the follow-up against the claimant.
    back = h.call("open_case", json.dumps(terms(follows_case=first, respondent=CLAIMANT)), by=RESPONDENT)
    assert h.view("get_case", back["case_id"])["thread"] == first


def test_a_follow_up_cannot_cite_an_unsettled_case_or_other_parties(h):
    open_case = h.open()
    _open_refused(h, "cites a case that is closed", follows_case=open_case)
    first = h.final()
    _open_refused(h, "between the same two parties", follows_case=first, respondent=SECOND)
    _open_refused(h, "no earlier case", follows_case="KW-0099")


def test_a_second_deposit_is_refused_while_the_draft_waits_for_its_inspector(h):
    cid = h.open(inspector=INSPECTOR)
    h.accept(cid)
    h.fund(cid, by=RESPONDENT)
    assert h.view("get_case", cid)["state"] == "DRAFT"
    out = h.call("fund_case", cid, by=RESPONDENT, value=2 * GEN)
    assert out["refused"] and "already deposited" in out["reason"]
    h.conserved()


def test_an_expired_draft_can_only_be_closed(h):
    """A draft is good for seven days. After that nothing moves it forward, whoever calls first."""
    cid = h.open(inspector=INSPECTOR)
    digest = h.digest(cid)
    h.later(7 * 86400)
    h.refused("accept_case", cid, digest, by=RESPONDENT, match="this draft expired on")
    h.refused("accept_inspector", cid, digest, by=INSPECTOR, match="this draft expired on")
    h.refused("revise_terms", cid, json.dumps(terms(inspector=INSPECTOR, claim="A new claim, written too late.")),
              match="this draft expired on")
    h.call("expire_case", cid, by=STRANGER)
    assert h.view("get_case", cid)["state"] == "EXPIRED"


def test_a_deposit_into_an_expired_draft_is_refused_by_returning_and_credited_back(h):
    cid = h.open()
    h.accept(cid)
    h.later(7 * 86400)
    out = h.call("fund_case", cid, by=RESPONDENT, value=2 * GEN)
    assert out["refused"] and "this draft expired on" in out["reason"] and out["credited_wei"] == str(2 * GEN)
    assert h.credit(RESPONDENT) == 2 * GEN and h.view("get_case", cid)["funded_wei"] == "0"
    h.conserved()


def test_terms_have_a_bounded_number_of_versions(h):
    cid = h.open()
    for i in range(19):
        h.call("revise_terms", cid, json.dumps(terms(claim=f"The roof repairs were finished, wording {i}.")))
    assert h.view("get_case", cid)["version"] == 20
    h.refused("revise_terms", cid, json.dumps(terms(claim="One wording too many for this case.")),
              match="at most 20 versions")


def test_oversized_json_is_refused_before_it_is_parsed(h):
    huge = json.dumps(terms(title="t" * 30_000))
    h.refused("open_case", huge, by=CLAIMANT, match="the terms may be at most 20000 characters of JSON")
    h.refused("open_case", {"title": "not text"}, by=CLAIMANT, match="the terms must be JSON text")
    cid = h.opened()
    h.refused("submit_image", cid, json.dumps({"kind": "PHOTO", "description": "d" * 5000}), b"x",
              match="the evidence description may be at most 4000 characters of JSON")


def test_text_far_over_its_limit_is_refused_on_its_length_alone(h):
    """A megabyte of title is refused without being cleaned character by character first."""
    import time
    started = time.perf_counter()
    h.refused("open_case", json.dumps({"x": 1}), by=CLAIMANT, match="title of at least 5")
    assert h.m._clean("y" * 2_000_000, 120) == "y" * 120
    with pytest.raises(Exception, match="the title may be at most 120 characters"):
        h.m._bounded("z" * 2_000_000, 120, "the title")
    assert time.perf_counter() - started < 2.0


def test_only_ascii_digits_are_digits(h):
    """In Python, the pattern for a digit also matches the digits of every other script."""
    arabic = "".join(chr(0x0660 + int(ch)) for ch in "2026")  # Arabic-Indic 2026
    _open_refused(h, "must look like", deadline=f"{arabic}-10-03")
    _open_refused(h, "string of digits", held_sum_wei=chr(0x0661) + "0000000000000000")
    _open_refused(h, "earlier case id", follows_case="KW-" + chr(0x0660) * 4)
    cid = h.opened(allowed=["PHOTO", "VIDEO_FRAME"])
    from conftest import jpeg
    h.refused("submit_image", cid, json.dumps({"kind": "VIDEO_FRAME", "frame_time": chr(0x07C1) + chr(0x07C2) + ":30"}),
              jpeg("nko"), match="minutes and seconds")


# ---- audit 4 ---------------------------------------------------------------------------------------

def test_a_required_document_counts_as_an_image_when_only_pages_are_allowed(h):
    """With no text documents allowed, a required invoice can only be filed as a page, which is an image. Three
    photographs and three invoices would then need six images from a party that may file five."""
    need = [{"type": "PHOTO", "min": 3}, {"type": "DOC:INVOICE", "min": 3}]
    h.refused("open_case", json.dumps(terms(allowed=["PHOTO", "DOCUMENT_PAGE"], required=need)),
              match="more than one party may file")
    assert h.call("open_case", json.dumps(terms(allowed=["PHOTO", "DOCUMENT_PAGE", "TEXT_DOCUMENT"],
                                                required=need)))["case_id"]
    assert h.call("open_case", json.dumps(terms(allowed=["PHOTO", "DOCUMENT_PAGE"],
                                                required=[{"type": "PHOTO", "min": 3},
                                                          {"type": "DOC:INVOICE", "min": 2}])))["case_id"]


@pytest.mark.parametrize("value", ["\uff13\uff16\uff10\uff10", "\u0663\u0666\u0660\u0660", "3_600", " 3600 ", "+3600",
                                   "3600\n", "3600.0", "0x0e10", "", 3600.5, True, None, [3600]])
def test_a_number_is_an_int_or_a_string_of_plain_digits(h, value):
    h.refused("open_case", json.dumps(terms(challenge_window_seconds=value)), match="must be a whole number")


def test_plain_digits_and_ints_are_the_same_number(h):
    a = h.call("open_case", json.dumps(terms(challenge_window_seconds="3600")))["case_id"]
    b = h.call("open_case", json.dumps(terms(challenge_window_seconds=3600)))["case_id"]
    assert h.view("get_terms", a, 1)["challenge_window_seconds"] == 3600
    assert h.view("get_terms", b, 1)["challenge_window_seconds"] == 3600
    h.refused("open_case", json.dumps(terms(required=[{"type": "PHOTO", "min": "\u0662"}])),
              match="must be a whole number")


@pytest.mark.parametrize("field", ["required", "limitations"])
@pytest.mark.parametrize("value", [0, "", {}, False, "none"])
def test_a_list_field_given_as_something_else_is_refused_not_read_as_empty(h, field, value):
    h.refused("open_case", json.dumps(terms(**{field: value})), match="name at most")
