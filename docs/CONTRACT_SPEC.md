# Contract specification

`contracts/keywitness.py`, one file, deployed as it is. This document is the reference for its data and its methods.
The reasons behind the rules are in `SPEC.md`; this file says what they are.

Conventions: every view returns canonical JSON (keys sorted, no spaces, ASCII escapes) unless it returns bytes. Times
are UTC, `YYYY-MM-DDTHH:MM:SSZ`, taken from the transaction. Amounts are strings of atto (10^18 atto = 1 GEN).
Addresses are checksummed. Ids: a case is `KW-0001`, an exhibit `E-0001`, a decision `D-0001`, a criterion `C1`.

## 1. Terms (the claim and its criteria)

Written by the claimant as JSON to `open_case` or `revise_terms`. The contract validates and normalises them, adds
`version`, `case_id`, `published_at` and `rules`, and stores them with `digest`, the sha256 of the canonical JSON of
everything else.

| Field | Type and limits | Notes |
|---|---|---|
| `title` | text, 5 to 120 characters | |
| `event_kind` | `REPAIR_COMPLETED`, `CONDITION_AT_INSPECTION`, `DAMAGE_BEYOND_WEAR` or `MAINTENANCE_REPORTED` | Selects guidance given to the validators |
| `property_ref` | text, 2 to 80 characters | A nickname. Refused if it contains `@`, `http` or `www.` |
| `time_zone` | `UTC` or an IANA name such as `Europe/London` | Checked by pattern; the app checks it is a real zone |
| `window_start`, `deadline` | empty, `2026-10-01` or `2026-10-01T17:00` | Local time in `time_zone`. Seconds, offsets and `Z` are refused. A day with no time is the whole day |
| `claim` | text, 10 to 400 characters | One falsifiable sentence |
| `criteria` | 1 to 6 of `{text, needs_independent}` | `text` 5 to 300 characters; ids `C1`.. are assigned in order; no two alike |
| `allowed` | one or more of `PHOTO`, `VIDEO_FRAME`, `DOCUMENT_PAGE`, `TEXT_DOCUMENT` | |
| `required` | up to 4 of `{type, min}` | `type` is an evidence kind or `DOC:<document type>`; `min` 1 to 3; in total at most 5 images and 4 documents, where a required document counts as an image if no text documents are allowed |
| `limitations` | up to 4 lines of at most 300 characters | Limits and excluded inferences both sides agree |
| `respondent` | wallet address | Not the claimant |
| `inspector` | wallet address or empty | Not a party. Required if any criterion has `needs_independent` |
| `held_sum_wei` | `"0"`, or 0.01 to 1000 GEN | |
| `funder` | `CLAIMANT` or `RESPONDENT` when there is a held sum | |
| `challenge_bond_wei` | 0.01 to 100 GEN | |
| `evidence_period_seconds` | 600 to 2,592,000 | From the moment the case opens |
| `challenge_window_seconds` | 3,600 to 1,209,600 | After each decision |
| `challenge_evidence_seconds` | 600 to 1,209,600 | The challenger's time; the other side has as long again |
| `follows_case` | empty or a case id | A closed case between the same two parties |

Text is refused when it is too long or is not text; it is never cut or converted. A number is an integer or a string
of the digits 0 to 9, and a list is a list: anything else is refused, not read.

**Versions.** Up to 20 while the case is a draft; every one is kept. The respondent accepts one by its digest
(`accept_case`). After that no method changes the terms.

## 2. Evidence manifest

One record per item (`get_evidence`), and the list for a case (`get_case_evidence`).

| Field | Meaning |
|---|---|
| `evidence_id`, `case_id`, `seq` | Identity |
| `kind` | `PHOTO`, `VIDEO_FRAME`, `DOCUMENT_PAGE` or `TEXT_DOCUMENT` |
| `doc_type` | For a document: `INSPECTION_REPORT`, `INVOICE`, `CONTRACTOR_STATEMENT`, `MAINTENANCE_MESSAGE`, `WORK_ORDER`, `MOVE_IN_REPORT`, `MOVE_OUT_REPORT` or `OTHER_RECORD` |
| `role`, `filed_by` | Who filed it: the role and the signer's address |
| `filed_at` | The transaction's time. The only time the contract vouches for |
| `sha256`, `bytes` | Computed by the contract over the stored bytes (an image) or the stored UTF-8 text (a document) |
| `media_type` | `image/jpeg`, `image/png` or `text/plain` |
| `during_challenge` | Filed while the case was under challenge |
| `first_filed_in`, `reuse` | Where these exact bytes were first filed, and by whom: `SELF`, `RELATED`, `OTHER` or empty |
| `file_name`, `description`, `declared_capture`, `criteria`, `title`, `frame_time`, `redacted`, `redaction_note` | **The filer's claims.** Labels, a description, a date the filer declares, the criteria the item is offered for. Nothing verifies them and the validators are told so |

