<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/brand/keywitness-logo-reverse.svg">
    <img src="web/public/brand/keywitness-logo.svg" alt="KeyWitness" width="360">
  </picture>
</p>

<p align="center"><strong>Every property claim deserves evidence.</strong></p>

KeyWitness assesses property claims against criteria both sides agreed in advance. A claimant states one claim and
what would establish it. The respondent accepts that exact version. Both sides file evidence. Independent GenLayer
validators examine it and judge each criterion, and code turns those judgments into a finding. The side a decision
goes against can challenge it once with new evidence. What is left is a record anyone can check.

It is an evidence assessment and recordkeeping tool. It is not a court, a lawyer or a title registry. A finding is
never a legal determination, never assigns liability, and never proves that an event happened.

| | |
|---|---|
| Network | GenLayer Studio Next, chain 61997 (a test network; every amount is test GEN) |
| Contract | `0x5dF552006b48Bef80e60dCc65572f3e917dFC12a` |
| Source | [`contracts/keywitness.py`](contracts/keywitness.py), one file, deployed as is |
| Live record | [`docs/proofs/live.md`](docs/proofs/live.md): 78 checks on the deployed contract, every transaction linked |
| Sample case | Synthetic, labelled `SYNTHETIC DEMO DATA`, run live on the contract above |
| Licence | MIT |

## The five findings

Each criterion gets one, and so does the case as a whole.

| Finding | Meaning |
|---|---|
| Supported | The evidence filed is adequate and establishes the criterion |
| Not established | The evidence was examined and does not establish it |
| Conflicting | Evidence of comparable weight points both ways |
| Insufficient | Too little evidence, or evidence too indirect, to say |
| Not assessed | The evidence could not be examined at all |

Three of the five are ways of saying "we do not know", and they are kept apart on purpose. There are no confidence
percentages. A finding short of supported is never a statement that the event did not happen.

## How a case moves

```
              open_case             accept_case, accept_inspector, fund_case
  claimant  ------------->  DRAFT  ------------------------------------>  OPEN
                              |                                             |
        decline_case          |                                             |  submit_image, submit_text
        withdraw_case         |                                             |  mark_ready
        expire_case           v                                             |
                    DECLINED, WITHDRAWN, EXPIRED                            |  request_assessment
                                                                            |
          lapse_case (no decision three days after the evidence period)     |
  OPEN  ------------------------------------------------>  LAPSED           |
                                                                            v
                         request_assessment again            +-------->  DETERMINED  <---------------+
                         (an image was not seen)             |              |      |                 |
                                                             +--------------+      |  challenge      |
                                                                                   |  (with a bond)  |
                                                        finalize                   v                 |
                                                 (challenge window over)     UNDER_CHALLENGE         |
                                                             |                     |                 |
                                                             v                     |  readjudicate   |
                                                           FINAL                   |  close_challenge|
                                                                                   +-----------------+
                                              withdraw (credits leave only when their owner asks)
```

## Who moves it

| State | Who can act | What they can do | If nobody acts |
|---|---|---|---|
| Draft | Claimant | Revise the terms, withdraw the case | Anyone expires it after 7 days; any deposit is credited back |
| Draft | Respondent | Accept the terms by their digest, or decline | |
| Draft | Named inspector | Accept the role by the same digest | A case that names an inspector opens only once they accept; otherwise the claimant revises the terms or the draft expires |
| Draft | The funder the terms name | Deposit the held sum, after which the case opens for evidence | |
| Open | Claimant, respondent, accepted inspector | File images and documents; mark their evidence complete | |
| Open | Claimant or respondent | Request the assessment, once the evidence period is over or everyone is ready | Anyone lapses it 3 days after the evidence period; the held sum goes back to its depositor |
| Determined | The side the decision went against | Challenge it once, with a bond; or ask again, once, if an image was not seen | Anyone finalizes it once the challenge window has passed |
| Under challenge | Challenger | File new evidence in the challenge evidence period | Anyone closes the challenge; the first decision stands |
| Under challenge | Other party, inspector | Answer, for as long again after the challenger's time ends | |
| Under challenge | Anyone | Run the readjudication once the reply time is over | |
| Final, declined, withdrawn, expired, lapsed | The owner of a credit | Withdraw it | Credits wait in the ledger |

Validators move nothing on their own. They are asked by `request_assessment` and `readjudicate`, and their agreement
is what lets those two writes record a decision.

## Where the money goes

A case may hold a sum. The rule is fixed when the terms are accepted.

