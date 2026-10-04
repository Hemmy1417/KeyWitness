# Testing

Five layers, each answering a different question. The numbers below are from the commit this file is in; CI runs the
first four on every push.

| Layer | Question it answers | Count | Needs the network |
|---|---|---|---|
| Direct contract tests | Does each rule of the contract hold? | 420 tests | No |
| Mutation sweep | Would the tests notice if a rule were removed? | 297 mutants, all killed | No |
| App and contract parity | Does the app offer exactly what the contract accepts? | 96 situations, 23 test images | No |
| Web unit tests | Do the app's own rules, wording and verification hold? | 216 tests | No |
| Live proofs | Does all of it happen on Studio Next, with real wallets and real validators? | 78 checks | Yes |

## Run everything

```bash
pip install -r requirements-dev.txt
ruff check contracts tests scripts
genvm-lint check contracts/keywitness.py --json
python -m pytest tests/direct -q
python tests/mutation/mutate.py
python scripts/web_fixtures.py && git diff --exit-code -- web/tests/fixtures
```

```bash
cd web
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
node scripts/check-address.mjs
```

The live proofs are run by hand, because they sign real transactions and wait out real windows:

```bash
cd scripts && node --experimental-strip-types --import ./ts-loader.mjs proofs.mjs --record
```

## 1. Direct contract tests (`tests/direct/`)

`conftest.py` loads `contracts/keywitness.py` under a small stand-in for the GenVM runtime: storage, the sender, the
value sent, the clock and the contract's balance are plain Python, and the leader and validator functions passed to
`run_nondet` are both really run, with scripted model answers. The suite therefore exercises consensus itself (a
validator that disagrees stops the write) and not only the leader's path.

| File | What it covers |
|---|---|
| `test_terms.py` | Every field of the terms: lengths, vocabularies, time zones, exact local deadlines, required evidence totals, versions, acceptance by digest, expiry of drafts |
| `test_evidence.py` | Who may file and when, caps, image structure (JPEG and PNG), metadata blocks refused, copies of the same bytes filed by two roles, reuse across cases, document limits |
| `test_assessment.py` | The floors F0 to F8, the overall rule, citations, flags, reuse, non-answers and slips of form, decisions made in code |
| `test_sight.py` | The calibration image, blind leaders, blind validators borrowing notes, unseen images |
| `test_challenge.py` | The bond, filing and reply windows, readjudication, rounds without a result, every way a challenge closes, asking again |
| `test_receipt.py` | The receipt's contents and digest |
| `test_invariants.py` | Randomised walks through whole case lifetimes: value is conserved after every write, a closed case never reopens, every state is reached. Two cases never share a held sum; two challenges cannot race |
| `test_scenarios.py` | The brief's required scenarios, one test each, named for the scenario |
| `test_static.py` | The source itself: ASCII only with LF endings, the runner pin and the blank line after it, no storage field named like a method, every payable write refuses by returning |
| `test_smoke.py` | The contract answers, and a supported case pays the claimant |

## 2. Mutation sweep (`tests/mutation/mutate.py`)

A green suite proves the tests run. The sweep proves they would notice. Each mutant removes or weakens one guard in
a scratch copy of the repository and runs the direct suite there; the mutant must fail it. A mutant whose pattern no
longer matches the source is a failure too, so a renamed guard cannot drop out silently. The live repository is never
modified.

Candidates that no test could tell from the original, by construction, are listed in the file's header with the
reason each is equivalent.

## 3. App and contract parity

The app decides what to offer with `web/lib/acts.ts` and checks files with `web/lib/images.ts`. Both mirror rules
the contract enforces, and a mirror can drift. So the contract generates the expected answers:

- `scripts/web_fixtures.py` drives the contract through 96 situations and records, for every role and every act,
  whether the contract accepts it and why not. `web/tests/acts.test.ts` requires the app to agree on every row.
