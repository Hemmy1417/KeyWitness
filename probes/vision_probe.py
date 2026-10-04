# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""Disposable probe: which validator routes on Studio Next actually receive an
image, and does the format (JFIF JPEG or PNG) or asking for JSON matter? Every
node prints its raw answer; the validators always agree, so one transaction
shows every route."""

import genlayer as gl


class VisionProbe(gl.contract.Contract):
    runs: str

    def __init__(self):
        self.runs = "0"

    @gl.public.write
    def look(self, label: str, data: bytes, as_json: bool) -> str:
        blob = bytes(data)
        prompt = ("One image is attached. If you received it, say in one sentence what it shows and quote any text "
                  "you can read in it. If no image reached you, say exactly NO IMAGE.")
        if as_json:
            prompt += ' Answer STRICT JSON: {"seen": true, "shows": "...", "text": ["..."]}'

        def ask() -> str:
            try:
                if as_json:
                    raw = gl.nondet.exec_prompt(prompt, response_format="json", images=[blob])
                else:
                    raw = gl.nondet.exec_prompt(prompt, images=[blob])
                return str(raw)[:400]
            except Exception as e:
                return "ERROR " + str(e)[:200]

        def leader_fn() -> str:
            out = ask()
            print(f"[PROBE] {label} leader: {out}")
            return "done"

        def validator_fn(result) -> bool:
            print(f"[PROBE] {label} validator: {ask()}")
            return True

        gl.vm.run_nondet(leader_fn, validator_fn)
        self.runs = str(int(self.runs) + 1)
        return self.runs
