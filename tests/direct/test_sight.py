"""Which nodes can see, and what a node that cannot see is allowed to do.

Measured on Studio Next (3 October 2026): several validator routes are sent
no image at all, and one describes pictures it was never given. The contract
therefore draws a calibration image a node's model must read before it
examines evidence images."""

import json

import pytest

from conftest import CLAIMANT, GEN, RESPONDENT, STRANGER, S, crit, jpeg, judge, look, look_by, read_canary


def _case(h, **over):
    cid = h.opened(**over)
    p = h.photo(cid, tag="sight-roof")
    d = h.doc(cid, by=RESPONDENT, text="Inspection: the slates were replaced and the loft is dry.")
    h.ready_all(cid)
    return cid, p, d


def _ask(h, cid, rows, look_ans=None):
    h.clear_answers()
    h.answers(look_ans=look_ans or look(shows="a roof with four newer slates"), judge_ans=judge(*rows))
    return h.call("request_assessment", cid)


def _prompts(h, role, kind):
    return [x for x in h.prompts if x["role"] == role and x["kind"] == kind]


# ---- the calibration image itself ---------------------------------------------------------------------

@pytest.mark.parametrize("code", ["012345", "678901", "999999", "100000"])
def test_the_calibration_image_is_a_valid_png_that_reads_back(h, code):
    png = h.m._canary_png(code)
    assert png[:4] == bytes([0x89, 0x50, 0x4E, 0x47])
    assert read_canary(png) == code, "every chunk CRC and the zlib stream were checked on the way"
    assert len(png) < 60_000


def test_the_calibration_code_is_fixed_for_one_assessment_and_differs_between_them(h):
    a, b = h.m._canary_code("KW-0001|0|abc"), h.m._canary_code("KW-0001|1|abc")
    assert a == h.m._canary_code("KW-0001|0|abc") and a != b
    assert len(a) == 6 and a.isdigit() and "0" not in a, "no zero: a numeric answer would drop a leading one"


def test_no_filer_can_shape_the_calibration_code(h):
    """The code used to depend only on public things the last filer fixed (the case, the round, the files), so a
    filer could pad a file until the code came out as something a model that sees nothing would guess. It now
    also depends on the moment and the sender of the request for the assessment."""
    cid, p, d = _case(h)
    case, t = h.view("get_case", cid), h.view("get_terms", cid, 1)
    S.sender = CLAIMANT
    first = h.c._context(case, t)["canary_seed"]
    assert first == h.c._context(case, t)["canary_seed"], "identical on every node within one request"
    h.later(1)
    later = h.c._context(case, t)["canary_seed"]
    S.sender = RESPONDENT
    other_sender = h.c._context(case, t)["canary_seed"]
    assert len({first, later, other_sender}) == 3
    assert len({h.m._canary_code(x) for x in (first, later, other_sender)}) == 3


@pytest.mark.parametrize("mode", ["sees-number", "sees-spaced"])
def test_a_model_that_answers_the_digits_as_a_number_or_spaced_out_still_counts_as_seeing(h, mode):
    cid, p, d = _case(h)
    h.sight(leader=mode, validator=mode)
    out = _ask(h, cid, [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])])
    assert out["overall"] == "SUPPORTED" and _prompts(h, "validator", "look")


def test_checksums_written_by_hand_match_the_standard_ones(h):
    import zlib
    data = bytes(range(256)) * 300
    assert h.m._crc32(data) == zlib.crc32(data) and h.m._adler32(data) == zlib.adler32(data)


# ---- who may lead -----------------------------------------------------------------------------------------

@pytest.mark.parametrize("mode", ["blind", "inventing"])
def test_a_node_that_cannot_really_see_cannot_lead_a_case_with_images(h, mode):
    cid, p, d = _case(h)
    h.sight(leader=mode)
    with pytest.raises(Exception, match="did not agree"):
        _ask(h, cid, [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])])
    assert h.view("get_case", cid)["state"] == "OPEN", "nothing was written"
    assert any("the leader's assessment failed" in x for x in h.prints)
    assert not _prompts(h, "leader", "look"), "it never examined, or pretended to examine, an image"


def test_a_case_with_no_images_needs_no_calibration(h):
    cid = h.opened(allowed=["TEXT_DOCUMENT"], required=[])
    d = h.doc(cid, by=RESPONDENT, text="Respondent: the contractor finished the listed work on 25 September.")
    c = h.doc(cid, by=CLAIMANT, doc_type="CONTRACTOR_STATEMENT", text="Contractor: all listed work was finished.")
    h.ready_all(cid)
    h.sight(leader="blind", validator="blind")
    out = _ask(h, cid, [crit("C1", "SUPPORTED", [c, d]), crit("C2", "SUPPORTED", [c, d])])
    assert out["overall"] == "SUPPORTED"
    assert not [x for x in h.prompts if x["kind"] == "sight"]
    dec = h.view("get_decision", out["decision_id"])
    assert dec["calibrated"] is False and dec["observations"] == []


# ---- what a validator that cannot see does ---------------------------------------------------------------

@pytest.mark.parametrize("mode", ["blind", "inventing"])
def test_a_validator_that_cannot_see_reads_the_leaders_notes_and_never_its_own_invention(h, mode):
    cid, p, d = _case(h)
    h.sight(validator=mode)
    out = _ask(h, cid, [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])])
    assert out["overall"] == "SUPPORTED"
    assert not _prompts(h, "validator", "look"), "it did not examine images it cannot receive"
    v = _prompts(h, "validator", "judge")[0]["prompt"]
    assert "the leading validator describes it as" in v and "a roof with four newer slates" in v
    assert "what your examination saw" not in v
    dec = h.view("get_decision", out["decision_id"])
    assert dec["calibrated"] is True and dec["seen_ids"] == [p]