- The same script writes 23 test images into one fixture file (valid, truncated, with camera data, with stray chunks, too small, too large,
  another format) with the contract's verdict on each. `web/tests/forms.test.ts` requires the browser's check to give
  the same verdict.
- It also writes canonical JSON and a receipt, so the browser's digest code is checked against the contract's.

CI regenerates these fixtures and fails if they differ from what is committed.

## 4. Web unit tests (`web/tests/`)

| File | What it covers |
|---|---|
| `acts.test.ts` | The 96 parity rows above |
| `calls.test.ts` | Every write and read the app composes, against the contract's own signatures |
| `forms.test.ts` | The terms wizard's validation and the image checks |
| `receipt.test.ts` | Building, redacting and verifying receipts; a tampered file; a receipt whose case has moved on |
| `txstatus.test.ts` | The protocol statuses, the appeal window, when a write counts as recorded |
| `explorer.test.ts` | Finding a case's transactions; refused, undecided and unknown outcomes; a partial search |
| `present.test.ts` | Wording: no raw constants, dates spelled out, fence tags stripped from prose |
| `contrast.test.ts` | Every text and surface colour pair in the stylesheet meets WCAG AA; a light surface inside a dark one keeps dark controls |

## 5. Live proofs (`scripts/proofs.mjs`, record in `docs/proofs/`)

Real cases on the deployment of record, each role signing with its own wallet, every claim checked from chain state:

| Case | What it proves |
|---|---|
| The synthetic sample | An assessment with photographs and documents; refusals at every stage; a challenge with new evidence, a reply and a readjudication; the held sum and the bond settle by the rule |
| A claim the records bear out | A supported finding moves the held sum to the claimant; a protocol appeal is sent against the assessment |
| A planted instruction | A document that tries to instruct the assessor is flagged and does not move the finding |
| One word against another | A conflicting finding; a challenge with nothing new is closed and its bond goes to the other side |
| Required evidence missing | Decided in code, with an inspector, no validator asked |
| Nothing filed | Decided in code |
| A file from another dispute | Reuse is recorded |
| Declined, withdrawn | Cases that end before they begin |
| Terms the contract refuses | Bad deadlines, zones, lengths and windows are refused with a reason |
| A follow-up case | It cites the closed case it follows |
| Receipts | Built and verified with the app's own code, including one made before its case settled |
| The ledger | After each phase the balance on chain equals what the contract's books say it holds; at the end nothing is left |

The app's own rules (`web/lib/acts.ts`) are loaded by the proofs and must agree with what the deployed contract
accepts at each stage. The run is resumable, and the recorded one was resumed once. Its first pass read the
claimant's wallet balance before the withdrawal's transfer had landed and so failed that one check; the withdrawal
itself had finalized and returned the full amount. The step now waits for the balance to move, and the resumed run read
it again and passed. `live.json` records the resume under `resumed`. `docs/proofs/live.md` lists
every check, every transaction and every consensus round with each node's model and vote.

## Adversarial reviews

Eight separate adversarial reviews went through the contract. Each reviewer came to it cold and was asked to break
it, and the last seven reviews came after the design was complete. The contract was redeployed after the fifth to
eighth, which followed the first deployment of record. Every finding was fixed with a regression test
and, where a guard was added, a mutant. What changed as a result:

