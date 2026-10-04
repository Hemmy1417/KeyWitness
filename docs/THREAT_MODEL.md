# KeyWitness threat model

What KeyWitness defends, against whom, how, and what it does not defend. Every mitigation names where it lives, so it
can be checked. Residual risks are stated as plainly as the mitigations.

## What is being protected

1. **The record.** Terms, evidence, decisions and settlements, as the contract stored them.
2. **The basis of a decision.** The criteria both sides accepted, and the evidence each decision judged.
3. **Money.** A held sum and a challenge bond, when a case carries them.
4. **Privacy.** As far as a public chain allows: nothing reaches it that the filer did not choose to file.

## Who can act

| Actor | Can | Cannot |
|---|---|---|
| Claimant, respondent | Write terms, accept them, file evidence, ask for the assessment, challenge | Change accepted terms, file for the other side, move money except by `withdraw` of their own credit |
| Inspector | Accept the role on one exact terms version, file evidence | Be a party, ask for the assessment, challenge |
| Anyone | Read everything; expire, lapse, finalize, close or readjudicate a case once it is due | Any of the above before it is due; anything that needs a role |
| A validator leading a round | Propose a result | Have it recorded unless a majority of validators, each running the assessment itself, reproduces what the record binds |
| The deployer | Nothing. There is no owner, no admin method, no upgrade path and no operator key | |
| The web app | Build transactions for a wallet to sign | Sign, hold keys, or write anything the contract does not check again |

Anyone can call the contract directly, so the app is never a trust boundary: every rule below that matters is enforced
in `contracts/keywitness.py`, and the app's own checks only save a wasted signature.

## Trust assumptions

- **A majority of the validators chosen for a transaction run the contract honestly.** That is GenLayer's assumption,
  not one KeyWitness adds.
- **Models that cannot see images.** Measured on Studio Next on 3 October 2026: several validator routes are sent no
  image at all, and one describes pictures it was never given. KeyWitness makes a node read a calibration image before
  it may examine evidence; a node that fails cannot lead, and as a validator it judges from the leading validator's
  notes on each image. So with a majority of blind validators, **what the photographs show rests on the leading
  validator and on the validators that can see.** This is the largest residual risk in the design and it is written
  into every decision (`calibrated`, `bound`), every receipt and the decision page.
- **The calibration code can be searched for.** It depends on the case, the round, the files, and the moment and
  sender of the request. A party who sends the request chooses the last two and could look for a combination that
  gives a particular code. That gains nothing unless some model that receives no image answers with a predictable row
  of digits; none observed did.
- **What consensus binds.** For each criterion, whether it is supported; and whether anything could be examined at
  all. The finer label of an unsupported criterion, the cited items, the reasoning, the flags and the notes on each
  image are the leading validator's and are recorded as such. Two live rounds on Studio Next reached no agreement in
  four leader rotations each when identical labels were required; honest models differ on them.

## Threats and mitigations

### Files

| Threat | Mitigation | Residual risk |
|---|---|---|
| Oversized uploads | An image is at most 400,000 bytes and a document 6,000 characters, refused in `submit_image` and `submit_text`. Each party: 5 images and 4 documents; the inspector: 3 and 3; each role 2 and 2 more during a challenge (`CAPS`, `CHALLENGE_CAPS`). JSON is refused on size before it is parsed (`_json`) | Storage is paid for by the filer in fees; nothing else limits total volume across cases |
| MIME spoofing | The app reads a file's type from its first bytes, never its name (`web/lib/images.ts`, `sniff`). The contract accepts only bytes that open as a PNG or a JFIF JPEG and walks their structure (`_jpeg_problem`, `_png_problem`) | The compressed scan itself is not decoded on chain. A file with a valid structure and a corrupt scan is stored; a validator that cannot see it reports it unseen and it counts for nothing |
| Malformed documents and parser vulnerabilities | There are no document parsers. Documents are plain text, or an image of a page that a validator reads. The app decodes images with the browser's own decoder and redraws them on a canvas | A flaw in a browser's image decoder is the browser's |
| Huge image dimensions | Each side must be 16 to 4096 pixels, read from the JPEG frame or the PNG header | None known |
| Embedded metadata (location, device, time) | The app redraws every image, which drops everything that is not pixels, then strips any block an encoder added (`cleanJpeg`). The contract refuses a JPEG with an EXIF, IPTC or comment segment and a PNG with a text, time or EXIF chunk, which closes the usual carriers to a direct caller too | The contract's check is structural and does not decode pixels: a caller who goes around the app can still hide bytes in another application segment, a thumbnail or after the first scan header. The app never produces such a file. Metadata painted into the pixels (a camera date stamp) is content. The validators are told a date in an image is not proof of when it was taken |

