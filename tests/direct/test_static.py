"""Properties of the source file itself that the network depends on."""

import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "keywitness.py"
RUNNER = 'py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng'


def test_source_is_ascii_with_lf_only():
    raw = SRC.read_bytes()
    assert b"\r" not in raw
    raw.decode("ascii")  # raises on any non-ASCII byte, including invisible ones


def test_runner_pin_header_and_the_blank_line_after_it():
    lines = SRC.read_text(encoding="ascii").split("\n")
    assert lines[0] == '# { "Depends": "' + RUNNER + '" }'
    assert lines[1] == "", "the blank line after the Depends comment is load-bearing"


def test_no_storage_field_shares_a_name_with_a_method():
    s = SRC.read_text(encoding="ascii")
    fields = set(re.findall(r"^    (\w+): (?:gl\.storage\.\w+|str)", s, re.M))
    methods = set(re.findall(r"^    def (\w+)\(", s, re.M))
    assert fields and methods
    assert not fields & methods


def test_every_payable_write_refuses_by_returning():
    s = SRC.read_text(encoding="ascii")
    for m in re.finditer(r"@gl\.public\.write\.payable\n    def (\w+)\(", s):
        body = s[m.end():s.find("\n    @gl.public", m.end())]
        assert "_PayableRefusal" in body and "credited_wei" in body, m.group(1)
