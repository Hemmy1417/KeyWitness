# Privacy and data retention

KeyWitness has no server, no database and no private storage. Everything a case holds is written to the KeyWitness
contract on GenLayer Studio Next, where it is public and permanent. This document says exactly what that means, what
the app does to limit it, and what nobody can do afterwards.

## What is stored, and where

| Data | Where | Who can read it | For how long |
|---|---|---|---|
| Terms: title, claim, criteria, property reference, time zone, dates, amounts | The contract | Anyone | Permanently |
| Wallet addresses of the claimant, respondent and inspector | The contract | Anyone | Permanently |
| Evidence images (the bytes) and documents (the text) | The contract | Anyone | Permanently |
| What a filer wrote about an item: file name, description, declared date, redaction note | The contract | Anyone | Permanently |
| Decisions: findings, cited items, the leading validator's reasoning, its notes on each image | The contract | Anyone | Permanently |
| Challenge reason, settlement, the case's event log | The contract | Anyone | Permanently |
| Every transaction, with its input, including refused ones | Studio Next and its explorer | Anyone | As long as the network keeps them |
| A draft of terms being written, before it is signed | This browser's local storage | Whoever uses this browser | Until the case is opened, the draft is cleared, or site data is cleared |
| Hashes of transactions this browser sent, per case | This browser's local storage | Whoever uses this browser | Until site data is cleared |
| A receipt file | Wherever the person who downloaded it puts it | Whoever they give it to | Their choice |

There is no "private evidence". The brief this build follows describes private evidence storage with access control;
KeyWitness deliberately has none, for one reason: the validators who judge a case must read the same bytes the record
holds, and a validator set nobody controls cannot be given a secret. A design that kept evidence off chain would have
to trust whoever served it. The cost is stated here rather than hidden: **do not file anything you are not willing to
publish.**

Studio Next is a test network. It can be reset by its operators, and nothing on it has monetary value. "Permanently"
above means "for the life of the network and of every copy anyone made".

## What the app does before anything is filed

- **It says so.** The network banner on every page, the create-case review step and every filing form state that the
  case and its evidence are public and permanent, and filing requires an acknowledgement.
- **Property references are nicknames.** The contract refuses a property reference that contains an at sign, a link or
  "www"; the app asks for a nickname such as "Riverside flat" and never an address.
- **Wallets, not names.** Parties are wallet addresses. Pages call them the claimant, the respondent and the
  inspector; addresses appear only in views labelled for verification.
- **Images are redrawn.** Every image is decoded and redrawn on a canvas in the browser, then encoded as a JPEG. That
  removes everything that is not pixels: capture time, device, and GPS position never leave the device. KeyWitness
  does not read that metadata at all. The contract refuses an image that still carries one of the usual metadata
  blocks (camera data, an editor record, a comment, a PNG text or time chunk), which closes the ordinary carriers to
  a direct caller too. Its check is structural and does not decode pixels, so it is a guard and not a guarantee
  against a caller who goes around the app.
- **Redaction.** Before filing, a person can draw rectangles over parts of an image. They are painted into the pixels
  before encoding, so the covered area never reaches the chain. The item is marked as redacted, with the filer's note.
  A redaction is the filer's act; the validators are told an item was redacted and judge what is left.
- **Video is never stored.** A person picks one still from a video in the browser; only that still is filed, as "a
  still from a video" with its time in the clip.
- **Warnings.** Text being filed is scanned in the browser for what looks like an email address, a phone number or an
  access code, and a warning is shown. It is a prompt to look again, never a guarantee.
- **No analytics, no cookies, no accounts.** The app sets no cookie and loads no third-party script. Fonts are served
  from the app itself. The only requests a page makes are to Studio Next's RPC, to its explorer (to list a case's
  transactions), and to the app's own host.

## Receipts

A receipt is a JSON file built in the browser from the contract's record.

- **Private mode** carries the whole record: terms, both addresses, the property reference, the whole decision with
  the validators' reasoning and their notes on each image, the challenge reason and who was paid. It is for the
  parties.
- **Public mode** leaves out the parties' addresses, the property reference, the validators' prose and notes, the
  address that asked for the assessment, the challenge reason, the payee's address and declared capture times.
  Findings, floors, cited exhibit numbers and digests stay, so it still verifies against the chain.

Neither mode carries evidence descriptions, the text of filed documents or image bytes. The private mode does carry
the leading validator's notes on each image, and those include text it read off a photographed page. A public receipt
leaves the notes out. A public receipt still names a case id, and
anyone with a case id can read the whole case from the chain. A public receipt limits what a file reveals to someone
who is only shown the file; it does not make a case private.

## Access control

There is none to bypass, because nothing is private. The contract's rules decide who may *write* (only a party files
evidence, only the respondent accepts, and so on); reading is open to everyone. The app has no object references that
could be guessed to reach something hidden: a case id leads to a public case.

## Deletion and correction

- **Nothing can be deleted or edited**, by a party, by the deployer or by anyone else acting through this contract: it
  has no method that removes or rewrites a term, an exhibit or a decision, and no owner.
- A mistake is corrected by adding to the record: a new terms version before acceptance, more evidence, a challenge,
  or a follow-up case that cites the earlier one.
- Local data (a draft, the list of sent transactions) is removed by clearing the site's data in the browser. The
  wizard's "Start over" clears its draft.
- If personal data was filed by mistake, it cannot be recalled. This is the reason for every warning above.

## What a person filing evidence should check first

1. The photograph shows no face, name, number plate, document number, key code or address you would not publish.
2. A document contains no account number, signature, contact detail or identity number. Type the relevant lines into a
   text document instead of photographing the whole page, or redact the page.
3. The property reference is a nickname.
4. You have the right to publish it. Filing another person's personal data on a public chain may be unlawful where you
   live; KeyWitness cannot check that and does not try.

## Legal position

KeyWitness is an evidence assessment and recordkeeping tool running on a test network with synthetic sample data. It
is not legal advice and makes no claim of compliance with any data protection law. A chain that cannot delete is hard
to reconcile with a right to erasure; anyone considering real personal data on any public chain should take advice
first. The honest position of this build is: use synthetic or already-public material.