| Outcome | Held sum | Challenge bond |
|---|---|---|
| Final and supported | To the claimant | |
| Final with any other finding | To the respondent | |
| No decision was ever recorded (declined, withdrawn, expired, lapsed) | Back to its depositor | |
| Readjudication moves the decision to the challenger's side | | Back to the challenger |
| Readjudication keeps the side, or the challenger filed nothing new | | To the other party |
| Nothing was decided through no fault of the challenger | | Back to the challenger |

Every amount is a credit in the contract's ledger until its owner withdraws it.

## Why this needs GenLayer

No feed publishes whether a particular roof was repaired, and deterministic code cannot read a photograph. Someone
has to look. If one party's server runs the model, the other has no reason to accept the answer. GenLayer gives a
panel of validators neither side picked, a rule for what they must agree on that both sides can read, and a record
neither can edit.

| Code decides | Validators decide |
|---|---|
| Who may act and when; every window and deadline | What each photograph shows |
| Whether required evidence is present | Whether the evidence for a criterion is adequate |
| File structure, size, duplicates and digests | Whether two items contradict each other |
| The floors that can only weaken a finding | Whether a document tries to instruct the assessor |
| The overall finding; every movement of GEN | |

Validators must agree on which criteria are supported and on whether anything could be examined, because that is
what a consequence depends on. The finer label and the prose are the leading validator's, and the record says so.
[`docs/GENLAYER_INTEGRATION.md`](docs/GENLAYER_INTEGRATION.md) has the detail, including the difference between a
GenLayer protocol appeal and a KeyWitness case challenge.

## Architecture

One contract and one web app. No backend service, no database, no file store and no operator key.

```
  browser: KeyWitness web app  --- reads (gen_call) --------------->  GenLayer Studio Next
     |                                                                   KeyWitness contract:
     |  builds a transaction                                             terms, evidence bytes,
     v                                                                   decisions, events, credits
  the person's own wallet  ------- signed transactions ------------>    validators: a leader proposes,
                                                                         each validator reruns and votes
```

The contract is the store: terms, evidence bytes and decisions live in its storage, so validators judge the very
bytes the record holds. Every write is signed by the person it belongs to. The app's host serves pages and one
health route that holds no secret. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) has the data flow and trust
boundaries, and the reason there is no backend.

## What it guards against

| Risk | What KeyWitness does |
|---|---|
| A document or a photograph carries instructions for the model | Party text reaches a model only inside fences it cannot close. The examiner that looks at images is given no party text. Instructions found are flagged, and a flagged item cannot support its filer's side |
| A model answers with nothing usable | The node fails. A non-answer is never read as a finding |
| A validator's model cannot receive images | It must read a calibration image first. If it cannot, it may not lead, and the decision records which images the leading validator saw |
| A finding rests on nothing | Every supported finding must cite evidence that exists, was seen and is adequate, or code weakens it |
| The terms change after evidence is in | Acceptance binds a digest. A change is a new version that must be accepted again |
| The same file is used twice | Bytes are fingerprinted across cases. Reuse is recorded on the item and told to the validators, and a claimant's own reuse from another dispute cannot support the claim |
| A copy of the other side's document is filed to neutralise it | Each copy stays its own filer's item, a flag stays on the copy it was found on, and citing your own copy never makes theirs an admission |
| Camera data and location leak | The browser redraws every image, and the contract refuses one that still carries the usual metadata blocks |
| The app offers something the contract refuses | The app's rules are tested against the contract in 96 situations, and against the live deployment |

The full list, with what is left open, is in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Privacy

Everything filed is public and permanent. There is no private storage: validators nobody controls cannot be handed
a secret. The app says this before every filing, redraws and can redact images in the browser, asks for a property
nickname and never an address, and names parties by role. Do not file anything you would not publish. See
[`docs/PRIVACY_AND_DATA_RETENTION.md`](docs/PRIVACY_AND_DATA_RETENTION.md).

## Run it

You need Node.js 22.12 or newer, pnpm 10 and, for the contract's tests, Python 3.12.

```bash
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3188`. The app reads the contract above with no configuration. To sign, use any browser
wallet; the app offers to add Studio Next, and the wallet menu gives test GEN from the network's faucet.

The pages: the landing page, every case (`/cases`), the create-case wizard (`/cases/new`), a case with its terms
and next steps, its evidence, its decision, its receipt, receipt verification (`/verify`), the sample (`/sample`) and
the contract and network status (`/status`).

### Environment