### Evidence content

| Threat | Mitigation | Residual risk |
|---|---|---|
| Prompt injection in documents, images or recognised text | Every string a party wrote, and everything read off an image, reaches a model inside a tagged fence (`_quoted`, `_block`). The tag is 64 bits of the hash of what the fence encloses, so party text cannot contain it. Control and invisible characters and lone surrogates are removed (`_visible`); look-alike brackets are folded (`_fold`); a closing line spelled with Cyrillic or Greek look-alike letters is found and broken up (`_fence`). The examiner's prompt carries no party text at all | A model can still be swayed by text it is told to treat as data. The tag raises the cost of a look-alike closing line; it does not make a model immune |
| Evidence that instructs the assessor to change the criteria or dictate a finding | The criteria come from the accepted terms, outside any fence. The judge is asked to list items that try to instruct it; a flagged item never counts for the side that filed it, in a basis or against the other side (floor F6). A flag binds the item the model named and no copy of it, so an instruction written into the description of a copy of someone else's document cannot take that document's weight away. A validator dissents if a flag held by only one of the two would change what the record binds | The flag is the leading validator's. If both sides filed the same bytes and the instruction is in the bytes, a model that flags only one copy leaves the other counting for its filer; the judge is asked to list every copy. A model that misses an instruction and is not swayed by it changes nothing; one that misses it and is swayed has to carry a majority |
| Fabricated or altered images and documents | Not detected, and never claimed to be. The contract proves a file was not changed after filing, nothing more. Both sides file; a finding that rests only on one side's evidence against material evidence from the other is floored to CONFLICTING (F3); a criterion the parties marked as needing independent evidence needs the inspector's item (F2) | A convincing fabrication the other side does not rebut can carry a criterion. This is stated on the landing page, the evidence page and every receipt |
| False or misleading timestamps and EXIF | Metadata never reaches the chain. A declared capture time is stored as the filer's claim and presented to the judge inside a fence as a claim. The judge is told a photograph shows what was visible, not when; a criterion that turns on an unclear time is INSUFFICIENT | A date painted into an image may persuade a model. The agreed limitation "dates printed on photographs are not verified" is part of the sample's terms and can be part of any case's |
| Duplicate evidence under different filenames | Identity is the sha256 of the stored bytes, computed by the contract; names play no part. One role cannot file the same bytes twice on a case. Where the same bytes were filed before is recorded on the item and told to the judge. Bytes the claimant brings from a case with a different other party never count for the claim (F7). Nobody else's reuse is floored: the claimant picks the wallet a case is opened from, so a floor on the respondent's reuse could be set off by reopening the dispute from another wallet | Changing one byte defeats an identical-bytes check. It is a weak signal and the documents say so. A claimant who refiles identical bytes against a different wallet gets no weight for them |
| Capturing the other side's document, or neutralising it with a copy | The same bytes can be filed by each role, and each copy stays its own filer's item. A copy a model cites brings in the other roles' copies (`twins`), so filing the other side's report first does not make it yours. A copy filed by the party a list favours brings in nothing, so citing your own copy never turns the other side's original into an admission or the inspector's into corroboration. A flag stays on the copy it was found on | A party who copies the inspector's report, and whose copy alone the model cites in its favour, does not get the inspector's weight for it. That is the copier's own doing, and the judge is asked to name every copy |
| Selective evidence and missing context | Both sides file, and new evidence from anyone clears every role's "my evidence is complete" mark, so the other side can answer before an early assessment. Terms can require evidence; if it is missing, the contract records INSUFFICIENT in code. The judge is told that missing evidence is never proof that something did not happen | A party with the only copy of a decisive record can withhold it. The finding is then about the evidence filed, which is all it ever claims to be |
| Hallucinated or unsupported conclusions | Floors in code, applied identically by every node (`_settle_criterion`): a conclusive finding must cite an item that exists on the case and that the node saw (F1, F5); a finding the model itself marks as resting on inadequate evidence becomes INSUFFICIENT (F4); a conflict needs an item on each side (F8). The overall finding is computed, never read from a model. An answer that does not judge every criterion fails its node instead of being read as a finding. No confidence percentage exists anywhere | A model can cite a real item for a conclusion the item does not support. The cited ids, the reasoning and the stored bytes are public, so anyone can check |

