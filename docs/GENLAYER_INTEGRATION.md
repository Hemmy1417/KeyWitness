# GenLayer integration

What KeyWitness asks of GenLayer, exactly which protocol features it uses, and what was observed when it did. Every
statement about the network here was checked against GenLayer's documentation or measured on Studio Next; the sources
and dates are at the end.

## Status

| | |
|---|---|
| Network | GenLayer Studio Next, chain 61997 (the "Studio development preview" in GenLayer's documentation, `studioDevnet` in its SDK) |
| RPC | `https://studio-dev.genlayer.com/api`. `studio-next.genlayer.com` is an alias of the same environment; the documentation asks integrations to use the canonical host |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| Contract | `0xB903Dcfd1730818260CFFa05d12497E73CB124Ff` |
| Contract runtime | GenVM, runner `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`, pinned in the first line of the source |
| SDK | `genlayer-js` 2.0.0-rc.1 |
| Wallet writes | `@genlayer/transaction-kit` and `@genlayer/transaction-kit-react` 0.1.0-rc.2 |
| Live record | `docs/proofs/live.md`: every transaction, every consensus round, every node's model and vote |

Nothing in KeyWitness is simulated. There is no mock mode: when the contract or the network cannot be reached, the
pages say so and offer nothing to sign.

## Why a GenLayer contract and not an oracle or plain code

A dispute about a repair turns on questions no feed publishes and no deterministic code can answer: what a
photograph shows, whether a contractor's note and an inspector's report describe the same work, whether an invoice
line names the job a criterion asks about. Somebody has to read the evidence. If one party's server runs the model,
the other party has no reason to accept the answer.

GenLayer supplies the three things that are missing: a panel of validators neither side chose, each running its own
model; a rule for what those validators must agree on, written in the contract where both sides can read it; and a
record neither side can edit. Everything that can be counted is decided by ordinary code in the same contract.

| Decided by code | Decided by validators |
|---|---|
| Who may act and when; every window and deadline | What each image shows |
| Whether required evidence is present | Whether the evidence for a criterion is adequate |
| File type, size and structure; duplicate bytes; digests | Whether two items contradict each other |
| The floors that can only weaken a finding | Whether a document tries to instruct the assessor |
| The overall finding from the criterion findings | |
| Every movement of GEN | |

## The contract's use of the equivalence principle

One method pair reaches consensus on a model's judgment: `request_assessment` and `readjudicate`, both through
`_panel`, which calls `gl.vm.run_nondet(leader_fn, validator_fn)`.

```
leader_fn                               validator_fn(leader_result)
---------                               ---------------------------
read the calibration image              leader failed?  -> disagree
  cannot read it -> fail the round      run the whole assessment itself
examine every image, two per prompt       (a node whose model receives no image
judge every criterion                      reads the leader's notes instead)
  no usable answer twice -> fail        apply the same floors in code
return the shaped answer and notes      compare what the record binds
                                        any difference -> disagree, with the reason
```

**What validators must agree on.** For every criterion, whether it is `SUPPORTED` or not; and whether anything could
be examined at all. That is what a consequence depends on: the held sum goes to the claimant only when the overall
finding is `SUPPORTED`. A validator also refuses a leader's result that does not judge every criterion or that counted
fewer images than the validator itself saw.

**What they need not agree on.** The finer label below `SUPPORTED` (`NOT_ESTABLISHED`, `CONFLICTING`,
`INSUFFICIENT`), the cited items and the prose. Honest models split on these, which the live runs showed, and the
record says plainly that they are the leading validator's. The floors still apply to them in code.

**Independent verification.** A validator never accepts the leader's answer because it is well formed. It derives its
own findings from the same stored bytes and compares. This is the pattern GenLayer's documentation asks for: rerun the
task and compare the decision fields.

**Errors.** The validator function handles every failure itself and returns a boolean, so consensus never rests on
comparing error messages. A leader that fails raises a `UserError` whose text starts `[LLM_ERROR]`; validators
disagree with a failed leader, and the network rotates to another leader. A write the contract refuses raises a
`UserError` whose text starts `[EXPECTED]` and gives the reason.

**Prompts.** Party-written text reaches a model only inside fences whose tag is a hash of what they enclose, so no
text can contain the line that closes its own fence; invisible and look-alike characters are removed as a second layer. The examiner that looks at images is given no party text at all. Images
go to `gl.nondet.exec_prompt(..., response_format="json", images=[...])`, two at most per prompt, because the network
accepts no more.

## Other GenVM features in use

| Feature | Where |
|---|---|
| `gl.contract.Contract`, `@gl.public.view`, `@gl.public.write`, `@gl.public.write.payable` | Every method |
| `gl.storage.TreeMap` | Cases, terms versions, evidence metadata, evidence bytes and text, decisions, events, credits |
| `gl.message.sender_address`, `gl.message.value` | Roles and deposits |
| `datetime.now(timezone.utc)` | Every window and deadline. GenVM fixes it to the transaction's own time, the same on every node, set when the transaction was created |
| `@gl.evm.contract_interface` with `emit_transfer` | `withdraw`, the one method that sends value out |
| `gl.vm.UserError` | Refusals with a reason |

## Transaction lifecycle in the app

The app shows a write the way the protocol reports it, and infers nothing from its own state.

1. **Pricing.** The Transaction Kit prices the write against the network's live fee policy and shows what leaves the
   wallet. The transaction is frozen when its review opens.
2. **Signing.** The wallet the person chose (EIP-6963 discovery) signs. A wallet on another chain is asked to switch
   first.
3. **Consensus.** The kit tracks the transaction until the validators decide.
4. **After the decision.** `ProtocolTracker` reads the stored status (one of the 14 the consensus contracts define)
   and the lifecycle projection from `gen_getTransactionLifecycle`. "Finalize" is shown as the protocol's next action
   and never as a status. The appeal window is counted from the network's own timestamps.
5. **The outcome.** A write is called recorded only when the transaction is `FINALIZED`, the leader's execution
   succeeded and the validators agreed. An accepted transaction whose receipt carries a refusal is shown as refused,
   with the contract's reason. A transaction with no majority is shown as undecided: nothing was written, and the
   person may send it again.

`Accepted` is not treated as success and not treated as final: GenLayer's documentation says both, and the app
follows it.

### Payouts

`withdraw` sends value out of the contract. On Studio Next such a write must carry the message allocations the fee
simulation measured; without them the transaction finalizes but pays nothing. The kit at this version prices from
defaults and submits without allocations, so `web/lib/kit.ts` wraps it for this one method: the payout is priced by
`estimateTransactionFeesForWrite`, refused before signing if the simulation finds no transfer to fund, and submitted
with the simulated allocations. `scripts/proofs.mjs` checks, with real withdrawals, that the wallet's balance rises
by exactly the credit.

### Payable writes that must refuse

On this network a payable write that raises still keeps the value sent with it. `fund_case` and `challenge` therefore
never raise once value is attached: they return `{"refused": true, "reason": ...}` and credit the sender, who
withdraws it. The app reads the returned JSON and shows the refusal; it never shows such a transaction as a success.

## Appeals: two mechanisms, kept apart

| | Protocol appeal (GenLayer) | Case challenge (KeyWitness) |
|---|---|---|
| What it questions | Whether the validators' decision on one transaction was right | Whether the decision still holds once new evidence is in |
| Who | Anyone | Only the side the decision went against |
| Window | The network's finality window (30 seconds on Studio Next when measured) | The challenge window the parties agreed in the terms (one hour at least) |
| Cost | The charge `getAppealCharge` quotes: a bond plus the cost of the extra round | The bond the terms fixed |
| What happens | A fresh, larger committee rechecks the same proposal | The challenger files new evidence, the other side answers, and a new panel judges the whole file |
| New evidence | None | Required |
| Where in the app | Under the transaction, while its window is open | On the decision page |

The app sends a protocol appeal with the SDK's `getAppealCharge` and `appealTransaction`, and only when the lifecycle
read reports an active decision to appeal. The live proofs send one against a correct assessment: the appeal
committee agreed with the original result, the appeal failed as it should, and the contract's state was unchanged.

## Reads

Every page reads the contract directly from the browser with `genlayer-js` (`readContract`, which is `gen_call`).
Studio Next allows about 30 such calls a minute per IP address, and a wallet's fee estimates spend from the same
budget. `web/lib/read.ts` runs reads against a rolling budget with headroom for the wallet, retries transient
failures on a growing delay, and caches only what can never change (terms versions, evidence, image bytes). When a
read fails for good, the page says what could not be read and offers a retry; it never shows a stale state as
current.

## The explorer

The contract cannot know its own transaction hashes, so the app finds a case's transactions on the Studio Next
explorer and links each one. The explorer is a helper and is never trusted for an outcome: what each transaction did
is worked out from its own consensus rounds and leader receipt, and when the search did not cover the whole life of a
case the page says so.

## What was observed on Studio Next

Measured on 2 to 4 October 2026 with the probes in `probes/` and the live proofs. The network is a preview: any of
this can change.

| Observation | Consequence in KeyWitness |
|---|---|
| Several validator model routes receive no image at all, and at least one describes an image it was never given | The calibration image: six digits the contract draws from the case and the request. A node that cannot read them does not look at evidence images, cannot lead, and as a validator reads the leader's notes. The record marks which nodes saw |
| A prompt accepts two images at most | Images are examined two at a time |
| A JPEG with a sound structure and a destroyed scan reaches a model that receives images as a grey or noisy picture, which it reports as corrupted | Such a file is seen and supports nothing. The contract does not decode pixels and does not claim to |
| Models sometimes return no usable JSON | A node asks once more, then fails. A non-answer is never read as a finding |
| The same evidence can draw `CONFLICTING` from one model and `INSUFFICIENT` from another | Consensus binds supported or not; the finer label is the leader's, under the floors |
| A consensus round can stall, or end with no majority | Nothing is recorded; a party asks again. The app keeps the hash and reconciles |
| A transaction with no majority is later stored as `FINALIZED` with a leader result that reads like success | Outcomes are read from the consensus rounds, never from the stored status alone |
| A payable write that raises keeps the value | Payable methods refuse by returning and crediting |
| A write that sends value needs simulated message allocations | `withdraw` is priced by simulation |
| A protocol appeal on an accepted write leaves the contract intact here | The app offers protocol appeals on assessments |

## What is not claimed

- **Not a production network.** Studio Next can be reset, and its validator set and models are chosen by its
  operators.
- **Not every validator looks at every image.** A validator whose model receives no image trusts the leader's notes
  on what the images show, and judges the criteria itself from those notes. This is the main trust assumption and is
  stated in `docs/THREAT_MODEL.md`.
- **No successful protocol appeal was observed**, because the appealed result was correct. The mechanism for a
  successful one (recomputation) is GenLayer's and was not exercised.
- **No fee profile is shipped.** Fees come from the network's live policy at signing time.

## Sources

Checked on 4 October 2026.

| Topic | Source |
|---|---|
| Networks, chain ids, the canonical Studio preview RPC | https://docs.genlayer.com/developers/networks |
| The equivalence principle, leader and validator functions, independent verification | https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle |
| Images in prompts | https://docs.genlayer.com/developers/intelligent-contracts/features/image-processing |
| Errors | https://docs.genlayer.com/developers/intelligent-contracts/features/error-handling |
| Prompt injection | https://docs.genlayer.com/developers/intelligent-contracts/security-and-best-practices/prompt-injection |
| Transaction statuses | https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/transactions/transaction-statuses |
| The lifecycle read | https://docs.genlayer.com/api-references/genlayer-node/gen/gen_getTransactionLifecycle |
| Finality | https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality |
| Appeals, the appeal charge and bonds | https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/appeal-process |
| The Transaction Kit | https://docs.genlayer.com/developers/decentralized-applications/transaction-kit-integration |
| Fees | https://docs.genlayer.com/developers/decentralized-applications/fees-and-transaction-kit |
| The SDK | https://docs.genlayer.com/developers/decentralized-applications/genlayer-js |
| The linter | https://docs.genlayer.com/api-references/genlayer-linter |

One name differs from the current documentation. The documentation recommends `gl.vm.run_nondet_unsafe` for a custom
validator. The runner this contract pins has no function of that name: its `gl.vm.run_nondet(leader_fn,
validator_fn)` is the generic call with the same meaning (no sandbox around the validator; a validator that fails
counts as a disagreement). The validator function here catches its own failures and returns a boolean either way.