| Area | Change |
|---|---|
| Deadlines | A deadline is an exact local time in the case's zone. Seconds, offsets and impossible dates are refused, where an earlier version cut the text and silently reinterpreted it |
| Text limits | Text that is too long is refused, never cut |
| Malformed input | A criteria mapping that is not well formed is refused, where it used to be dropped. Non-text values are refused before any text handling |
| Non-answers | A model answer that judges nothing fails the node; it used to read as "insufficient", which decided the case for one side |
| Consensus | A validator refuses a leader's result that does not judge every criterion or that counted fewer images than it saw |
| Images | Structure is checked (segments, chunks, a frame before the scan) and the usual metadata blocks are refused. The check is structural and the documents now say so |
| Fences | Look-alike letters of other scripts are folded before the marker search; a fence's tag is a hash of what it encloses |
| Copies | The same bytes may be filed by each role. A cited copy brings in the other roles' copies, but a copy filed by the favoured party brings in nothing, and a flag stays on the copy it was found on. Before the last review a party could strip the other side's document of its weight by filing a copy with an instruction in its description |
| Reuse | Bytes brought from another dispute are recorded and told to the panel. Only the claimant's own reuse is floored: a floor on anyone else's could be set off by the claimant's choice of wallet |
| Challenges | The other side gets a reply window after the challenger's time ends. A round that lost sight of images the first decision saw is no result. The bond goes back for it only if that round opened every new image the challenger filed |
| Opposing evidence | The floor against one-sided evidence used to count only items the other side or the inspector filed. That made it turn on who filed a copy: a respondent could copy a claimant's photograph the model had weighed against the claim and so make it opposing, and a claimant could file the respondent's report first. Whatever the panel weighs against a finding now opposes it, whoever filed it, and an item named both ways counts only against |
| Copies and sight | A copy whose twin was seen counted in the findings but was still listed as unexamined, and that list decides the right to ask again and whether a readjudication round counts. A leader that left one copy out could hand a failed challenger the bond back, or defeat a sound challenge. The list now names an image only when no copy of its bytes was seen, and the model is told a copy that did not open shows what its twin shows |
| What travels | The leader's answer is checked as the model gave it and again as it is cut to travel. An id or a finding is never cut into another word, and lists of ids are stripped and de-duplicated before their cap |
| Retry | A decision that did not see an image can be asked for again by the side it went against, once for each side, so neither can spend the other's turn |
| Form | A conclusive finding whose adequacy is not true or false, or whose lists are not lists, fails the node. A number is an integer or plain digits; a list is a list; an id is text |
| Money | Every path of the held sum and the bond is named, a final `NOT_ASSESSED` included. Payable methods never raise with value attached, even on a storage fault |
| Drafts | A draft that has expired cannot be accepted, funded or revised |

## The interface

- **Call shapes are pinned.** `web/tests/calls.test.ts` reads every write the app composes out of its source and holds
  it to the contract's own signatures (`web/tests/fixtures/schema.json`, generated from the contract): every one of the 18
  writes is offered somewhere, each with exactly the arguments the contract takes, and value goes to the two payable
  methods and to nothing else. Every view is read with the arguments it takes.
- **The write path was signed in a browser.** On a rehearsal deployment of the same source, a case was taken through
  the app's own pages with test wallets: opened from the form, accepted by the respondent, a document filed, evidence
  marked complete, the assessment requested and judged, and the decision shown. Each step was priced by the Transaction
  Kit, signed, and followed through GenLayer's lifecycle on the page. The wallet was a stand-in announced the way a
  real one is (EIP-6963) that forwards each transaction to `scripts/bench-signer.mjs`, a local helper that signs with
  a test wallet, so no key is ever in the browser. A second stand-in that refuses to sign showed how a declined
  signature is reported.
- **What that found.** The wallet menu's button was drawn ivory on ivory (fixed, and held by `contrast.test.ts`); the
  create-case form refused a follow-up the contract allows; an edited receipt still showed its finding and one passing
  line (fixed: nothing passes for an edited file); and three lines of wording that no longer matched the contract.
- Every page was read at desktop width and at 375 pixels, in every state the live cases passed through.
- No page shows an address, a hash, an identifier or a raw constant outside a view labelled for verification;
  `present.test.ts` holds the wording to that.

## What is not tested

- An assessment at the evidence caps (36 items on one case), and a consensus round slower than its window.
- A successful protocol appeal. The one sent was against a correct result and failed, as it should.
- A case where a validator that can see images outvotes a majority that cannot.
- Browser wallets themselves. The app was driven with a stand-in wallet; no extension wallet was automated.
- Real disputes. Every case here is synthetic.
