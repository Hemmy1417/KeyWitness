# KeyWitness specification

Status: design of record, written before the contract (2 October 2026) and revised after four adversarial reviews of
it (the last on 4 October 2026). Where the project brief and this file differ, this file records the decision and the
reason.

## 1. What KeyWitness is

A property claim, a set of criteria agreed before any evidence is weighed, evidence from both sides, and an assessment
by independent GenLayer validators that no party and no operator controls. The result is a criterion-by-criterion
finding with the evidence it rests on, a challenge path, and a receipt anyone can check against the chain.

KeyWitness is an evidence assessment and recordkeeping tool. It is not a court, a lawyer, a title registry or a
guarantee of legal admissibility, and a finding never establishes legal liability or proves that an event happened.

## 2. Network

GenLayer Studio Next, chain 61997, RPC `https://studio-dev.genlayer.com/api`, explorer
`https://explorer-studio-dev.genlayer.com`. GenLayer's documentation calls this environment the Studio development
preview and its SDK calls it `studioDevnet`; `studio-next.genlayer.com` is an alias of the same environment, and the
documentation asks integrations to use the canonical `studio-dev` RPC. Nothing silently falls
back to another network: the app refuses to sign on any other chain id.

## 3. Could an oracle or plain code do this?

No, and the split is explicit:

- **Code decides** everything countable: roles, signatures, windows, required evidence present, file sizes and types,
  duplicate bytes, digests, the order of criteria, the rule that turns criterion findings into an overall finding, the
  floors in section 8, and every movement of GEN.
- **Validators decide** what only reading can decide: what a photograph of a ceiling actually shows, whether an
  inspection report and a contractor's photograph describe the same roof, whether an invoice line names the work a
  criterion asks about, whether a date on a document falls before a deadline in the case's time zone, whether two pieces
  of evidence contradict each other, and whether any document carries instructions aimed at the assessor.

No feed publishes whether a particular roof was repaired, and a centralised model run by one party is exactly the party
the other side does not trust. GenLayer supplies a panel neither side picked, an equivalence rule the parties can read,
and a record neither side can edit afterwards.

## 4. Economic substance

A finding moves value when the parties choose to put value behind it:

- **Held sum (optional per case, used by the sample).** Either party deposits the disputed amount (a retention, the
  disputed part of a deposit). The rule is fixed and agreed at acceptance: the claimant receives it if the final overall
  finding is SUPPORTED; any recorded decision that falls short of that sends it to the respondent. The burden of proof
  sits with the claimant, and a finding short of SUPPORTED is never described as proof that the event did not happen.
- **A decision that the evidence could not be examined is still a decision.** A final NOT_ASSESSED sends the held sum
  to the respondent. It can only be recorded by a leading validator that proved it receives images (section 8), so
  evidence it could not open in the attempts allowed is, for the purposes of the burden of proof, evidence that was not
  given. (Changed 4 Oct 2026: it used to return the sum to its depositor, which let a claimant who deposited the sum
  take it back by filing a photograph nobody could open.)
- **No decision, no movement.** If no decision is ever recorded (neither party asks for the assessment and the case
  lapses, or a draft closes), the held sum goes back to whoever deposited it. So that a claim nobody supported cannot
  be left to lapse, either party can have an empty file decided: with nothing filed, the contract records in code that
  nothing was established.
- **Challenge bond.** A case challenge (section 9) costs a bond set in the terms. It comes back if the readjudication
  moves the decision to the challenger's side of the line that decides the held sum (to SUPPORTED for a claimant, away
  from it for a respondent); a new label on the same side is not a success. It also comes back when nothing was
  decided through no fault of the challenger: new evidence was filed and no readjudication was ever recorded, or a
  round that opened every new image the challenger filed still could not see images the first panel had seen. It goes
  to the other party when the readjudication keeps the side, when the challenger brought nothing new, or when no
  round shows the fault was the network's: a round that could not open the challenger's own new files proves nothing
  either way, whatever else it missed.