`get_evidence_image` returns an image's bytes; `get_evidence_text` a document's text. A decision stores its own
snapshot of the manifest and `manifest_digest`, the sha256 of that snapshot, so each decision records exactly the
file it judged.

An image is accepted only if it has the structure of a PNG or a JFIF JPEG, has sides of 16 to 4096 pixels, carries
none of the usual metadata blocks (camera data, an editor record, a comment, a PNG text or time chunk), and ends
where an image ends. The check is structural: pixels are not decoded on chain.

## 3. Findings

| Finding | Meaning |
|---|---|
| `SUPPORTED` | The evidence affirmatively shows the criterion is met |
| `NOT_ESTABLISHED` | The evidence was adequate to judge the criterion and shows it is not met |
| `CONFLICTING` | Material evidence points both ways and neither side outweighs the other |
| `INSUFFICIENT` | The evidence is missing, unclear or too thin to conclude |
| `NOT_ASSESSED` | Nothing could be examined |

Overall, computed in code: any `NOT_ASSESSED` gives `NOT_ASSESSED`; otherwise all `SUPPORTED` gives `SUPPORTED`;
otherwise any `NOT_ESTABLISHED` gives `NOT_ESTABLISHED`; otherwise any `CONFLICTING` gives `CONFLICTING`; otherwise
`INSUFFICIENT`.

## 4. Decision (the output)

`get_decision(id)`:

```json
{
  "decision_id": "D-0001",
  "case_id": "KW-0003",
  "round": 1,
  "kind": "ASSESSMENT",
  "scope": "Whether the filed evidence establishes each criterion the parties accepted ... Not a legal finding ...",
  "terms_version": 1,
  "terms_digest": "<sha256 of the accepted terms>",
  "manifest_digest": "<sha256 of the evidence snapshot below>",
  "evidence": [{"evidence_id": "E-0001", "kind": "PHOTO", "role": "CLAIMANT", "sha256": "...", "filed_at": "...",
                "declared_capture": "...", "new_in_challenge": false, "first_filed_in": "", "reuse": ""}],
  "decided_at": "2026-10-03T05:03:14Z",
  "requested_by": "<address>",
  "criteria": [{
    "id": "C1", "text": "...", "needs_independent": false,
    "finding": "CONFLICTING",
    "model_finding": "NOT_ESTABLISHED",
    "floors": ["F3"],
    "basis": ["E-0002"],
    "contrary": ["E-0006"],
    "missing": ["an independent inspection after the second visit"],
    "rationale": "the leading validator's reasoning, at most 900 characters"
  }],
  "overall": "CONFLICTING",
  "limitations": ["what this assessment could not check"],
  "instructions_found": ["E-0014"],
  "seen_ids": ["E-0001"],
  "unseen_ids": [],
  "observations": [{"evidence_id": "E-0001", "seen": true, "shows": "...", "text": ["..."], "text_cut": false,
                    "dates": ["..."], "subject_doubts": "", "quality": "GOOD"}],
  "calibrated": true,
  "bound": {"findings": "a majority of validators, each running the assessment itself, reproduced ...",
            "leader_recorded": ["the finer label of a criterion that is not supported ...", "floors", "rationale",
                                "basis", "contrary", "missing", "limitations", "observations", "instructions_found",
                                "seen_ids"]},
  "status": "STANDING",
  "supersedes": "",
  "superseded_by": "",
  "challenge_window_ends": "2026-10-03T06:03:14Z",
  "decision_digest": "<sha256 of everything above except the five lifecycle fields>"
}
```

- `kind`: `ASSESSMENT`, `READJUDICATION`, or `CODE` (decided in code because required evidence, or any evidence at
  all, was missing; no validator was asked).
- `finding` is the result after the floors; `model_finding` is what the leading validator's model said; `floors`
  names each floor that applied.
- `basis` is what the finding rests on and `contrary` what points the other way. For `NOT_ESTABLISHED` the basis is
  the items against the criterion; for every other finding it is the items that support it.
- `status`: `STANDING`, `SUPERSEDED`, `FINAL`, or `NO_RESULT` (a readjudication round that could not examine what it
  had to, and changed nothing).
- `decision_digest` excludes `status`, `supersedes`, `superseded_by`, `challenge_window_ends` and itself. Those
  change as the case moves on; nothing else ever does.
- What is **bound by consensus**: for each criterion, whether `finding` is `SUPPORTED`; and whether `overall` is
  `NOT_ASSESSED`. Everything listed in `bound.leader_recorded` is the leading validator's.

