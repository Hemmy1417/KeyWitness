"""Direct-mode harness for KeyWitness: the real contract module against a stub
`genlayer` that is as strict as the network where it matters.

VALIDATORS RUN. `gl.vm.run_nondet` runs the leader closure, then the validator
closure on the leader's result. A validator returning False fails the round
with nothing written, as on the network.

THE MODEL. `exec_prompt` answers from queues per prompt kind ("look" for the
image examination, "judge" for the criteria) and per role (leader, validator),
so a test can make two nodes read the same evidence differently. It enforces
GenVM's image rules on Studio Next: at most two images per prompt, each a PNG
or a JFIF-headed JPEG of at most 5 MB.

THE CLOCK. `h.at(iso)` sets the transaction datetime. Nothing moves on its own,
so both sides of every window are testable.

MONEY. `h.call(..., value=wei)` credits the contract balance BEFORE the method
runs and keeps it there even if the method raises: that is what the network
does with a payable write, and it is how a refusal that raises would strand
GEN. `_Payee.emit_transfer` debits the balance and records the transfer.

REVERT. A public write that raises restores every storage field, so a refusal
can never leave half a state behind.
"""

import copy
import importlib.util
import json
import pathlib
import sys
import types
import zlib
from datetime import datetime, timezone

import pytest
from eth_utils import to_checksum_address

CONTRACT_PATH = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "keywitness.py"

CLAIMANT = to_checksum_address("0x3f2536fd5c1ad0f1e8ea5591f36d731a6d51d911")
RESPONDENT = to_checksum_address("0x993ba6cae307feb5400b02083062e874f5fe6839")
INSPECTOR = to_checksum_address("0x54782bd558865f9c9b6dafc2660f5ea877220ed2")
STRANGER = to_checksum_address("0x4d25429512bdc4e2a1c3ec899705b369bfbdc29c")
SECOND = to_checksum_address("0x9c965e50e5f25f2660e9a8a1fd7e89a06655a3dd")
DEPLOYER = to_checksum_address("0x74328d4024fe926ee79a8b86311f986843777ace")
GEN = 10 ** 18


class NoAnswer(BaseException):
    """A test ran a prompt it queued no answer for. BaseException so nothing
    in the contract can swallow a harness mistake."""


class _UserError(Exception):
    def __init__(self, data):
        super().__init__(data)
        self.data = data

    def __str__(self):
        return str(self.data)


class _VMError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class _Return:
    def __init__(self, calldata):
        self.calldata = calldata


class _TreeMap(dict):
    def __class_getitem__(cls, item):
        return cls

    def get(self, k, default=None):
        return super().get(k, default)


class _U256(int):
    def __new__(cls, v):
        value = int(v)
        if value < 0:
            raise OverflowError("u256 cannot be negative")
        return super().__new__(cls, value)


class _Address:
    def __init__(self, v):
        text = str(v).strip()
        if not (text.startswith("0x") and len(text) == 42):
            raise ValueError("not an address")
        int(text[2:], 16)
        self.as_hex = to_checksum_address(text)

    def __str__(self):
        return self.as_hex


class _State:
    def __init__(self):
        self.reset()

    def reset(self):
        self.role = "leader"
        self.answers = {"look": {"leader": [], "validator": []}, "judge": {"leader": [], "validator": []}}
        self.calls = {"look": {"leader": 0, "validator": 0}, "judge": {"leader": 0, "validator": 0}}
        self.prompts = []
        self.prints = []
        self.transfers = []
        self.forged = []
        self.sight = {"leader": "sees", "validator": "sees"}
        self.now = datetime(2026, 10, 1, 9, 0, 0, tzinfo=timezone.utc)
        self.sender = CLAIMANT
        self.value = 0
        self.balance = 0


S = _State()


def _roundtrip(value):
    """Consensus serializes the leader's result: only plain data survives, and
    like GenVM's calldata encoder it refuses text UTF-8 cannot carry."""
    json.dumps(value, ensure_ascii=False).encode("utf-8")
    return json.loads(json.dumps(value))


