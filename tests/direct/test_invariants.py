"""Invariants: post-terminal actions, concurrency, and a randomized
walk that checks conservation after every action and that nothing resurrects."""

import json
import random

import pytest

from conftest import CLAIMANT, GEN, INSPECTOR, RESPONDENT, SECOND, STRANGER, Refused, crit, jpeg, judge, look, terms

TERMINAL = {"FINAL", "DECLINED", "WITHDRAWN", "EXPIRED", "LAPSED"}


def _final(h):
    cid = h.opened()
    p = h.photo(cid, tag="t-final")
    h.ready_all(cid)
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    h.later(3600)
    h.call("finalize", cid, by=STRANGER)
    return cid, p


def test_post_terminal_actions_are_all_refused(h):
    cid, p = _final(h)
    before = h.view("get_case", cid)
    attempts = [
        ("submit_image", (cid, json.dumps({"kind": "PHOTO"}), jpeg("late-1")), CLAIMANT, 0),
        ("submit_text", (cid, json.dumps({"doc_type": "INVOICE"}), "a late invoice text"), RESPONDENT, 0),
        ("mark_ready", (cid,), CLAIMANT, 0),
        ("request_assessment", (cid,), CLAIMANT, 0),
        ("readjudicate", (cid,), STRANGER, 0),
        ("close_challenge", (cid,), STRANGER, 0),
        ("finalize", (cid,), STRANGER, 0),
        ("lapse_case", (cid,), STRANGER, 0),
        ("expire_case", (cid,), STRANGER, 0),
        ("withdraw_case", (cid,), CLAIMANT, 0),
        ("decline_case", (cid, "too late now"), RESPONDENT, 0),
        ("revise_terms", (cid, json.dumps(terms())), CLAIMANT, 0),
        ("accept_case", (cid, "0" * 64), RESPONDENT, 0),
    ]
    for method, args, by, value in attempts:
        with pytest.raises(Refused):
            h.call(method, *args, by=by, value=value)
    # Payable writes refuse by returning the value as credit, never by raising.
    out = h.call("challenge", cid, "a challenge after the end", by=RESPONDENT, value=GEN // 10)
    assert out["refused"]
    out = h.call("fund_case", cid, by=RESPONDENT, value=2 * GEN)
    assert out["refused"]
    after = h.view("get_case", cid)
    assert after["state"] == "FINAL" and after["decisions"] == before["decisions"]
    h.conserved()


def test_two_cases_never_share_a_held_sum(h):
    a = h.opened()
    b = h.opened()
    pa = h.photo(a, tag="a-photo")
    pb = h.photo(b, tag="b-photo")
    h.ready_all(a)
    h.ready_all(b)
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [pa]), crit("C2", "SUPPORTED", [pa])))
    h.call("request_assessment", a)
    h.clear_answers()
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "NOT_ESTABLISHED", [pb]),
                                               crit("C2", "SUPPORTED", [pb])))
    h.call("request_assessment", b)
    h.later(3600)
    h.call("finalize", a, by=STRANGER)
    h.call("finalize", b, by=STRANGER)
    assert h.credit(CLAIMANT) == 2 * GEN and h.credit(RESPONDENT) == 2 * GEN
    h.conserved()