None is required. Everything in [`.env.example`](.env.example) is optional and public: another KeyWitness
deployment to read, its sample case, or another GenLayer Studio network. No key is ever put in an environment file;
the scripts generate their own test wallets into `.data/`, which git ignores.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev`, `pnpm build`, `pnpm start` (in `web/`) | Run or build the app |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` (in `web/`) | The app's checks |
| `python -m pytest tests/direct -q` | The contract's tests, no network |
| `python tests/mutation/mutate.py` | The mutation sweep |
| `python scripts/web_fixtures.py` | Regenerate the fixtures the app is tested against, from the contract |
| `node scripts/keys.mjs` | Make and fund test wallets for the scripts (the `.mjs` scripts need `cd scripts && npm ci` once) |
| `node scripts/deploy.mjs` | Deploy the contract and prove the stored code matches the source |
| `scripts/proofs.mjs` | The live proofs (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full command) |
| `node scripts/proofs-report.mjs` | Write `docs/proofs/live.md` from the live record |
| `node scripts/check-address.mjs` | One deployment, named the same everywhere |
| `node scripts/bench-signer.mjs` | A local signer for driving the app's write path in a browser with test wallets |

### Demo

Open `/sample`. It shows the synthetic case and links to its live run on the contract: the terms, the evidence from
both sides, the decision criterion by criterion, the challenge and the readjudication, and the receipt, which
`/verify` checks against the chain. [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) is a four minute script.

## Check it

```bash
pip install -r requirements-dev.txt
python -m pytest tests/direct -q
python tests/mutation/mutate.py
```

```bash
cd web
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

| Layer | Count |
|---|---|
| Direct contract tests | 420 |
| Mutants, all killed | 297 |
| App and contract parity | 96 situations, 23 test images |
| Web unit tests | 216 |
| Live checks on the deployed contract | 78 |

[`docs/TESTING.md`](docs/TESTING.md) says what each layer proves and what is not tested.

## Verify the deployment yourself

1. `deployments/record.json` names the contract, its deploy transaction and the sha256 of its source.
2. The network returns the stored source: see "Verify a deployment yourself" in
   [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Its sha256 equals the one in the record and the one of
   `contracts/keywitness.py` in this checkout.
3. `node scripts/check-address.mjs` confirms the app, the live record and every document name that one deployment.
4. `docs/proofs/live.md` links every transaction of the live run on the explorer.

## Repository

```
contracts/keywitness.py      the contract
tests/direct/                contract tests, no network needed
tests/mutation/mutate.py     the mutation sweep
scripts/                     deploy, live proofs, report, fixtures, brand
fixtures/sample/             the synthetic sample case
probes/                      two throwaway contracts used to measure the network
web/                         the app (Next.js)
deployments/record.json      the deployment of record
docs/                        the documents below
```

| Document | What it holds |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | The design of record and the reason for each decision |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, data flow, trust boundaries |
| [`docs/CONTRACT_SPEC.md`](docs/CONTRACT_SPEC.md) | Schemas, methods, states, floors, money, failure semantics |
| [`docs/GENLAYER_INTEGRATION.md`](docs/GENLAYER_INTEGRATION.md) | What is asked of GenLayer, and what was observed |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Threats, mitigations, residual risk |
| [`docs/PRIVACY_AND_DATA_RETENTION.md`](docs/PRIVACY_AND_DATA_RETENTION.md) | What is stored, where, and for how long |
| [`docs/TESTING.md`](docs/TESTING.md) | The five layers of checks |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deploying, hosting, verifying |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | A four minute walk through |
| [`docs/BRAND.md`](docs/BRAND.md) | The mark, colour, type and voice |
| [`docs/proofs/live.md`](docs/proofs/live.md) | The live record |
| [`SECURITY.md`](SECURITY.md) | Reporting a vulnerability |

## Known limits

- **A test network.** Studio Next can be reset by its operators. The record of what ran is in this repository.
- **Not every validator looks.** A validator whose model receives no image judges from the leading validator's notes
  on what the images show. This is the main trust assumption.
- **Files are not authenticated.** A digest proves a file did not change after it was filed. It does not prove the
  file is genuine, and a declared capture time is the filer's claim.
- **Small evidence.** An image is at most 400,000 bytes and a document 6,000 characters, because the bytes live in
  contract storage.
- **No independent audit.** The contract was reviewed adversarially during development, not by an outside firm.
- **Synthetic data only.** Do not use this deployment for a real dispute or real personal data.

## Licence

MIT. See [`LICENSE`](LICENSE). The typefaces in `web/app/fonts` are under the SIL Open Font License.