def _run_nondet(leader_fn, validator_fn):
    if S.forged:
        forged = S.forged.pop(0)
        S.role = "validator"
        try:
            ok = validator_fn(_Return(forged))
        except Exception:
            ok = False
        finally:
            S.role = "leader"
        if not ok:
            raise _UserError("[LLM_ERROR] validators did not agree with the leader")
        return forged
    try:
        value = _roundtrip(leader_fn())
    except _UserError as failure:
        # A leader that fails hands the validators its failure, not a result.
        # They refuse it, the network rotates the leader, and if every leader
        # fails the transaction ends undetermined: nothing is written.
        S.role = "validator"
        try:
            ok = validator_fn(types.SimpleNamespace(error=str(failure.data)))
        except Exception:
            ok = False
        finally:
            S.role = "leader"
        if ok:
            raise
        raise _UserError("[LLM_ERROR] validators did not agree with the leader") from None
    S.role = "validator"
    try:
        ok = validator_fn(_Return(value))
    except Exception:
        ok = False
    finally:
        S.role = "leader"
    if not ok:
        raise _UserError("[LLM_ERROR] validators did not agree with the leader")
    return value


def _sniff_ok(img: bytes) -> bool:
    return img[:8] == b"\x89PNG\r\n\x1a\n" or img[:4] == b"\xff\xd8\xff\xe0"