### Floors

| Floor | Rule |
|---|---|
| F0 | A label outside the vocabulary is `INSUFFICIENT` |
| F1 | A conclusive finding (`SUPPORTED`, `NOT_ESTABLISHED`) must rest on an item on the case that the node saw |
| F2 | A criterion that needs independent evidence is conclusive only with an inspector's item in its basis |
| F3 | A conclusive finding resting only on the favoured party's items, against material evidence from the other party or the inspector, is `CONFLICTING` |
| F4 | A conclusive finding the model itself marks as resting on inadequate evidence is `INSUFFICIENT` |
| F5 | Items the node could not see are set aside |
| F6 | An item flagged as carrying instructions to the assessor never counts for the side that filed it |
| F7 | Bytes the claimant brought from a case with a different other party never count for the claimant. Any other reuse is recorded and told to the panel, not floored |
| F8 | `CONFLICTING` needs an item on each side |

F6 and F7 are recorded together as `F6/F7`: both remove an item from what counts for its filer. A flag binds the
item the model named and no copy of it.

Copies. The same bytes filed by two roles are each filer's own item. A copy the model names brings in the other
roles' copies, except that a copy filed by the party a list favours brings in nothing. A copy named on the other list
stays where it was named, and one that could be brought into both counts against the finding. An item named on both
lists counts on neither.

| Code-first and blind results | |
|---|---|
| `NONE_SEEN` | Nothing was visible at all: `NOT_ASSESSED` |
| `REQUIRED_MISSING`, `NOTHING_FILED` | The code-first decisions |

## 5. Case

`get_case(id)`: `state`, the parties, `version`, `accepted_version`, `accepted_digest`, `funded_wei`,
`funder_address`, the times (`created_at`, `draft_expires_at`, `opened_at`, `evidence_deadline`, `updated_at`),
`ready` per role, `decisions`, `standing`, `retries_used`, `retried_by`, `challenge`, `settlement`, `closed_reason`,
`follows_case`, `thread`, per-role filing `counts`, and `evidence_ids`.

`challenge`: `by`, `by_address`, `reason`, `bond_wei`, `opened_at`, `decision_challenged`, `evidence_ends`,
`reply_ends`, `close_after`, `rounds`, `network_fault`, `outcome`, `bond_to`, `closed_at`.

`settlement`: `held_sum_wei`, `to_role` (`CLAIMANT`, `RESPONDENT` or `DEPOSITOR`), `to`, `why`, `at`.

### States

```
 DRAFT --accept, inspector, deposit--> OPEN --request_assessment--> DETERMINED --finalize--> FINAL
   |                                     |                           |   ^
   | decline / withdraw / expire         | lapse                     |   | readjudicate / close_challenge
   v                                     v                           v   |
 DECLINED, WITHDRAWN, EXPIRED          LAPSED                     UNDER_CHALLENGE
```

## 6. Methods

Writes. "Anyone" means any wallet, once the condition holds.

| Method | Who | When | Effect |
|---|---|---|---|
| `open_case(terms_json)` | Anyone (becomes the claimant) | At most 5 unfinished cases as claimant | Version 1 of the terms; a draft |
| `revise_terms(case, terms_json)` | Claimant | Draft, not yet accepted, not expired, under 20 versions | A new version; clears the inspector's acceptance |
| `accept_case(case, digest)` | Respondent | Draft, not expired, digest of the current version | Freezes the terms |
| `decline_case(case, reason)` | Respondent | Draft, not yet accepted | Closes the case; refunds any deposit |
| `withdraw_case(case)` | Claimant | Draft | Closes the case; refunds any deposit |
| `accept_inspector(case, digest)` | Named inspector | Draft, not expired, digest of the terms in force | Inspector accepts the role |
| `fund_case(case)` payable | The funder the terms name | Draft, accepted, not expired, exactly the held sum | Holds the sum |
| `expire_case(case)` | Anyone | Draft, 7 days after it was written | Closes the case; refunds any deposit |
| `submit_image(case, meta_json, bytes)` | Party or accepted inspector | Open and in the evidence period, or under challenge in their filing time; under their cap | Stores the image and its digest |
| `submit_text(case, meta_json, text)` | Same | Same | Stores the document and its digest |
| `mark_ready(case)` | Party or inspector | Open, not already marked | Marks their evidence complete |
| `lapse_case(case)` | Anyone | Open, 3 days after the evidence period, no decision | Closes the case; the held sum returns to its depositor |
| `request_assessment(case)` | Claimant or respondent | Open, and the evidence period over or everyone ready. Or: decided, an image unseen (or nothing examined), by the side it went against, inside the window, once for each side | Records a decision |
| `challenge(case, reason)` payable | The side the decision went against | Decided, inside the window, no earlier challenge, exactly the bond | Opens the challenge |
| `readjudicate(case)` | Anyone | Under challenge, the challenger filed something new, the reply time over, under 3 rounds, before `close_after` | A second decision that supersedes the first, or a `NO_RESULT` round |
| `close_challenge(case)` | Anyone | Under challenge: the challenger's time over and nothing new filed; or 3 rounds without a result; or past `close_after` | The first decision stands; the bond is settled |
| `finalize(case)` | Anyone | Decided, the window closed | The decision is final; the held sum is credited |
| `withdraw()` | The owner of a credit | A credit above zero | Pays the caller their credit |