- **Protocol appeal bond.** Paid to the protocol by the appellant under GenLayer's own rules.

All money is pull-based: amounts are credited to a ledger and leave only through the owner's own `withdraw`.

## 5. Roles

| Role | Who | How the contract knows |
|---|---|---|
| Claimant | Opens the case and makes the claim | The signer of `open_case` |
| Respondent | The other party, named by the claimant | Must sign `accept_case` for the exact terms digest |
| Inspector | Optional independent third party named in the terms | Must sign `accept_inspector` for the exact terms digest; never a party |
| Anyone | Liveness actions only | Finalize, close, lapse, readjudicate once due |

Every recorded account is the signer of its own transaction. A claimant cannot respond to their own case, and the
inspector cannot be either party.

## 6. Case terms (versioned)

A terms version holds: title, event kind, property reference (a nickname, never an address), time zone (IANA name),
optional window start and deadline (local time in that zone), the claim (one falsifiable sentence), 1 to 6 criteria
(id, text, whether it needs independent evidence), allowed evidence kinds, required evidence (kind and minimum count),
known limitations and excluded inferences, the held sum and which party funds it, the evidence period, the challenge
window, the challenge evidence period and the challenge bond.

- The claimant may publish new versions while the case is a draft, at most 20. Every version is kept with its sha256
  digest over the canonical JSON.
- The respondent accepts one version by its digest: the basis of the assessment is bound when both sides have agreed
  to it. After that the terms are frozen: no method can change them. A named inspector accepts by digest too, and a
  new version clears the inspector's acceptance, so a case never opens on terms the inspector did not see.
- A draft is good for seven days. After that it cannot be accepted, funded or revised, only closed.
- Text is stored as written or not at all. A title, claim, criterion, limitation or description that is too long is
  refused, never cut: cut to fit, "all slates replaced, except above the porch" could be stored as "all slates
  replaced". A value that is not text (a number, a list, an object) is refused rather than converted.
- A window start or deadline is a date, or a date and a time to the minute, in the case's time zone: seconds, an
  offset or a trailing Z are refused rather than dropped, because 17:00 UTC cut to fit would silently become 17:00 in
  the case's own zone. A deadline given as a day means the whole of that day; the validators are told so.
- The challenge window is at least one hour. A decision is dated by the transaction that asked for it, and an
  assessment can take many minutes to be agreed; a shorter window could close before the decision lands.
- Required evidence must be something one party can file alone (at most 5 images and 4 documents), or the other
  party could starve the case by filing nothing. A required document counts as an image when the terms allow no text
  documents, since it can then only be filed as a page.
- A number is an integer or a string of the digits 0 to 9, and a list is a list. Other scripts' digits, signs,
  spaces, and a list given as something else are refused rather than read.
- Changing criteria after a decision means opening a follow-up case that cites the earlier one; the earlier case, its
  terms and its decisions stay as they are. A follow-up must cite a case that is closed (final, or ended without a
  decision) and was between the same two parties (either way round); it then belongs to the same dispute thread.

## 7. Evidence

| Kind | Stored | What validators receive |
|---|---|---|
| PHOTO | JPEG or PNG bytes on chain, at most 400 KB | The image itself |
| DOCUMENT_PAGE | JPEG or PNG of a document page | The image itself; the examining validator transcribes it (up to 30 lines; a longer page is marked as cut) |
| VIDEO_FRAME | One still chosen in the browser | The still only; the video is never stored or assessed |
| TEXT_DOCUMENT | Plain text, at most 6,000 characters | The text, fenced as untrusted content |

Each item records: evidence id, case id, kind, document type, sanitized file name, content sha256 computed by the
contract over the stored bytes, filed-at (transaction time), declared capture time (marked as declared), filer role and
address, description (a claim), criteria it is offered for (a declared mapping), redaction state (declared), whether it
was filed during a challenge, and where identical bytes were first filed (`first_filed_in`) and by whom
(`reuse`: SELF for the same wallet in a case with a different other party, RELATED for the same wallet in an earlier
case between the same two parties, OTHER for a different wallet).

