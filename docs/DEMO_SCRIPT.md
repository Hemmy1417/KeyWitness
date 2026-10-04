# Demo script

A walk through KeyWitness in about four minutes, for a recording or a live showing. Everything shown is on the
deployment of record on GenLayer Studio Next. All evidence is synthetic and labelled `SYNTHETIC DEMO DATA`.

## Before you start

- A browser with one wallet extension, switched to GenLayer Studio Next. The app offers to add the network.
- Two wallet accounts if you want to show a case being opened and accepted live (a claimant and a respondent). One
  is enough for everything else. The app's wallet menu gives test GEN from the network's faucet.
- Open these tabs: the landing page, `/sample`, and `/verify`.
- Window about 1280 pixels wide. Close the browser console.

The live sample case is already complete on chain: opened, accepted, funded, assessed, challenged with new evidence,
readjudicated and final. The demo reads it; nothing has to wait for validators unless you choose the live part at
the end.

## The script

### 1. What it is (0:00 to 0:30)

**Show:** the landing page.

**Say:** "KeyWitness is for property disputes that turn on evidence: was the repair done, was the damage there at
move-in. Two parties agree what would establish the claim, file their evidence, and GenLayer validators assess it
against those criteria. It gives five findings, and three of them are ways of saying we do not know. It never decides
who is liable, and it never gives a confidence percentage."

**Point at:** the five findings on the right, then the four limits near the foot of the page.

### 2. The sample case and its terms (0:30 to 1:10)

**Show:** `/sample`, then the button at the foot of the page that opens the live case on Studio Next.

**Say:** "This is a synthetic case. A roofing contractor claims the repairs in a work order were completed before
the deadline, and the property manager disputes it. Here is the claim, in one sentence, and five criteria that keep
apart things that are easy to blur: that the contractor attended, that each task was done, that nothing was left
unfinished, that the leak stopped, and that it was done in time. The property manager accepted this exact version by
its digest, so the terms cannot move once evidence is in. A sum is held by the contract, and both sides agreed in
advance which finding moves it where."

**Point at:** the claim, the criteria list, the held sum and where it goes, the terms version.

### 3. The evidence (1:10 to 1:45)

**Show:** the evidence page of the case.

**Say:** "Each side filed photographs and documents. The contract stored the bytes and computed each digest itself.
Images are redrawn in the browser before filing, so camera data and location never leave the device, and the
contract refuses an image that still carries them. Everything here is public and permanent, and the app says so
before every filing."

**Point at:** one exhibit from each side; the role that filed it; the digest in its verification view.

### 4. The decision (1:45 to 2:45)

**Show:** the decision page.

**Say:** "Validators examined each photograph before reading anyone's description of it, then judged each criterion.
For every criterion you see the finding, the exhibits it rests on, the exhibits against it, and what was missing.
The overall finding is computed by code from the criterion findings. A majority of validators, each running the
assessment itself, had to reproduce which criteria are supported. The finer wording is the leading validator's, and
the page says that."

**Point at:** a criterion the evidence supports, with its cited exhibits; a criterion it does not, with the exhibits
on each side; the scope statement; the note on which images the validators saw.

**Then:** "The side this went against challenged it once, with a bond and new evidence. The other side had time to
answer. A second panel judged the whole file again, and that decision replaced the first. Both are kept."

**Point at:** the superseded decision and the standing one.

### 5. The protocol record (2:45 to 3:10)

**Show:** the decision page, "Protocol record" section. Open one assessment transaction on the explorer.

**Say:** "Every step is a transaction on Studio Next. This list is found on the explorer, and each row says what the
transaction did: recorded, refused, or undecided. This is separate from GenLayer's own appeal, which rechecks a
single transaction during its finality window. KeyWitness shows the two as different things, because they are."

### 6. The receipt (3:10 to 3:40)

**Show:** the receipt page. Press "Public receipt (JSON)". Go to `/verify` and load the file.

**Say:** "The receipt is a file built from the contract's record. The public version leaves out the parties and the
prose. Verification recomputes the digest, reads the contract's own record and compares. If someone edits the file,
it fails. If the case has moved on since the receipt was made, it says that instead."

**Point at:** the matching digests; the line that says what a receipt does and does not prove.

### 7. Close (3:40 to 4:00)

**Show:** `/status`.

**Say:** "There is no server and no database. The contract address, the source it runs and its hash are here, and
the repository has the live record of every check. It runs on a test network with synthetic data, and it says what
it cannot do."

## Optional live part (adds about three minutes)

Use two wallet accounts.

1. **Claimant:** "Create a case". Pick the kind of case (its suggested criteria are filled in), set the respondent to the second account, a short evidence period,
   no held sum. Review, then sign. Show the write flow: the price, the signature, the validators, the finality
   window.
2. **Respondent:** switch accounts, open the case from "Cases", read the terms, "Accept terms version 1".
3. **Either side:** "File evidence", add a short text document, tick the acknowledgement, sign.
4. **Both:** "Mark my evidence complete".
5. **Either side:** request the assessment. The contract decides in code when evidence the terms require is missing or
   nothing was filed, and asks the validators otherwise. An assessment by validators takes a minute or more; narrate the rounds
   as they appear.

Show one refusal on purpose: with the wrong account connected, the act is not a button. The page gives the
contract's reason in words.

## If something goes wrong

| What you see | What to say and do |
|---|---|
| A read fails with a retry | "The network limits reads. The app retries by itself." Wait a few seconds |
| A write sits at "validators are executing it" | "Consensus rounds can take a while on a test network." Carry on with the recorded sample |
| The validators reach no majority | "Nothing was recorded. That is the honest outcome when they do not agree, and the party can ask again." |
| The wallet is on another network | The app shows a switch button and offers nothing to sign until it is pressed |