Views: `get_config`, `get_stats`, `get_case`, `get_terms(case, version)`, `list_cases(skip, limit)`,
`cases_of(address, skip, limit)`, `get_evidence`, `get_evidence_text`, `get_evidence_image`, `get_case_evidence`,
`get_decision`, `get_events(case, skip, limit)`, `get_credit(address)`, `get_receipt(case)`. Lists are paged, 50 a
page at most.

## 7. Money

| Path | Where the held sum goes | Where the bond goes |
|---|---|---|
| Declined, withdrawn or expired | Back to its depositor | |
| Lapsed (no decision was ever recorded) | Back to its depositor | |
| Final, `SUPPORTED` | The claimant | |
| Final, any other finding, `NOT_ASSESSED` included | The respondent | |
| Readjudication reverses the side | | Back to the challenger |
| Readjudication keeps the side | | The other party |
| Challenge closed, nothing new filed | | The other party |
| Challenge closed, new evidence filed and no readjudication ever recorded | | Back to the challenger |
| Challenge closed after a round that opened every new image the challenger filed and still lost sight of images the first decision saw | | Back to the challenger |
| Challenge closed after rounds that failed only on the challenger's new files | | The other party |

Every amount is a credit in the contract's ledger (`get_credit`) until its owner calls `withdraw`.
`held_wei + bonds_wei + owed_wei` from `get_stats` equals the contract's balance at all times.

## 8. Failure and uncertainty semantics

| Situation | What happens | What is recorded |
|---|---|---|
| A write the contract refuses | The transaction's execution ends in an error whose text starts `[EXPECTED]` and gives the reason | Nothing |
| A payable write the contract refuses | It returns `{"refused": true, "reason": ..., "credited_wei": ...}` and credits the value back | The credit |
| The leading validator's model cannot read images, gives no usable answer, or fails | The leader raises `[LLM_ERROR]`; validators refuse it; the network rotates the leader | Nothing, unless a later leader succeeds |
| Validators do not agree on what the record binds | No majority: the transaction is undetermined | Nothing. A party asks again |
| Required evidence, or any evidence, is missing | Decided in code | A `CODE` decision, every criterion `INSUFFICIENT`, with what is missing |
| Evidence is thin, indirect or unclear | The model's `INSUFFICIENT`, or floors F1, F2, F4 | `INSUFFICIENT`, with `missing` naming what would settle it |
| Evidence points both ways | The model's `CONFLICTING`, or floor F3 | `CONFLICTING`, with an item on each side |
| An image could not be seen | It counts for nothing (F5) and is listed in `unseen_ids` | The decision; the side it went against may ask again |
| Nothing at all could be examined | Every criterion `NOT_ASSESSED` | The decision; it may be asked for again or challenged |
| A readjudication round could not examine what it had to | `NO_RESULT`: the challenged decision keeps standing | The round, marked `NO_RESULT` |

A finding short of `SUPPORTED` is never a statement that the event did not happen, and no finding is a statement
about who is telling the truth. Every decision carries that in `scope`.

## 9. Receipt

`get_receipt(case)` returns `{"core": {...}, "digest": sha256(canonical(core))}` for a case with a decision.

`core`: `schema` (`keywitness.receipt/1`), `rules`, `case_id`, `case_state`, `terms` (version, digest, title, event
kind, claim, criteria, time zone, window, limitations, property reference), `parties`, `decision` (the whole standing
decision, as in section 4), `history` (every decision's id, round, kind, overall finding, status, time and digest),
`challenge`, `settlement`.

To verify by hand: call `get_receipt`, serialise `core` as JSON with sorted keys, no spaces and ASCII escapes, and
take its sha256; it equals `digest`. Remove `status`, `supersedes`, `superseded_by`, `challenge_window_ends` and
`decision_digest` from `core.decision`, serialise the rest the same way, and its sha256 equals
`core.decision.decision_digest`, which is also what `get_decision` reports for that id for as long as the contract
exists.