def test_a_validator_that_can_see_examines_every_image_itself(h):
    cid, p, d = _case(h)
    _ask(h, cid, [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])])
    assert _prompts(h, "validator", "look")
    v = _prompts(h, "validator", "judge")[0]["prompt"]
    assert "what your examination saw" in v and "the leading validator describes it as" not in v


def test_a_blind_validator_still_refuses_a_supported_finding_it_would_not_make(h):
    cid, p, d = _case(h)
    h.sight(validator="blind")
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])),
              validator_judge=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "INSUFFICIENT", [], adequate=False)))
    with pytest.raises(Exception, match="did not agree"):
        h.call("request_assessment", cid)


def test_borrowed_notes_are_cut_to_the_fixed_shape_before_a_validator_reads_them(h):
    cid, p, d = _case(h)
    h.sight(validator="blind")
    from conftest import S
    S.forged.append({"raw": {"criteria": [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])],
                             "instructions_found": [], "limitations": [], "seen_ids": [p, "E-9999", 7]},
                     "observations": [{"evidence_id": p, "shows": "x" * 5000, "text": ["line"] * 99, "extra": {"a": 1}},
                                      {"evidence_id": "E-9999", "shows": "not on this case"}]})
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [p, d])))
    with pytest.raises(Exception, match="did not agree"):
        h.call("request_assessment", cid)  # the leader's list of images seen is malformed
    v = _prompts(h, "validator", "judge")[0]["prompt"]
    assert "x" * 401 not in v and "E-9999" not in v


# ---- no decision, no movement -----------------------------------------------------------------------------

def test_a_lapse_returns_the_held_sum_to_whoever_deposited_it(h):
    cid = h.opened(funder="CLAIMANT")
    h.photo(cid, tag="lapse-claimant-funded")
    h.later(3600 + 3 * 86400)
    h.call("lapse_case", cid, by=STRANGER)
    c = h.view("get_case", cid)
    assert c["state"] == "LAPSED" and c["settlement"]["to_role"] == "DEPOSITOR"
    assert h.credit(CLAIMANT) == 2 * GEN and h.credit(RESPONDENT) == 0
    h.conserved()


def test_evidence_that_was_never_examined_does_not_establish_the_claim(h):
    """A leader that read the calibration image and still saw none of the evidence: the files, not the network.
    A claimant who deposited the sum and filed a photograph nobody can open does not get the deposit back for
    it. Only a case on which no decision at all was recorded returns the sum to its depositor."""
    cid = h.opened(funder="CLAIMANT", allowed=["PHOTO"], required=[])
    h.photo(cid, tag="never-seen")
    h.ready_all(cid)
    h.clear_answers()
    h.answers(look_ans=look(seen=False), judge_ans=judge(crit("C1", "SUPPORTED", []), crit("C2", "SUPPORTED", [])))
    assert h.call("request_assessment", cid)["overall"] == "NOT_ASSESSED"
    assert h.view("get_decision", h.view("get_case", cid)["standing"])["calibrated"] is True
    h.later(3600)
    out = h.call("finalize", cid, by=STRANGER)
    assert out["overall"] == "NOT_ASSESSED" and out["settlement"]["to_role"] == "RESPONDENT"
    assert h.credit(RESPONDENT) == 2 * GEN and h.credit(CLAIMANT) == 0
    h.conserved()



def test_an_image_reported_seen_with_nothing_described_was_not_seen(h):
    cid, p, d = _case(h)
    _ask(h, cid, [crit("C1", "SUPPORTED", [p, d]), crit("C2", "SUPPORTED", [d])], look_ans=look(shows=""))
    dec = h.view("get_decision", h.view("get_case", cid)["standing"])
    assert dec["unseen_ids"] == [p] and dec["seen_ids"] == []
    assert dec["criteria"][0]["floors"] == ["F5"] and dec["criteria"][0]["basis"] == [d]


def test_a_transcript_that_was_cut_says_so_to_everyone_who_reads_it(h):
    """A page of more lines than the record holds is noted as cut: in the record, in the judge's prompt, and in
    the notes a validator that cannot see borrows from the leader."""
    cid = h.opened(allowed=["PHOTO", "DOCUMENT_PAGE", "TEXT_DOCUMENT"])
    page = h.call("submit_image", cid, json.dumps({"kind": "DOCUMENT_PAGE", "doc_type": "INSPECTION_REPORT"}),
                  jpeg("long-page"))["evidence_id"]
    photo = h.photo(cid, tag="short-photo")
    h.ready_all(cid)
    lines = [f"Line {i} of the inspection report." for i in range(45)]
    h.clear_answers()
    h.sight(validator="blind")
    h.answers(look_ans=look_by({"long-page": {"shows": "a typed report", "text": lines},
                                "short-photo": {"shows": "a roof", "text": ["NORTH FACE"]}}),
              judge_ans=judge(crit("C1", "SUPPORTED", [photo, page]), crit("C2", "SUPPORTED", [page, photo])))
    out = h.call("request_assessment", cid)
    notes = {o["evidence_id"]: o for o in h.view("get_decision", out["decision_id"])["observations"]}
    assert notes[page]["text"] == lines[:30] and notes[page]["text_cut"] is True
    assert notes[photo]["text"] == ["NORTH FACE"] and notes[photo]["text_cut"] is False
    for role in ("leader", "validator"):
        j = _prompts(h, role, "judge")[-1]["prompt"]
        assert j.count("this transcript was cut at the record's limit") == 1, role
