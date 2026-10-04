# Architecture

KeyWitness is two things: one intelligent contract, and one web app that reads it and builds transactions for a
wallet to sign. There is no backend service, no database, no file store and no operator key.

## Components

```
   A person's browser
  +---------------------------------------------------------------+
  |  KeyWitness web app (Next.js, runs in the page)                |
  |                                                               |
  |   pages      cases, wizard, case, evidence, decision,         |
  |              receipt, verify, sample, status                  |
  |   lib/acts   what this wallet may do now (mirrors the         |
  |              contract's own checks)                           |
  |   lib/read   budgeted reads, typed, cached where immutable    |
  |   lib/images redraw, redact, strip metadata, check structure  |
  |   lib/receipt canonical JSON, digests, verification           |
  |   lib/kit    GenLayer Transaction Kit bound to the wallet     |
  +------+------------------------+--------------------+----------+
         | reads (gen_call)       | signs              | lists a case's
         |                        v                    | transactions
         |              +------------------+           |
         |              | the person's own |           |
         |              | wallet (EIP-6963)|           |
         |              +--------+---------+           |
         |                       | signed transactions |
         v                       v                     v
  +--------------------------------------------+   +------------------+
  |  GenLayer Studio Next (chain 61997)        |   | Studio Next      |
  |                                            |   | explorer API     |
  |   KeyWitness contract (Python, GenVM)      |   | (helper only:    |
  |    storage: cases, terms versions,         |   |  never trusted   |
  |    evidence bytes and text, decisions,     |   |  for outcomes)   |
  |    events, credits                         |   +------------------+
  |                                            |
  |   validators: a leader proposes, each      |
  |   validator runs the assessment itself     |
  |   and agrees or dissents                   |
  +--------------------------------------------+

   The app's host serves static pages and one route, /api/health,
   which holds no secret and reads no case.
```

## Why there is no backend

The brief this build follows allows for a backend, a database and private evidence storage. KeyWitness has none, on
purpose:

- **The contract already is the store.** Terms, evidence bytes, decisions and the event log live in contract storage.
  A second copy in a database would be a copy someone could edit, and every page would have to say which one it showed.
- **Validators must read what the record holds.** An assessment judges the bytes the contract stored and hashed. If
  evidence lived in private storage, validators would have to fetch it from whoever ran that storage, and the record
  would depend on that party staying honest and online.
- **No operator, no operator key.** Every write is signed by the person it belongs to. There is nothing to compromise
  on the app's host: it serves files.

The cost is real and is stated everywhere it matters: **everything filed is public and permanent**, and evidence is
limited in size (400,000 bytes an image, 6,000 characters a document). See `PRIVACY_AND_DATA_RETENTION.md`.

## Data flow

### Opening a case

1. The wizard keeps a draft in the browser and checks it against the contract's limits (`lib/terms.ts`).
2. The claimant's wallet signs `open_case(terms)`. The contract validates every field again, normalises the terms,
   stores version 1 with the sha256 of its canonical JSON, and returns the case id and digest.
3. The respondent reads the terms from the contract and signs `accept_case(case, digest)`. The digest binds the
   acceptance to that exact version. A named inspector signs `accept_inspector(case, digest)` the same way.
4. If the terms carry a held sum, the funder signs `fund_case` with that value. The case opens for evidence.

### Filing evidence

1. The browser reads the file's real type from its bytes, decodes it, redraws it on a canvas (which drops all
   metadata), paints any redaction rectangles into the pixels, encodes a JPEG under the size limit, strips any block
   the encoder added, and checks the result the way the contract will (`lib/images.ts`).
2. The wallet signs `submit_image(case, description, bytes)` or `submit_text(case, description, text)`.
3. The contract checks the role, the phase and the caps, checks the image's structure, computes the sha256 itself,
   records where the same bytes were filed before, stores the bytes, and clears every role's "evidence complete" mark.

### An assessment

```
 request_assessment (signed by a party)
        |
        v
   required evidence missing, or nothing filed?  -- yes -->  decision recorded in code:
        | no                                                  every criterion INSUFFICIENT
        v
   each node, on its own:
     1. read the calibration image (six digits the contract draws)
          failed, and leading  -> the round fails; the network rotates the leader
          failed, validating   -> use the leader's notes on each image
     2. examine every image, two at a time, with no party text beside it
     3. judge every criterion from the notes and the fenced documents
     4. the answer must judge every criterion, or the node fails
     5. floors in code (F0 to F8), then the overall finding in code
        |
        v
   validator: is "supported or not" the same for every criterion,
   and "could anything be examined" the same, in my result and the leader's?
        |
        v
   a majority agrees -> the leader's result, shaped and floored, is recorded
   no majority       -> nothing is recorded; a party asks again
```

### After a decision

- The side it went against may **ask again** without a bond if any image was not seen (once for each side), or
  **challenge** it once with a bond. In a challenge the challenger files new evidence, the other side and the
  inspector answer, and anyone runs the readjudication, which judges the whole file afresh.
