"""Fixtures the web tests check against, generated from the contract itself.

1. Canonical JSON: values and the exact string and sha256 Python's _canon
   produces, so the browser's canonical() is proved byte for byte, including
   DEL, control characters, non-BMP characters and key order.
2. A real receipt from the direct harness, with the digest the contract
   computed.
3. Act availability: for many case states and every role, whether the
   contract actually accepts each act. web/lib/acts.ts must agree on every
   one: the app offers exactly what the chain allows.
4. The contract's public methods, with their parameters and which take
   value, so every call the app composes can be held to them.

    python scripts/web_fixtures.py   writes web/tests/fixtures/*.json
"""

import copy
import hashlib
import json
import pathlib
import sys
from datetime import timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "direct"))

import conftest as cf  # noqa: E402

OUT = ROOT / "web" / "tests" / "fixtures"
GEN = cf.GEN
WHO = {"CLAIMANT": cf.CLAIMANT, "RESPONDENT": cf.RESPONDENT, "INSPECTOR": cf.INSPECTOR, "STRANGER": cf.STRANGER}


def canon_fixtures(h):
    values = [
        {"b": 1, "a": [3, 2, 1], "c": {"z": None, "y": True, "x": False}},
        {"text": "plain ascii, punctuation: <>&'\" and a back\\slash"},
        {"del": "a" + chr(0x7F) + "b", "c1": "x" + chr(0x85) + "y", "tab": "a\tb\nc\rd" + chr(8) + chr(12)},
        {"accents": "caf" + chr(0xE9) + " na" + chr(0xEF) + "ve", "cjk": chr(0x4E2D) + chr(0x6587),
         "emoji": chr(0x1F3E0), "sep": chr(0x2028) + chr(0x2029)},
        {chr(0xE9): 1, "z": 2, "A": 3, "a": 4, "_": 5, "0": 6},
        [{"n": 0}, {"n": -12}, {"n": 2 ** 40}, "", [], {}],
    ]
    out = []
    for v in values:
        s = h.m._canon(v)
        out.append({"value": v, "canonical": s, "sha256": hashlib.sha256(s.encode("ascii")).hexdigest()})
    return out


def receipt_fixture(h):
    cid = h.opened(inspector=cf.INSPECTOR)
    p = h.photo(cid, tag="fx-roof", declared_capture="25 September 2026, 15:42" + chr(0x7F))
    d = h.doc(cid, by=cf.RESPONDENT, text="Inspection: the loft is dry and the slates are new. " + chr(0xE9))
    h.ready_all(cid, inspector=cf.INSPECTOR)
    h.clear_answers()
    both = cf.judge(cf.crit("C1", "SUPPORTED", [p, d]), cf.crit("C2", "SUPPORTED", [p, d]))
    h.answers(look_ans=cf.look(), judge_ans=both)
    h.call("request_assessment", cid)
    h.later(3600)
    h.call("finalize", cid, by=cf.STRANGER)
    return json.loads(h.c.get_receipt(cid))


def _snapshot(h):
    return copy.deepcopy(h.c.__dict__), cf.S.balance, list(cf.S.transfers), cf.S.now


def _restore(h, snap):
    state, balance, transfers, now = snap
    h.c.__dict__.clear()
    h.c.__dict__.update(copy.deepcopy(state))
    cf.S.balance, cf.S.transfers, cf.S.now = balance, transfers, now


def _try(h, method, args, by, value=0, answers=None):
    """Whether the contract accepts this act now. Leaves no trace either way."""
    snap = _snapshot(h)
    try:
        if answers:
            h.clear_answers()
            h.answers(**answers)
        out = h.call(method, *args, by=by, value=value)
        ok = not (isinstance(out, dict) and out.get("refused"))
    except cf.Refused:
        ok = False
    finally:
        _restore(h, snap)
    return ok


ANSWERS = {"look_ans": cf.look(), "judge_ans": cf.judge(cf.crit("C1", "INSUFFICIENT", [], adequate=False),
                                                       cf.crit("C2", "INSUFFICIENT", [], adequate=False))}