- The browser redraws every image as a JPEG, which removes camera metadata including location, and keeps it under the
  size limit. The contract holds a direct caller to part of the same: it walks the structure of every image (a JFIF
  JPEG up to its first scan, a PNG chunk by chunk) and refuses one whose structure is broken, one whose sides are
  outside 16 to 4096 pixels, and one that carries the usual metadata blocks (camera data, an editor record, a comment,
  a PNG text or time chunk). The check is structural. It does not decode pixels, so it cannot promise that every
  accepted file opens in every decoder, and a caller who goes around the app can still hide bytes where a structural
  check does not look (another application segment, a thumbnail, data after the first scan header). A file nobody can
  open is unseen and counts for nothing. KeyWitness never treats metadata or a declared time as proof of when
  something was captured.
- The browser offers a redaction tool (opaque rectangles burned into the pixels before upload).
- One role cannot file the same bytes twice in one case. Another role can: a report both sides hold is each side's to
  file. Who filed an item decides what it counts for, so if the bytes could be filed only once, a party could take the
  other side's document away from them by filing it first. Identical copies are one piece of evidence: the validators
  are told so and asked to name every copy, and a copy is visible when its twin is. Each copy stays its own filer's
  item. A copy the model names brings in the other roles' copies, so which copy a model happens to cite does not decide
  whose evidence it is, with one exception: a copy filed by the party a list favours brings in nothing. Its filer
  wrote its description, so citing it can never turn the other side's original into an admission, or the inspector's
  into corroboration. A flag binds the copy the model named and no other. (Changed 4 October 2026. Copies used to be
  read as one item in every respect. Filed evidence is public, so a party could copy the other side's document,
  write an instruction into the copy's description, and have the flag fall on the original.)
- Bytes filed before in another case are accepted, recorded on the item and told to the panel. One kind of reuse is
  floored (F7): the claimant bringing its own file from a case with a different other party cannot rest the claim on
  it. Nobody else's reuse is floored. The claimant chooses the wallet a case is opened from, so a floor on the
  respondent's reuse could be set off by opening the same dispute again from another wallet. Between the same two parties
  a refiled item is the same dispute continuing, whether or not the new case cites the old one; the claimant alone
  writes that citation, so nothing turns on it. An opponent could plant a party's genuine file in a throwaway case
  first, so bytes another wallet filed first are only flagged. Identical bytes are a weak signal in any case: changing
  one byte evades the check, and the docs say so.
- New evidence from anyone clears every role's mark that its evidence is complete, so a side that files last cannot
  ask for an early assessment the other side never had a chance to answer.
- Everything filed is public on chain and permanent. The app says so before every upload and requires an
  acknowledgement; the sample uses synthetic evidence only.

## 8. The assessment

Run when either party asks after the evidence period, or earlier once both parties (and the inspector, if one is
named) have marked their evidence complete.

**Code first.** If required evidence is missing, or nothing was filed at all, the contract records a decision without
asking validators: every criterion INSUFFICIENT, with what is missing named.

**Who can see.** Measured on Studio Next on 3 October 2026 with a disposable probe contract: several validator routes
are sent no image at all, and one describes pictures it was never given. So before a node examines evidence images its
model must read six digits from a calibration image the contract draws (a hand-written greyscale PNG, identical on
every node, with a different code for every assessment). A model that receives no image, or invents what it shows,
cannot read it. The code depends on the case, the round, the files, and the moment and sender of the request for the
assessment, so no file alone fixes it. A party who also sends the request chooses that moment and that wallet and
could search for a combination that gives a particular code. That matters only if some model that receives no image
answers with a predictable row of digits, which was not observed; it is listed as a residual risk.

- A node that fails the calibration cannot lead a case that has images: its round fails and the network rotates the
  leader. A decision is recorded only when the leading validator's model read the calibration image.
- A validator that passes examines every image itself, and dissents if the leader counted fewer images than it saw.
- A validator that fails cannot check the photographs. It reads the leading validator's notes on each image, cut to a
  fixed shape and labelled as the leading validator's, and judges the criteria from those and the documents. This is a
  stated trust assumption, not a hidden one: with a blind majority, what the photographs show rests on the leading
  validator and on the validators that can see.
- A case with no images needs no calibration.

**Then each node:**

1. *Examines* every image two at a time, a party's images only beside the same party's, without reading anyone's
   description of them: what is visible, legible text, visible dates, anything suggesting a different property, and
   image quality. If a prompt is refused, each image is examined again on its own, so one unreadable file never blinds
   another. An image a node cannot see counts as unseen for that node. A document page keeps up to 30 lines of its
   text and a photograph up to 8; a longer transcript is marked as cut in the record and to the judge.
2. *Judges* each criterion from those notes and the fenced documents. Descriptions, declared dates and the
   evidence-to-criterion mapping are presented as the filer's claims, never as facts. For every criterion the model
   names the items that support it and the items against it, the same way whatever it finds; code works out which list
   a finding rests on (the items against the criterion for NOT_ESTABLISHED, the items that support it otherwise). An
   item named on both sides counts on neither. Copies of the same bytes filed by different roles are handled as
   section 7 says.

**An answer that judges nothing is not a finding.** A node's answer must give every criterion a finding from the
vocabulary. A refusal, an empty object, other key names, an answer cut off part way or a label of the model's own is
asked for once more and then fails the node: a leader's round is not agreed and the network rotates the leader; a
validator dissents. Read as "insufficient", such an answer would decide the case for the respondent on a model's
non-answer, and a broken validator would be a vote for one side. Validators refuse a leader's result that does not
judge every criterion in the same way. A slip of form beside a conclusive finding is treated the same: an adequacy
that is not true or false, or a list of items that is not a list. Cut to shape, such an answer would be floored for
its form and not its substance, so it is checked as the model gave it, before anything is cut.

**Finding vocabulary (per criterion).**

| Finding | Meaning |
|---|---|
| SUPPORTED | The evidence affirmatively shows the criterion is met |
| NOT_ESTABLISHED | The evidence was adequate to assess the criterion and shows it is not met |
| CONFLICTING | Material evidence points both ways and none of it outweighs the rest under the criteria |
| INSUFFICIENT | Evidence for the criterion is missing, unreadable or inadequate to conclude |
| NOT_ASSESSED | The criterion could not be assessed for a technical or workflow reason |

**Floors applied in code, identically by the leader and every validator.**

- F0: a label outside the vocabulary becomes INSUFFICIENT. (No recorded decision reaches it any more, since such an
  answer fails its node; the floor stays so the code never trusts a label.)
- F1: a conclusive finding (SUPPORTED or NOT_ESTABLISHED) must rest on at least one item that exists on the case and
  that the node saw; otherwise INSUFFICIENT.
- F2: a criterion marked as needing independent evidence can be conclusive only with an item filed by the inspector in
  its basis; otherwise INSUFFICIENT.
- F3 (both directions): a conclusive finding whose basis comes only from the party it favours, while the panel
  names material evidence the other way filed by the other party or the inspector, becomes CONFLICTING. An admission
  (the disfavoured party's own item in the basis) or an inspector item lifts the floor.
- F4: a conclusive finding the panel itself marks as resting on inadequate evidence becomes INSUFFICIENT.
- F5: items a node could not see are removed from both lists (recorded only when an item was actually unseen).
- F6: an item the panel flags as carrying instructions aimed at the assessor never counts for the side that filed
  it: not in the basis of a finding that favours that side, and not among the items that weigh against the other
  side, where F3 would otherwise read them. The inspector has no side, so its flagged items count for neither. A flag
  binds the item named and no copy of it.
- F7: bytes the claimant brought from a case with a different other party never count for the claimant, in the same
  two places. The record shows F6 and F7 together, as `F6/F7`.
- F8: CONFLICTING needs an item on each side; otherwise INSUFFICIENT.
- If nothing was visible to a node at all (no image seen and no text on the case), every criterion is NOT_ASSESSED.

**Asking again.** A decision reached without seeing every image (NOT_ASSESSED, or any other finding with an image
unseen) can be asked for again by the side it went against, without a bond, inside the challenge window. Each side
may do so once. Validators that could not look have not judged that evidence. The bound means a file nobody can open
buys its filer one more assessment and one more window and no more, and the other side has the same right if that
assessment goes against it. (Changed 4 October 2026: one allowance of two, shared by the case, let one side take both
turns and leave the other none.)

**Overall finding (code).** Any NOT_ASSESSED gives NOT_ASSESSED; otherwise all SUPPORTED gives SUPPORTED; otherwise any
NOT_ESTABLISHED gives NOT_ESTABLISHED; otherwise any CONFLICTING gives CONFLICTING; otherwise INSUFFICIENT.

**What validators must agree on (equivalence).** Each validator runs the whole assessment itself, applies the floors to
its own result and to the leader's, and agrees only if both give the same answer to two things: for every criterion,
whether it is SUPPORTED; and whether anything could be assessed at all. Those are what a consequence depends
on: the held sum moves to the claimant only when every criterion is supported, and "supported" is the record's
strongest statement about a party. A decision is recorded when a majority of validators agree; the record says
"a majority", not "every validator".

The finer label of a criterion that is not supported (not established, conflicting, insufficient), and so of the
overall finding, is the leading validator's reading and is recorded as such. This was changed after two live rounds on
3 October 2026 in which every node agreed that the sample claim was not supported and split on the labels: whether an
inspection report makes a criterion "not established" or "conflicting" turns on which items a model cites, and honest
models differ. The first rule (identical labels on every criterion) reached no majority in four leader rotations,
twice.

Before comparing, every node shapes both results the same way: ids that are not on the case and criteria that are not
in the terms are removed, and a label outside the vocabulary is floored (F0). A validator also dissents if the leader
omits an image the validator saw or claims one that is not on the case, and if a flag on an item that tried to instruct
the assessor, held by only one of the two, would change what the record binds.

**What is recorded.** Terms version and digest, the evidence manifest digest at the moment of assessment (the
snapshot each panel judged), seen and unseen images, whether the leading validator read the calibration image, per
criterion the model's label, the floors applied, the final finding, what it rests on, what points the other way,
missing evidence and rationale, the notes on each image (one bounded entry per image, text from strings only),
limitations, the overall finding, injection flags, what consensus bound and what the leading validator alone recorded,
a statement of scope (what a decision is and is not: not a legal finding, not a finding about who is telling the truth,
not proof of when a photograph was taken), and a digest over all of it. Everything except the bound facts is labelled
in the record, on the receipt and in the app as the leading validator's.

**The receipt.** `get_receipt` returns the case's terms, parties, its whole standing decision, its history, challenge
and settlement, and the digest of all of that. That digest changes as the case moves on. The decision inside does not,
so a verifier recomputes the decision's own digest from the receipt and compares it with `get_decision`: a receipt
whose case has since settled is found true and out of date, which a made-up file can never be.

**Prompts.** Every string a party wrote, and everything read off an image, reaches a model inside a fence that opens
with a label and a 16-character tag and closes only where the same tag appears again; the tag is 64 bits of the hash
of what the fence encloses, so party text cannot contain it. Before fencing, control characters, lone surrogates (which
the network's encoder refuses, and which would otherwise make every assessment fail), invisible and reordering
characters are removed and look-alike brackets are folded, and a closing line spelled with look-alike letters of
another script is found and broken up without rewriting the party's text. The examiner's prompt carries no party text
at all.

## 9. Challenges and appeals

Two separate mechanisms, never conflated in the interface.

**Protocol appeal (GenLayer).** Any assessment transaction can be appealed during its protocol appeal window with the
SDK's `getAppealCharge` and `appealTransaction`. A fresh, larger committee rechecks the same proposal. The window comes
from the network (30 seconds on Studio Next, read from `sim_getFinalityWindowTime` and the transaction's own
timestamps), and eligibility comes from `gen_getTransactionLifecycle` (`decisionActive`, a non-null `decisionId`, a
decided stored status). Probed on Studio Next on 2 October 2026: a validator appeal was accepted, failed as it should
for a correct result, and the contract stayed intact.

**Case challenge (KeyWitness).** The party the overall finding went against may challenge within the case's challenge
window by posting the bond and stating a reason; a NOT_ASSESSED decision can be challenged too, by the claimant. A case
has at most one challenge.

- *Filing.* The challenger files new evidence during the challenge evidence period. The other party and the inspector
  may file from the start and have as long again after the challenger's time ends, so evidence dropped in the last
  second can still be answered.
- *Readjudication.* Anyone, either side included, can run it once the reply time has ended, and only if the challenger
  filed at least one new item. It judges the whole file afresh, told which items are new, and does not see the first
  decision. The first decision is kept and marked superseded, and the readjudication is the last word.
- *A round that could not look.* A round counts only if it saw the images the first panel saw and the challenger's new
  images. One that did not is recorded as NO_RESULT, changes nothing and can be run again, three rounds at most. The
  other side's own unreadable files never hold a round up: they count for nothing.
- *Closing.* If the challenger filed nothing new, anyone can close the challenge when the challenger's time ends, and
  the bond goes to the other side. Otherwise anyone can close it after three rounds without a result, or three days
  after the reply time. The first decision stands. The bond goes back to the challenger if no readjudication was ever
  recorded (nobody ran one, or the validators never agreed, which leaves no trace the contract can see) or if a round
  that opened every new image the challenger filed still could not see images the first panel had seen; it goes to
  the other side otherwise, because a round that could not open the challenger's own new files proves nothing about
  the network, whatever else it missed. A challenger who stalls gains only the delay, and the other side can end it by running
  the readjudication.

## 10. Case states

| State | Who moves it | If nobody acts |
|---|---|---|
| DRAFT | Claimant revises terms; respondent accepts or declines; inspector accepts; the funder deposits the held sum | After 7 days nothing moves it forward and anyone expires it; any deposit is credited back |
| OPEN | Parties and inspector file evidence and mark ready; either party requests the assessment, with an empty file too | Anyone lapses it 3 days after the evidence period ends; nothing was decided, so the held sum goes back to its depositor |
| DETERMINED | The disfavoured party may challenge inside the window, or ask again if an image was not seen | Anyone finalizes once the window has passed |
| UNDER_CHALLENGE | The challenger files new evidence, the other side and the inspector answer; anyone runs the readjudication once due | Anyone closes it; the first decision stands and the bond follows the rule in section 9 |
| FINAL, DECLINED, WITHDRAWN, EXPIRED, LAPSED | Terminal | Credits wait in the ledger for `withdraw` |

## 11. Privacy

Everything written to Studio Next is public and permanent. KeyWitness minimises what goes there and says so plainly:
pseudonymous property references, wallet addresses instead of names, image redaction and metadata removal before upload,
plain-text documents only (no document parsers), and an acknowledgement before every filing. The contract refuses an
image that carries the usual metadata blocks, which closes the ordinary ways camera data rides in a file; the check is
structural, so it is a guard and not a guarantee against a caller who goes around the app. A receipt never carries
evidence descriptions, the text of filed documents or image bytes. Its private mode carries the whole decision, which
includes the leading validator's notes on each image and so any text it read off a photographed page. Its public mode
leaves those notes out, along with party addresses, the property reference, the validators' prose, the requester's
address, the challenge reason, the payee's address and declared capture times, keeping findings and digests. Anyone
with the case id can still read the chain, and the app says that too.

## 12. Pages

Landing, dashboard (`/cases`), create-case wizard (`/cases/new`, five steps, local draft), case detail
(`/cases/[id]`), evidence workspace (`/cases/[id]/evidence`), decision centre (`/cases/[id]/decision`), receipt
(`/cases/[id]/receipt`), receipt verification (`/verify`), sample case (`/sample`, synthetic and labelled), and settings
and network status (`/status`, with `/api/health`). Every act a party can take is reachable from these pages,
availability is a pure function of chain state, and an unavailable act is shown with the contract's reason in
words.

## 13. Design

Source: styles.refero.design, Aspelin Reitan ("candlelit architectural archive"), remapped to the brief's palette.
Midnight navy full-bleed plates alternate with warm ivory folios; square cards with hairline borders and no shadows;
outlined controls, with one filled ink button for the primary act of a view; a type scale that stops at 44px.
Atkinson Hyperlegible Next for all text and Atkinson Hyperlegible Mono for digests and identifiers, chosen for
legibility of evidence. Teal marks SUPPORTED, red marks NOT_ESTABLISHED and errors, amber marks CONFLICTING and
INSUFFICIENT, slate marks NOT_ASSESSED, and every finding also carries an icon and a word. Evidence items are shown as
exhibit tags with a keyhole punch. Logo: a doorway outline holding a keyhole whose lower stem turns into a check.

## 14. Principles applied from the start

| Principle | Where it lands |
|---|---|
| Time comes from the transaction, and both sides get a real evidence period | Wall-clock windows from the transaction time; an enforced evidence period both parties can use |
| Validators agree on what a consequence depends on | Whether each criterion is supported, and whether anything could be assessed, are the equivalence set, computed after the floors; every field validated before it touches state; what only the leading validator recorded is labelled as such |
| The contract holds what it judges | Evidence bytes stored and hashed by the contract; terms bound by digest at acceptance; parties sign their own roles |
| A judgment has to matter | Held sum and challenge bond ride on the finding |
| Reads stay bounded | Paged views over maintained indices; no unbounded scans |
| Tests cover the hard paths | Direct tests including concurrency, post-terminal and conservation invariants |
| Claims match proof | Docs and proofs claim only what code and assertions show |
| A second look reads the same bytes | Readjudication reads the stored bytes; each decision records the manifest digest it judged |
| Nothing can be held hostage | Every non-terminal state has a permissionless exit after a deadline |
| Party text is data | Every party string fenced and defused before it enters a prompt: titles, the time zone and the claim included; video times are digits only; invisible and look-alike characters are removed or folded first |
| Thin evidence cannot conclude | Inadequate evidence gates every conclusive finding |
| Money is in place before it is needed | The held sum is deposited before the case opens; finalization settles everything at once |
| A label is a claim | Declared mappings, dates and labels are presented to the panel as claims |
| "Final" means final | "Finalized" shown only for a FINALIZED transaction with a successful execution |
| Floors work both ways | Floor F3 in both directions, with mirror tests |
| One deployment | One deployment address across every config surface |
| The app offers what the chain allows | Whole lifecycle reachable in the app; availability rules shared with the proofs |
| Accounts are signers | Recorded accounts are signers |
| A non-answer is not a finding | A model's refusal, empty or cut-off answer fails its node; it is never read as "insufficient" |
| Nobody's role turns on who filed first | The same bytes may be filed by each role; reuse is judged by the parties, not by a citation one side writes |
| A floor never strengthens a finding for the party who can set it off | A flag stays on the copy it was found on; only the claimant's own reuse is floored; a copy filed by the favoured party brings in nothing |
| Value is never stranded | A payable write refuses by returning and crediting the sender, whatever went wrong while reading the request |
| Flags are tested both ways | Live negative controls for injection and conflict flags |