### People and roles

| Threat | Mitigation | Residual risk |
|---|---|---|
| Role abuse | Every recorded account is the signer of its own transaction. A claimant cannot be their own respondent; an inspector cannot be a party; the respondent and the inspector each accept one exact terms version by its digest | A party can use two wallets to play claimant and inspector. Wallets are not identities, and the terms name the inspector, so the other party sees and accepts the address |
| Conflict of interest of the inspector | Named in the terms, which the respondent accepts. A new terms version clears the inspector's acceptance | Independence is the parties' judgment, not the contract's |
| Changing criteria after seeing an outcome | Terms are frozen at acceptance; no method changes them. A decision records the terms version and digest it judged. A challenge reason is presented as argument, not evidence, inside a fence. Different criteria mean a new case that cites the old one | None known |
| Unauthorized evidence access and direct object references | There is no private evidence, so there is nothing to bypass: everything filed is public on chain, and the app says so before every filing and requires an acknowledgement | See Privacy |
| Spam and abuse | A wallet may have at most 5 unfinished cases as claimant; terms have at most 20 versions; reads are paged; no write loops over unbounded storage. Every write costs its sender fees | Fees are the only price of filling the chain with cases |
| Replayed or duplicate transactions | Each write checks state first (a second acceptance, deposit, challenge or finalize is refused). The app freezes a transaction when its review opens and shows one flow at a time | A wallet can still sign the same request twice; the second is refused by the contract |

### Money

| Threat | Mitigation | Residual risk |
|---|---|---|
| Value lost in a refused payment | On this network a payable write that raises keeps the value. `fund_case` and `challenge` therefore never raise with value attached: they credit the sender and return the refusal, whatever went wrong while the request was read | Value sent with a call to a method that takes none is the network's to handle, not the contract's |
| Paying the wrong party | Money leaves only through `withdraw`, which pays the caller their own credit. The held sum moves once, at finalize, by a rule fixed at acceptance. Tests assert `balance == held + bonds + owed` after every step of randomized runs | None known |
| A claimant who deposited the sum taking it back without proving anything | Either party can have an empty file decided in code. A decision that the evidence could not be examined sends the sum to the respondent like any other decision short of SUPPORTED. Only a case with no decision at all (nobody asked) returns it | If neither party asks for the assessment, the depositor gets the sum back. That is the intended meaning of "nobody pursued it". The same happens if no assessment can ever be agreed: evidence that made every model refuse to answer would leave the case to lapse, to its depositor's gain. Not observed; it depends on how the network's models behave |
| Challenge abuse | One challenge per case, by the side the decision went against, with a bond. It is judged again only if the challenger files something new. The other side has as long again to answer. The bond is lost if the new decision keeps the same side. When no round gives a result, it comes back if new evidence was filed and no readjudication was ever recorded, or if a round that opened every new image the challenger filed still lost sight of images the first panel had seen | A challenge is a second draw of a panel whose members differ. The bond is the price of that draw; a borderline case can flip. A challenger with a sound new photograph loses the bond if no round in three can open any image: the contract cannot tell that from a file that does not open |
| Redrawing a decision for free | A decision that did not see an image can be asked for again without a bond, by the side it went against, once for each side | A file nobody can open buys its filer one more assessment and one more challenge window. The other side has the same right if that assessment goes against it |
| Stalling | Every state has an exit anyone can trigger after a deadline: expire a draft, lapse an open case, close a challenge, finalize | A challenger who brings evidence and never runs the readjudication gains the delay (the challenge period, the reply period and three days) at no cost if the other side does not run it either. The other side can, and wins the bond if it confirms |