def probe(h, cid, label):
    """Every act for every role in this state, as the contract judges it."""
    c = json.loads(h.c.get_case(cid))
    version = c["accepted_version"] or c["version"]
    t = json.loads(h.c.get_terms(cid, version))
    d = json.loads(h.c.get_decision(c["standing"])) if c["standing"] else None
    evidence = json.loads(h.c.get_case_evidence(cid))
    rows = []
    for role, addr in WHO.items():
        owed = int(json.loads(h.c.get_credit(addr))["owed"])
        fixed = ("version", "case_id", "published_at", "digest", "rules", "claimant")
        revised = {k: v for k, v in json.loads(h.c.get_terms(cid, version)).items() if k not in fixed}
        revised["title"] = revised["title"] + " (revised)"
        k = len(evidence)
        acts = {
            "revise": _try(h, "revise_terms", [cid, json.dumps(revised)], addr),
            "accept": _try(h, "accept_case", [cid, t["digest"]], addr),
            "decline": _try(h, "decline_case", [cid, ""], addr),
            "withdrawCase": _try(h, "withdraw_case", [cid], addr),
            "acceptInspector": _try(h, "accept_inspector", [cid, t["digest"]], addr),
            "fund": _try(h, "fund_case", [cid], addr, value=int(t["held_sum_wei"]) or 1),
            "expire": _try(h, "expire_case", [cid], addr),
            "file:PHOTO": _try(h, "submit_image", [cid, json.dumps({"kind": "PHOTO"}), cf.jpeg(f"probe-{label}-{k}")],
                               addr),
            "file:TEXT_DOCUMENT": _try(h, "submit_text", [cid, json.dumps({"doc_type": "OTHER_RECORD"}),
                                                          f"A probe document for {label} number {k}."], addr),
            "ready": _try(h, "mark_ready", [cid], addr),
            "assess": _try(h, "request_assessment", [cid], addr, answers=ANSWERS),
            "lapse": _try(h, "lapse_case", [cid], addr),
            "challenge": _try(h, "challenge", [cid, "A reason long enough to count."], addr,
                              value=int(t["challenge_bond_wei"])),
            "readjudicate": _try(h, "readjudicate", [cid], addr, answers=ANSWERS),
            "closeChallenge": _try(h, "close_challenge", [cid], addr),
            "finalize": _try(h, "finalize", [cid], addr),
            "withdraw": _try(h, "withdraw", [], addr),
        }
        now_ms = int(cf.S.now.timestamp() * 1000)
        rows.append({"label": f"{label} as {role.lower()}", "case": c, "terms": t, "decision": d,
                     "evidence": evidence, "addr": addr, "now": now_ms, "owed": str(owed), "expected": acts})
    return rows


