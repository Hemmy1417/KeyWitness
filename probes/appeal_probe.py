# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""Disposable probe: does a protocol appeal on Studio Next keep the contract intact?"""

import genlayer as gl
from genlayer.types import u256


class AppealProbe(gl.contract.Contract):
    count: u256

    def __init__(self):
        self.count = u256(0)

    @gl.public.write
    def bump(self) -> str:
        self.count = u256(int(self.count) + 1)
        return str(int(self.count))

    @gl.public.view
    def get(self) -> int:
        return int(self.count)