- Anyone **finalizes** once the window has closed. The held sum is credited by the rule fixed at acceptance.
- Credits leave only through `withdraw`, called by their owner.

### A receipt

`get_receipt` returns the terms, the parties, the whole standing decision, the history and the settlement, with the
sha256 of that record. The browser builds a private or a public (redacted) file from it. `/verify` recomputes the
file's digest, recomputes the contract's digest from the contract's own record, compares the two, and separately
checks the decision in the file against `get_decision`, so a receipt whose case has since moved on is told apart from
a file that was made up.

## Trust boundaries

| Boundary | What crosses it | What guards it |
|---|---|---|
| A party's input into the contract | Terms, descriptions, document text, image bytes | Validation in the contract: types, lengths, vocabularies, image structure. Text is refused when too long, never cut |
| Party text into a model's prompt | Claims, criteria text, documents, descriptions, text read off images | Tagged fences; removal of invisible characters; the examiner sees no party text |
| A model's answer into the record | Findings, cited ids, prose | The answer must judge every criterion; it is shaped to known ids and criteria; floors F0 to F8 run in code; the overall finding is computed |
| The leader's result to each validator | The leader's shaped answer and notes | Each validator runs the assessment itself and compares what the record binds; it refuses a result that drops images it saw or does not judge every criterion |
| The contract to the app | Case state | The app shows only what it reads; what it may offer is recomputed from that state (`lib/acts.ts`), and the proofs check those rules against the live contract |
| The app to the wallet | A transaction to sign | The transaction is frozen when its review opens; the wallet shows its own confirmation; the contract checks everything again |
| The explorer to the app | A list of transactions for a case | Used only to find hashes. What each transaction did is worked out from its own consensus rounds and result, and the page says when the search did not cover the case's whole life |
| Money in and out | A held sum, a bond, a withdrawal | A pull ledger: `held + bonds + owed` equals the contract's balance after every write; payable writes never raise with value attached |

## Key decisions

| Decision | Why | Cost |
|---|---|---|
| Studio Next, and only Studio Next | The network the project was told to use. One network definition is shared by the wallet layer, the SDK and the kit, and the app refuses to sign on any other chain | A test network: it can be reset |
| Evidence bytes on chain | A later readjudication, and anyone checking a receipt, read the very bytes the first panel read | Public, permanent and small |
| Terms accepted by digest | Neither side can move the goalposts once evidence is in | A typo after acceptance needs a follow-up case |
| Code decides everything countable | Roles, windows, required evidence, digests, the overall rule and every movement of money need no judgment and get none | The floors can turn a model's SUPPORTED into something weaker; the record shows both |
| Consensus binds "supported or not", not the finer label | It is what a consequence depends on, and honest models split on the rest (shown live, twice) | The finer label and the prose are one validator's, and say so |
| A calibration image before any evidence image | Many validator models here receive no image; one invents them | A blind validator trusts the leader's notes: the stated trust assumption |
| A non-answer fails the node | Read as "insufficient", a model's refusal would decide the case for one side | A run of broken models delays a decision instead of producing one |
| A pull ledger | A transfer inside a state change can fail or be priced against a stale clock | One more transaction for the payee |
| A challenge with a bond, a reply window and a second panel | A decision by a small panel deserves one second look; the other side must be able to answer new evidence | A second panel can differ on a borderline case; the bond is the price |
| No server, no accounts, no analytics | Nothing to breach, nothing to subpoena, nothing to keep running | Reads are limited by the network's budget per IP address; the app queues and retries |

## Repository layout

```
contracts/keywitness.py      the contract (one file, ASCII, deployed as is)
tests/direct/                the contract under a stub runtime: no network needed
tests/mutation/mutate.py     breaks each guard once and requires the suite to notice
scripts/                     deploy, live proofs and their report, fixtures for the web tests, a bench signer
fixtures/sample/             the synthetic sample case: terms, photographs, documents
probes/                      two throwaway contracts used to measure the network (images, appeals)
web/                         the app (Next.js): app/ pages, components/, lib/, tests/
deployments/record.json      the deployment of record, with the sha256 of its source
docs/                        this file and the others; docs/proofs/ holds the live record
.github/workflows/ci.yml     contract checks, the mutation sweep, the web checks, one address
```

## What "the app offers exactly what the chain allows" means in practice

`web/lib/acts.ts` is a pure function from (case, terms, standing decision, evidence, wallet, clock) to "may this
wallet do X now, and if not, why". It is checked three ways:

1. `scripts/web_fixtures.py` drives the contract through 96 situations and records, for every role and every act,
   whether the contract accepts it. `web/tests/acts.test.ts` requires the app's rules to agree on every row.
2. The live proofs load the same rules and assert them against the deployed contract at each stage of the sample case.
3. A button is rendered only from these rules, and an act the contract would refuse is shown with the contract's
   reason in words instead of a button that fails.