def acts_fixtures():
    rows = []
    h = cf.Harness()
    # A draft with an inspector and a held sum, through every opening step.
    cid = h.open(inspector=cf.INSPECTOR)
    rows += probe(h, cid, "draft awaiting acceptance")
    h.accept(cid)
    rows += probe(h, cid, "draft accepted, inspector pending, unfunded")
    h.call("accept_inspector", cid, h.digest(cid), by=cf.INSPECTOR)
    rows += probe(h, cid, "draft accepted, unfunded")
    h.fund(cid)
    rows += probe(h, cid, "open, nothing filed")
    p = h.photo(cid, tag="acts-roof")
    rows += probe(h, cid, "open with a photograph")
    h.ready_all(cid, inspector=cf.INSPECTOR)
    rows += probe(h, cid, "open, everyone ready")
    h.later(3600)
    rows += probe(h, cid, "open, evidence period over")
    h.later(3 * 86400)
    rows += probe(h, cid, "open, lapse grace over")
    h.later(-(3 * 86400))
    h.clear_answers()
    h.answers(look_ans=cf.look(), judge_ans=cf.judge(cf.crit("C1", "SUPPORTED", [p]), cf.crit("C2", "SUPPORTED", [p])))
    h.call("request_assessment", cid)
    rows += probe(h, cid, "decided supported, window open")
    h.call("challenge", cid, "The respondent disputes the photograph.", by=cf.RESPONDENT, value=GEN // 10)
    rows += probe(h, cid, "under challenge, filing open")
    h.photo(cid, by=cf.RESPONDENT, tag="acts-new")
    h.later(3600)
    rows += probe(h, cid, "under challenge, new evidence brought, the other side may still answer")
    h.later(3600)
    rows += probe(h, cid, "under challenge, new evidence brought, filing closed")
    h.later(3 * 86400)
    rows += probe(h, cid, "under challenge, readjudication window closed")
    h.call("close_challenge", cid, by=cf.STRANGER)
    rows += probe(h, cid, "decided, challenge closed")
    h.call("finalize", cid, by=cf.STRANGER)
    rows += probe(h, cid, "final")

    # Not assessed: asked again by the side it went against, or challenged by it.
    h2 = cf.Harness()
    c2 = h2.opened(allowed=["PHOTO"], required=[])
    h2.photo(c2, tag="na-acts")
    h2.ready_all(c2)
    blind = {"look_ans": cf.look(seen=False),
             "judge_ans": cf.judge(cf.crit("C1", "SUPPORTED", []), cf.crit("C2", "SUPPORTED", []))}
    h2.clear_answers()
    h2.answers(**blind)
    h2.call("request_assessment", c2)
    rows += probe(h2, c2, "decided not assessed")
    h2.clear_answers()
    h2.answers(**blind)
    h2.call("request_assessment", c2)
    rows += probe(h2, c2, "decided not assessed, the claimant has asked again")

    # Each side may ask again once: a turn the respondent took leaves the claimant's.
    h7 = cf.Harness()
    c7 = h7.opened()
    p7 = h7.photo(c7, tag="turns-roof")
    h7.photo(c7, by=cf.RESPONDENT, tag="turns-never-opens")
    h7.ready_all(c7)
    for by, supported, label in ((cf.CLAIMANT, True, "decided supported with the respondent's image unseen"),
                                 (cf.RESPONDENT, False, "asked again by the respondent, now against the claimant"),
                                 (cf.CLAIMANT, True, "asked again by both sides")):
        h7.clear_answers()
        rows7 = ([cf.crit("C1", "SUPPORTED", [p7]), cf.crit("C2", "SUPPORTED", [p7])] if supported else
                 [cf.crit("C1", "INSUFFICIENT", [], adequate=False), cf.crit("C2", "INSUFFICIENT", [], adequate=False)])
        h7.answers(look_ans=cf.look_by({"turns-never-opens": {"seen": False}},
                                       default={"seen": True, "shows": "a roof"}),
                   judge_ans=cf.judge(*rows7))
        h7.call("request_assessment", c7, by=by)
        rows += probe(h7, c7, label)

    # A decision that could not see one image: the side it went against may ask again.
    h5 = cf.Harness()
    c5 = h5.opened()
    h5.photo(c5, tag="unseen-acts")
    h5.doc(c5, by=cf.RESPONDENT, text="The respondent disputes that the repair was done.")
    h5.ready_all(c5)
    h5.clear_answers()
    h5.answers(look_ans=cf.look(seen=False), judge_ans=cf.judge(cf.crit("C1", "INSUFFICIENT", [], adequate=False),
                                                                cf.crit("C2", "INSUFFICIENT", [], adequate=False)))
    h5.call("request_assessment", c5)
    rows += probe(h5, c5, "decided with an image nobody saw")

    # An open case with nothing filed, once the evidence period is over: either party can have that recorded.
    h6 = cf.Harness()
    c6 = h6.opened(required=[])
    h6.later(3600)
    rows += probe(h6, c6, "open, nothing filed, evidence period over")

    # A draft past its seven days, and a challenge with nothing new brought.
    h3 = cf.Harness()
    c3 = h3.open()
    cf.S.now = cf.S.now + timedelta(days=8)
    rows += probe(h3, c3, "draft past seven days")
    c4 = h3.opened()
    h3.photo(c4, tag="nb-acts")
    h3.ready_all(c4)
    h3.clear_answers()
    h3.answers(look_ans=cf.look(), judge_ans=cf.judge(cf.crit("C1", "INSUFFICIENT", [], adequate=False),
                                                      cf.crit("C2", "INSUFFICIENT", [], adequate=False)))
    h3.call("request_assessment", c4)
    h3.call("challenge", c4, "The claimant disputes the finding.", by=cf.CLAIMANT, value=GEN // 10)
    h3.later(3600)
    rows += probe(h3, c4, "under challenge, nothing new brought")
    return rows


def image_fixtures(h):
    """Image files and the contract's verdict on each ('' when it accepts), so the browser's own check of an
    image before signing is proved to agree with the contract's."""
    seg, chunk = cf.jpeg_segment, cf.png_chunk
    good = cf.jpeg("fixture")
    cases = {
        "a plain JPEG": good,
        "a JPEG with a colour profile": cf.jpeg("icc", extra=seg(0xE2, b"ICC_PROFILE")),
        "a JPEG with camera data": cf.jpeg("exif", extra=seg(0xE1, b"Exif" + bytes(2) + b"GPS")),
        "a JPEG with an editor record": cf.jpeg("iptc", extra=seg(0xED, b"Photoshop 3.0")),
        "a JPEG with a comment": cf.jpeg("com", extra=seg(0xFE, b"a comment")),
        "a JPEG that does not end": good[:-2],
        "a JPEG with bytes after its end": good + b"more",
        "a JPEG with no JFIF header": good[:2] + seg(0xE1, b"Exif" + bytes(2)) + good[20:],
        "a JPEG too small": cf.jpeg("tiny", width=8, height=8),
        "a JPEG too large": cf.jpeg("huge", width=5000, height=600),
        "a lossless JPEG": cf.jpeg("lossless", extra=seg(0xC3, bytes(8))),
        "a JPEG with no frame": good[:20] + seg(0xDA, bytes(6)) + b"scan" + bytes([0xFF, 0xD9]),
        "a JPEG with a broken segment": good[:20] + bytes([0xFF, 0xDB, 0xFF, 0xFF]) + bytes([0xFF, 0xD9]),
        "a JPEG with two frames": cf.jpeg("twice", extra=seg(0xC0, bytes([8, 1, 0, 1, 0, 1, 1, 0x11, 0]))),
        "a plain PNG": cf.png("fixture"),
        "a PNG with a text chunk": cf.png("text", extra=chunk(b"tEXt", b"Comment" + bytes(1) + b"hello")),
        "a PNG with camera data": cf.png("exif", extra=chunk(b"eXIf", b"MM")),
        "a PNG with bytes after its end": cf.png("trail", tail=b"x"),
        "a PNG too wide": cf.png("wide", width=5000),
        "a PNG with no image data": cf.png("nodata")[:33] + chunk(b"IEND", b""),
        "a truncated PNG": cf.png("cut")[:40],
        "a GIF": b"GIF89a" + bytes(40),
        "nothing like an image": b"<svg onload=alert(1)>",
    }
    import base64
    return [{"name": k, "base64": base64.b64encode(v).decode("ascii"), "problem": h.m._image_problem(v)}
            for k, v in cases.items()]


def schema_fixture():
    """The contract's public methods, read from its source: each write with its
    parameters and whether it takes value, each view with its parameters."""
    import ast
    tree = ast.parse((ROOT / "contracts" / "keywitness.py").read_text(encoding="ascii"))
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "KeyWitness")
    out = {"writes": {}, "views": {}}
    for fn in cls.body:
        if not isinstance(fn, ast.FunctionDef):
            continue
        marks = [ast.unparse(d) for d in fn.decorator_list]
        params = [a.arg for a in fn.args.args[1:]]
        if "gl.public.view" in marks:
            out["views"][fn.name] = params
        elif "gl.public.write" in marks or "gl.public.write.payable" in marks:
            out["writes"][fn.name] = {"params": params, "payable": "gl.public.write.payable" in marks}
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    h = cf.Harness()
    (OUT / "canon.json").write_text(json.dumps(canon_fixtures(h), indent=1, ensure_ascii=True) + "\n",
                                    encoding="ascii", newline="\n")
    (OUT / "receipt.json").write_text(json.dumps(receipt_fixture(cf.Harness()), indent=1, ensure_ascii=True) + "\n",
                                      encoding="ascii", newline="\n")
    images = image_fixtures(cf.Harness())
    (OUT / "images.json").write_text(json.dumps(images, indent=1, ensure_ascii=True) + "\n", encoding="ascii",
                                     newline="\n")
    rows = acts_fixtures()
    (OUT / "acts.json").write_text(json.dumps(rows, indent=1, ensure_ascii=True) + "\n", encoding="ascii", newline="\n")
    (OUT / "schema.json").write_text(json.dumps(schema_fixture(), indent=1, sort_keys=True) + "\n", encoding="ascii",
                                     newline="\n")
    print(f"canon, receipt, {len(images)} images and {len(rows)} act rows written to {OUT}")


if __name__ == "__main__":
    main()