def test_two_challenges_cannot_race_one_case(h):
    cid = h.opened()
    p = h.photo(cid, tag="race")
    h.ready_all(cid)
    h.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    first = h.call("challenge", cid, "first challenge, with reasons", by=RESPONDENT, value=GEN // 10)
    second = h.call("challenge", cid, "second challenge, with reasons", by=RESPONDENT, value=GEN // 10)
    assert first["state"] == "UNDER_CHALLENGE" and second["refused"]
    h.conserved()


# ---- the randomized walk --------------------------------------------------------------------

ACTORS = [CLAIMANT, RESPONDENT, INSPECTOR, STRANGER, SECOND]


def _random_terms(rng):
    held = rng.choice([0, GEN // 50, GEN])
    return terms(
        inspector=rng.choice(["", INSPECTOR]),
        held_sum_wei=str(held), funder=rng.choice(["CLAIMANT", "RESPONDENT"]) if held else "",
        required=rng.choice([[], [{"type": "PHOTO", "min": 1}], [{"type": "PHOTO", "min": 2}]]),
        evidence_period_seconds=rng.choice([600, 3600]),
        challenge_window_seconds=rng.choice([600, 3600]),
        challenge_evidence_seconds=rng.choice([600, 3600]),
    )


def _random_answers(h, rng, cid):
    ids = [e["evidence_id"] for e in h.view("get_case_evidence", cid)] or ["E-0001"]
    rows = []
    for c in ("C1", "C2"):
        f = rng.choice(["SUPPORTED", "NOT_ESTABLISHED", "CONFLICTING", "INSUFFICIENT", "NONSENSE"])
        rows.append(crit(c, f, rng.sample(ids, k=min(len(ids), rng.randint(0, 2))),
                         rng.sample(ids, k=min(len(ids), rng.randint(0, 1))), adequate=rng.random() < 0.8))
    h.clear_answers()
    h.answers(look_ans=look(seen=rng.random() < 0.85), judge_ans=judge(*rows))


@pytest.mark.parametrize("seed", range(12))
def test_randomized_walk_conserves_value_and_never_resurrects(h, seed):
    rng = random.Random(seed)
    cases = []
    terminal_seen = {}
    states_seen = set()
    for step in range(220):
        roll = rng.random()
        try:
            if roll < 0.08 or not cases:
                if len(cases) < 8:
                    t = _random_terms(rng)
                    cases.append((h.call("open_case", json.dumps(t), by=CLAIMANT)["case_id"], t))
            else:
                cid, t = rng.choice(cases)
                action = rng.choice(["accept", "inspector", "fund", "photo", "doc", "ready", "assess", "challenge",
                                     "readjudicate", "close", "finalize", "lapse", "expire", "withdraw_case",
                                     "decline", "withdraw", "later"])
                who = rng.choice(ACTORS)
                if action == "accept":
                    h.call("accept_case", cid, h.digest(cid), by=rng.choice([RESPONDENT, who]))
                elif action == "inspector":
                    h.call("accept_inspector", cid, h.digest(cid), by=rng.choice([INSPECTOR, who]))
                elif action == "fund":
                    h.call("fund_case", cid, by=rng.choice([CLAIMANT, RESPONDENT, who]),
                           value=rng.choice([int(t["held_sum_wei"]), GEN // 7, 0]))
                elif action == "photo":
                    h.call("submit_image", cid, json.dumps({"kind": "PHOTO"}), jpeg(f"w{seed}-{step}"),
                           by=rng.choice([CLAIMANT, RESPONDENT, INSPECTOR, who]))
                elif action == "doc":
                    h.call("submit_text", cid, json.dumps({"doc_type": "INSPECTION_REPORT"}),
                           f"walk document {seed}-{step} with enough words", by=rng.choice([CLAIMANT, RESPONDENT, who]))
                elif action == "ready":
                    h.call("mark_ready", cid, by=rng.choice([CLAIMANT, RESPONDENT, INSPECTOR]))
                elif action == "assess":
                    _random_answers(h, rng, cid)
                    h.call("request_assessment", cid, by=rng.choice([CLAIMANT, RESPONDENT, who]))
                elif action == "challenge":
                    h.call("challenge", cid, "a challenge reason that is long enough",
                           by=rng.choice([CLAIMANT, RESPONDENT, who]), value=rng.choice([GEN // 10, GEN // 9]))
                elif action == "readjudicate":
                    _random_answers(h, rng, cid)
                    h.call("readjudicate", cid, by=who)
                elif action == "close":
                    h.call("close_challenge", cid, by=who)
                elif action == "finalize":
                    h.call("finalize", cid, by=who)
                elif action == "lapse":
                    h.call("lapse_case", cid, by=who)
                elif action == "expire":
                    h.call("expire_case", cid, by=who)
                elif action == "withdraw_case":
                    h.call("withdraw_case", cid, by=rng.choice([CLAIMANT, who]))
                elif action == "decline":
                    h.call("decline_case", cid, "not agreed", by=rng.choice([RESPONDENT, who]))
                elif action == "withdraw":
                    h.call("withdraw", by=who)
                elif action == "later":
                    h.later(rng.choice([300, 700, 3600, 4 * 86400, 8 * 86400]))
        except Refused:
            pass
        except Exception as e:  # a consensus failure is a legitimate outcome of a round
            assert "did not agree" in str(e), repr(e)
        h.conserved()
        for cid, _ in cases:
            state = h.view("get_case", cid)["state"]
            states_seen.add(state)
            if cid in terminal_seen:
                assert state == terminal_seen[cid], f"{cid} left {terminal_seen[cid]} for {state}"
            elif state in TERMINAL:
                terminal_seen[cid] = state
    st = h.view("get_stats")
    assert int(st["held_wei"]) >= 0 and int(st["bonds_wei"]) >= 0 and int(st["owed_wei"]) >= 0


def test_the_walks_reach_every_state():
    """Across the seeds the walk visits every state at least once, so the
    invariants above were checked in all of them."""
    from conftest import Harness
    seen = set()
    for seed in range(12):
        h = Harness()
        rng = random.Random(1000 + seed)
        cases = []
        for step in range(300):
            try:
                if rng.random() < 0.1 or not cases:
                    if len(cases) < 6:
                        t = _random_terms(rng)
                        cases.append((h.call("open_case", json.dumps(t), by=CLAIMANT)["case_id"], t))
                    continue
                cid, t = rng.choice(cases)
                # Weighted toward progress so every case has a real chance to
                # reach the late states; the exits stay rare but present.
                kinds = ["accept", "inspector", "fund", "photo", "ready", "assess", "challenge", "close",
                         "readjudicate", "finalize", "lapse", "expire", "decline", "withdraw_case", "later"]
                weights = [6, 4, 5, 6, 6, 6, 3, 3, 4, 3, 1, 1, 1, 1, 3]
                step_kind = rng.choices(kinds, weights=weights)[0]
                if step_kind == "accept":
                    h.call("accept_case", cid, h.digest(cid), by=RESPONDENT)
                elif step_kind == "inspector":
                    h.call("accept_inspector", cid, h.digest(cid), by=INSPECTOR)
                elif step_kind == "fund":
                    who = CLAIMANT if t.get("funder") == "CLAIMANT" else RESPONDENT
                    h.call("fund_case", cid, by=who, value=int(t["held_sum_wei"]))
                elif step_kind == "photo":
                    h.call("submit_image", cid, json.dumps({"kind": "PHOTO"}), jpeg(f"s{seed}-{step}"),
                           by=rng.choice([CLAIMANT, RESPONDENT]))
                elif step_kind == "ready":
                    for who in (CLAIMANT, RESPONDENT, INSPECTOR):
                        try:
                            h.call("mark_ready", cid, by=who)
                        except Refused:
                            pass
                elif step_kind == "assess":
                    _random_answers(h, rng, cid)
                    h.call("request_assessment", cid, by=CLAIMANT)
                    if rng.random() < 0.7:
                        # Follow most decisions with a challenge (and often new
                        # evidence from the challenger) so the walk spends time in
                        # the challenge states the invariants must hold in.
                        for who in (CLAIMANT, RESPONDENT):
                            out = h.call("challenge", cid, "a challenge reason that is long enough", by=who,
                                         value=GEN // 10)
                            if isinstance(out, dict) and not out.get("refused") and rng.random() < 0.7:
                                h.call("submit_image", cid, json.dumps({"kind": "PHOTO"}),
                                       jpeg(f"c{seed}-{step}"), by=who)
                elif step_kind == "challenge":
                    for who in (CLAIMANT, RESPONDENT):
                        h.call("challenge", cid, "a challenge reason that is long enough", by=who, value=GEN // 10)
                elif step_kind == "close":
                    h.call("close_challenge", cid, by=STRANGER)
                elif step_kind == "readjudicate":
                    _random_answers(h, rng, cid)
                    h.call("readjudicate", cid, by=STRANGER)
                elif step_kind == "finalize":
                    h.call("finalize", cid, by=STRANGER)
                elif step_kind == "lapse":
                    h.call("lapse_case", cid, by=STRANGER)
                elif step_kind == "expire":
                    h.call("expire_case", cid, by=STRANGER)
                elif step_kind == "decline":
                    h.call("decline_case", cid, "not agreed here", by=RESPONDENT)
                elif step_kind == "withdraw_case":
                    h.call("withdraw_case", cid, by=CLAIMANT)
                elif step_kind == "later":
                    h.later(rng.choice([700, 700, 3600, 4 * 86400, 8 * 86400]))
            except Refused:
                pass
            except Exception as e:
                assert "did not agree" in str(e), repr(e)
            for cid, _ in cases:
                seen.add(h.view("get_case", cid)["state"])
            h.conserved()
    assert seen >= {"DRAFT", "OPEN", "DETERMINED", "UNDER_CHALLENGE", "FINAL", "DECLINED", "WITHDRAWN",
                    "EXPIRED", "LAPSED"}, seen