### Network and interface

| Threat | Mitigation | Residual risk |
|---|---|---|
| Wallet on the wrong network | The app refuses to sign on any chain but Studio Next (61997) and asks the wallet to switch. One network definition is shared by the wallet layer, the SDK and the Transaction Kit | None known |
| Transaction timeout, undetermined outcome, RPC failure | The app follows each transaction through the network's own lifecycle read and calls it "finalized and recorded" only when it is final, the validators agreed, and the contract executed without refusing. An undetermined round is shown as "nothing was recorded". Reads retry on a growing delay and say they are retrying | The network can stall a transaction. The app reports the status the network reports |
| False success messages | Nothing on a page comes from the app's own memory of what it sent. Every state shown is read from the contract; a transaction list labels each entry by what it did (recorded, refused, undecided), worked out from its consensus rounds, not by what it asked for | The list of a case's transactions comes from the explorer. If the explorer is down, the page says so; the record does not depend on it |
| A slow decision landing after its challenge window | A decision is dated by the transaction that asked for it. The challenge window is at least one hour (`MIN_CHALLENGE_WINDOW`), well above the minutes an assessment takes | A round slower than an hour would land with its window closed. Not observed |
| Private information in receipts, URLs, logs or chain data | URLs carry only a case id. The app logs nothing and has no server state. A public receipt leaves out addresses, the property reference, the validators' prose and notes, the challenge reason and declared capture times. The app warns when text being filed looks like contact details or an access code | The chain is public and permanent. See `PRIVACY_AND_DATA_RETENTION.md` |

## The assessment rules, and where each is enforced

| Rule | Where |
|---|---|
| Evidence and text read off images are data, never instructions | Fences and the judge's and examiner's prompts (`_judge_prompt`, `_examine_prompt`) |
| The criteria and the contract's rules take precedence over anything in evidence | Criteria are quoted from the accepted terms; flags and F6 |
| Every material finding cites the exact evidence ids it rests on | `basis` and `contrary` on every criterion; F1 |
| Unsupported inferences are flagged | The judge must mark an inference as one and may not rest a finding on it; `missing` and `limitations` record what was not shown |
| Fraud is never inferred from disagreement, missing files or poor image quality | The judge's rules; no finding in the vocabulary means fraud |
| No legal determination, no guilt | The `scope` statement in every decision and receipt; the footer and landing page |
| When evidence does not support a reliable finding, the result is INSUFFICIENT or CONFLICTING | Floors F1 to F4 and F8 |
| No confidence percentages | None exist |

## What has been tested, and what has not

- 395 direct tests, a sweep of 286 mutants and four adversarial reviews of the contract, the last three after the design
  was complete. Each review found real defects; `docs/TESTING.md` lists what changed.
- A live run on Studio Next of every path named in this document that can be exercised live (`docs/proofs/live.md`).
- **Not tested live:** an assessment at the evidence caps (up to 36 items on one case), a round slower than its
  window, a successful protocol appeal (the one sent failed, as it should for a correct result), and a case where a
  sighted validator outvotes a blind majority.
- **Not tested at all:** real disputes. The sample and every live case use synthetic evidence.
- **Known to depend on the models:** an image that some models open and others refuse makes "seen" depend on which
  validator leads, and with it the right to ask again and the result of a readjudication round. Which images a leader
  saw is the leader's report: a validator that can see catches an image left out, and nothing catches one wrongly
  claimed except a majority that can see.