def read_canary(png: bytes) -> str:
    """Read the calibration image the way an honest sighted model does: decode
    the PNG (checking every chunk's CRC and the zlib stream) and match the
    dot-matrix digits. The contract writes this PNG by hand, so this is also
    the proof that it is a valid image."""
    import zlib
    m = S.module
    assert png[:8] == bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), "not a PNG"
    pos, idat, width = 8, b"", 0
    while pos < len(png):
        size = int.from_bytes(png[pos:pos + 4], "big")
        tag, data = png[pos + 4:pos + 8], png[pos + 8:pos + 8 + size]
        assert zlib.crc32(tag + data) == int.from_bytes(png[pos + 8 + size:pos + 12 + size], "big"), "bad chunk crc"
        if tag == b"IHDR":
            width = int.from_bytes(data[:4], "big")
        if tag == b"IDAT":
            idat += data
        pos += 12 + size
    raw = zlib.decompress(idat)
    cell, stride = m.CANARY_CELL, width + 1
    out = ""
    for d in range(m.CANARY_DIGITS):
        x0 = (2 + d * 6) * cell
        rows = tuple("".join("1" if raw[((2 + r) * cell + cell // 2) * stride + 1 + x0 + c * cell + cell // 2] < 128
                             else "0" for c in range(5)) for r in range(7))
        out += next(k for k, v in m._FONT.items() if v == rows)
    return out


def _exec_prompt(prompt, response_format=None, images=None):
    prompt.encode("utf-8")  # GenVM encodes every prompt strictly; a lone surrogate fails the call
    if images and "calibration image" in prompt:
        # What Studio Next's routes do, measured: some read the image, some are
        # sent no image (the JSON call then errors), one invents what it sees.
        S.prompts.append({"role": S.role, "kind": "sight", "prompt": prompt, "images": len(images)})
        mode = S.sight[S.role]
        if mode == "blind":
            raise RuntimeError("invalid nondeterministic response: invalid JSON")
        if mode == "inventing":
            return {"digits": "000000"}
        code = read_canary(bytes(images[0]))
        if mode == "sees-number":
            return {"digits": int(code)}
        return {"digits": " ".join(code) if mode == "sees-spaced" else code}
    kind = "look" if images else "judge"
    if images is not None:
        if len(images) > 2:
            raise RuntimeError("TOO_MANY_IMAGES")
        for img in images:
            if len(img) > 5 * 1024 * 1024:
                raise RuntimeError("IMAGE_TOO_LARGE")
            if not _sniff_ok(bytes(img)):
                raise RuntimeError("INVALID_IMAGE")
    S.prompts.append({"role": S.role, "kind": kind, "prompt": prompt, "images": len(images or [])})
    queue = S.answers[kind][S.role] or S.answers[kind]["leader"]
    if not queue:
        raise NoAnswer(f"a {kind} prompt ran without a queued answer")
    idx = min(S.calls[kind][S.role], len(queue) - 1)
    S.calls[kind][S.role] += 1
    answer = queue[idx]
    if callable(answer):
        answer = answer(prompt, images)
    if isinstance(answer, BaseException):
        raise answer
    return answer if isinstance(answer, (dict, str)) else json.dumps(answer)


class _Payee:
    def __init__(self, addr):
        self.addr = str(addr)

    def emit_transfer(self, value, **kw):
        if kw:
            raise TypeError("emit_transfer takes no keyword besides value")
        wei = int(value)
        if wei > S.balance:
            raise RuntimeError("the contract cannot send more than it holds")
        S.balance -= wei
        S.transfers.append({"to": self.addr, "wei": wei})


def _contract_interface(cls):
    return _Payee


class _Public:
    class _Write:
        def __call__(self, fn):
            return _reverting(fn)

        def payable(self, fn):
            wrapped = _reverting(fn)
            wrapped._payable = True
            return wrapped

    view = staticmethod(lambda fn: fn)
    write = _Write()


def _reverting(fn):
    def wrapper(self, *args, **kwargs):
        snapshot = copy.deepcopy(self.__dict__)
        try:
            return fn(self, *args, **kwargs)
        except BaseException:
            self.__dict__.clear()
            self.__dict__.update(snapshot)
            raise
    wrapper.__name__ = fn.__name__
    wrapper._write = True
    return wrapper


class _Message:
    @property
    def sender_address(self):
        return _Address(S.sender)

    @property
    def value(self):
        return _U256(S.value)


class _Contract:
    """GenVM creates every annotated storage field before __init__ runs."""

    def __new__(cls, *args, **kwargs):
        obj = super().__new__(cls)
        for name, typ in getattr(cls, "__annotations__", {}).items():
            if typ is _TreeMap:
                setattr(obj, name, _TreeMap())
            elif typ is str:
                setattr(obj, name, "")
        return obj


def _install_stub():
    gl = types.ModuleType("genlayer")
    gl.contract = types.SimpleNamespace(Contract=_Contract)
    gl.storage = types.SimpleNamespace(TreeMap=_TreeMap)
    gl.public = _Public()
    gl.message = _Message()
    gl.vm = types.SimpleNamespace(UserError=_UserError, VMError=_VMError, Return=_Return, run_nondet=_run_nondet)
    gl.nondet = types.SimpleNamespace(exec_prompt=_exec_prompt)
    gl.evm = types.SimpleNamespace(contract_interface=_contract_interface)
    gltypes = types.ModuleType("genlayer.types")
    gltypes.Address = _Address
    gltypes.u256 = _U256
    sys.modules["genlayer"] = gl
    sys.modules["genlayer.types"] = gltypes


class _Clock(datetime):
    @classmethod
    def now(cls, tz=None):
        return S.now if tz is None else S.now.astimezone(tz)


def load_module():
    _install_stub()
    spec = importlib.util.spec_from_file_location("keywitness_under_test", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.datetime = _Clock
    module.print = lambda *a, **k: S.prints.append(" ".join(str(x) for x in a))
    return module


# ---- evidence bytes ----------------------------------------------------------------

def jpeg_segment(marker: int, body: bytes) -> bytes:
    return b"\xff" + bytes([marker]) + (len(body) + 2).to_bytes(2, "big") + body


def jpeg(tag: str = "a", size: int = 2000, width: int = 640, height: int = 480, extra: bytes = b"",
         tail: bytes = b"\xff\xd9") -> bytes:
    """A JPEG with the structure a decoder needs up to its first scan (JFIF
    header, a quantization table, a baseline frame, a Huffman table, the scan
    header), then `size` bytes that carry the tag in place of a real scan.
    `extra` goes between the header and the tables: a metadata segment, say."""
    head = (b"\xff\xd8" + jpeg_segment(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00") + extra
            + jpeg_segment(0xDB, b"\x00" + bytes(range(1, 65)))
            + jpeg_segment(0xC0, b"\x08" + height.to_bytes(2, "big") + width.to_bytes(2, "big") + b"\x01\x01\x11\x00")
            + jpeg_segment(0xC4, b"\x00" + bytes(16))
            + jpeg_segment(0xDA, b"\x01\x01\x00\x00\x3f\x00"))
    body = (tag.encode() * (size // max(1, len(tag)) + 1))[:size]
    return head + body + tail


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return len(data).to_bytes(4, "big") + kind + data + zlib.crc32(kind + data).to_bytes(4, "big")


def png(tag: str = "p", size: int = 600, width: int = 640, height: int = 480, extra: bytes = b"",
        tail: bytes = b"") -> bytes:
    """A PNG with a real header, one data chunk carrying the tag, and an end."""
    header = width.to_bytes(4, "big") + height.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    return (b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + extra
            + png_chunk(b"IDAT", (tag.encode() * size)[:size]) + png_chunk(b"IEND", b"") + tail)


# ---- model answers -------------------------------------------------------------------

def look(seen=True, shows="a ceiling with a dry repaired patch", text=None, dates=None, doubts="",
         quality="GOOD", unseen_ids=()):
    """An examination answer for whatever images the prompt carries. Images
    whose filed order puts them in `unseen_ids` are reported unseen."""
    def answer(prompt, images):
        n = len(images or [])
        rows = []
        for i in range(1, n + 1):
            rows.append({"n": i, "seen": seen, "shows": shows if seen else "", "text": text or [],
                         "dates": dates or [], "subject_doubts": doubts, "quality": quality})
        return {"images": rows}
    return answer


def look_by(mapping, default=None):
    """Per-image examination keyed by the tag inside each image's bytes (the
    examiner never sees evidence ids, so the harness cannot use them)."""
    def answer(prompt, images):
        rows = []
        for i, img in enumerate(images or [], start=1):
            blob = bytes(img)
            tag = next((k for k in mapping if k.encode() in blob), None)
            spec = mapping[tag] if tag else (default or {"seen": True, "shows": "a room"})
            rows.append({"n": i, "seen": spec.get("seen", True), "shows": spec.get("shows", ""),
                         "text": spec.get("text", []), "dates": spec.get("dates", []),
                         "subject_doubts": spec.get("subject_doubts", ""), "quality": spec.get("quality", "GOOD")})
        return {"images": rows}
    return answer


def crit(cid, finding, basis=(), contrary=(), adequate=True, missing=(), rationale="reasons"):
    """One criterion of a model's answer. Tests say what the finding rests on
    (basis) and what opposes it (contrary); the model names items relative to
    the criterion (supports, against), so NOT_ESTABLISHED swaps the two."""
    rests, opposes = list(basis), list(contrary)
    supports, against = (opposes, rests) if finding == "NOT_ESTABLISHED" else (rests, opposes)
    return {"id": cid, "rationale": rationale, "supports": supports, "against": against,
            "evidence_adequate": adequate, "finding": finding, "missing": list(missing)}


def judge(*rows, instructions=(), limitations=("capture times are not independently verified",)):
    return {"criteria": list(rows), "limitations": list(limitations), "instructions_found": list(instructions)}


# ---- terms ---------------------------------------------------------------------------

def terms(**over):
    base = {
        "title": "Roof leak repair before the deadline",
        "event_kind": "REPAIR_COMPLETED",
        "property_ref": "Riverside flat (synthetic)",
        "time_zone": "Europe/London",
        "deadline": "2026-10-03T17:00",
        "claim": "The listed roof leak repairs were completed before the maintenance deadline.",
        "criteria": [
            {"text": "Photographs show the repaired roof area after the work.", "needs_independent": False},
            {"text": "The listed repair tasks were all performed.", "needs_independent": False},
        ],
        "allowed": ["PHOTO", "TEXT_DOCUMENT", "DOCUMENT_PAGE", "VIDEO_FRAME"],
        "required": [{"type": "PHOTO", "min": 1}],
        "limitations": ["The assessment does not test the roof under rain."],
        "respondent": RESPONDENT,
        "inspector": "",
        "held_sum_wei": str(2 * GEN),
        "funder": "RESPONDENT",
        "challenge_bond_wei": str(GEN // 10),
        "evidence_period_seconds": 3600,
        "challenge_window_seconds": 3600,
        "challenge_evidence_seconds": 3600,
    }
    base.update(over)
    return base


# ---- the harness object ------------------------------------------------------------------

class Refused(Exception):
    pass


class Harness:
    def __init__(self):
        S.reset()
        S.pending_chunks = []
        self.m = load_module()
        S.module = self.m
        S.sender = DEPLOYER
        self.c = self.m.KeyWitness()

    # time
    def at(self, iso: str):
        S.now = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)

    def later(self, seconds: int):
        from datetime import timedelta
        S.now = S.now + timedelta(seconds=int(seconds))

    # calls
    def call(self, method, *args, by=CLAIMANT, value=0):
        fn = getattr(self.c, method)
        S.sender = by
        S.value = int(value)
        if value:
            S.balance += int(value)  # the network credits value before the code runs
        try:
            out = fn(*args)
        except _UserError as e:
            raise Refused(str(e.data)) from None
        finally:
            S.value = 0
        return json.loads(out) if isinstance(out, str) and out[:1] in "{[" else out

    def view(self, method, *args):
        out = getattr(self.c, method)(*args)
        return json.loads(out) if isinstance(out, str) and out[:1] in "{[" else out

    def refused(self, method, *args, by=CLAIMANT, value=0, match=""):
        with pytest.raises(Refused) as e:
            self.call(method, *args, by=by, value=value)
        assert match in str(e.value), f"refusal was: {e.value}"
        return str(e.value)

    # model
    def answer(self, kind, ans, role="leader"):
        S.answers[kind][role].append(ans)

    def answers(self, look_ans=None, judge_ans=None, validator_look=None, validator_judge=None):
        if look_ans is not None:
            S.answers["look"]["leader"].append(look_ans)
        if judge_ans is not None:
            S.answers["judge"]["leader"].append(judge_ans)
        if validator_look is not None:
            S.answers["look"]["validator"].append(validator_look)
        if validator_judge is not None:
            S.answers["judge"]["validator"].append(validator_judge)

    def sight(self, leader="sees", validator="sees"):
        """How each role's model handles images: "sees", "blind" (no image reaches it) or "inventing"."""
        S.sight = {"leader": leader, "validator": validator}

    def clear_answers(self):
        S.answers = {"look": {"leader": [], "validator": []}, "judge": {"leader": [], "validator": []}}
        S.calls = {"look": {"leader": 0, "validator": 0}, "judge": {"leader": 0, "validator": 0}}

    # money
    @property
    def balance(self):
        return S.balance

    @property
    def transfers(self):
        return S.transfers

    def ledger(self):
        st = self.view("get_stats")
        return int(st["held_wei"]) + int(st["bonds_wei"]) + int(st["owed_wei"])

    def conserved(self):
        """The contract's balance equals what its ledger says it holds."""
        assert S.balance == self.ledger(), f"balance {S.balance} != ledger {self.ledger()}"

    def credit(self, who):
        return int(self.view("get_credit", who)["owed"])

    @property
    def prompts(self):
        return S.prompts

    @property
    def prints(self):
        return S.prints

    # flows
    def open(self, by=CLAIMANT, **over):
        out = self.call("open_case", json.dumps(terms(**over)), by=by)
        return out["case_id"]

    def digest(self, cid):
        case = self.view("get_case", cid)
        return self.view("get_terms", cid, case["version"])["digest"]

    def accept(self, cid, by=RESPONDENT):
        return self.call("accept_case", cid, self.digest(cid), by=by)

    def fund(self, cid, by=RESPONDENT, wei=None):
        case = self.view("get_case", cid)
        t = self.view("get_terms", cid, case["accepted_version"])
        return self.call("fund_case", cid, by=by, value=int(t["held_sum_wei"]) if wei is None else wei)

    def opened(self, by=CLAIMANT, **over):
        """A case through acceptance (and inspector and funding when the
        terms need them) to OPEN. `by` is the claimant; the respondent is the
        one the terms name."""
        cid = self.open(by=by, **over)
        t = terms(**over)
        self.accept(cid, by=t["respondent"])
        if t.get("inspector"):
            self.call("accept_inspector", cid, self.digest(cid), by=t["inspector"])
        if int(t.get("held_sum_wei", "0")):
            self.fund(cid, by=by if t["funder"] == "CLAIMANT" else t["respondent"])
        assert self.view("get_case", cid)["state"] == "OPEN"
        return cid

    def photo(self, cid, by=CLAIMANT, tag="a", **meta):
        m = {"kind": "PHOTO", "file_name": f"{tag}.jpg", "description": "after the repair", "criteria": ["C1"]}
        m.update(meta)
        return self.call("submit_image", cid, json.dumps(m), jpeg(tag), by=by)["evidence_id"]

    def doc(self, cid, by=RESPONDENT, text="Inspection found remaining moisture in the loft.", **meta):
        m = {"doc_type": "INSPECTION_REPORT", "title": "Inspection", "file_name": "report.txt",
             "description": "the inspection", "criteria": ["C2"]}
        m.update(meta)
        return self.call("submit_text", cid, json.dumps(m), text, by=by)["evidence_id"]

    def final(self, **over):
        """A case through a supported decision to FINAL."""
        cid = self.opened(**over)
        p = self.photo(cid, tag=f"final-{cid}")
        self.ready_all(cid, inspector=over.get("inspector"))
        self.clear_answers()
        self.answers(look_ans=look(), judge_ans=judge(crit("C1", "SUPPORTED", [p]), crit("C2", "SUPPORTED", [p])))
        self.call("request_assessment", cid)
        self.later(3600)
        self.call("finalize", cid, by=STRANGER)
        return cid

    def ready_all(self, cid, inspector=None):
        self.call("mark_ready", cid, by=CLAIMANT)
        self.call("mark_ready", cid, by=RESPONDENT)
        if inspector:
            self.call("mark_ready", cid, by=inspector)


@pytest.fixture
def h():
    return Harness()
