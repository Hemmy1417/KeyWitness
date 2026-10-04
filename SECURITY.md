# Security

## What this is

KeyWitness is a contract and a web app on **GenLayer Studio Next**, a test network. Every amount is test GEN with no
monetary value, the sample evidence is synthetic, and nothing here has been reviewed by an independent security firm.
It has been reviewed adversarially four times during development and each review found real defects; the last pass
and what remains open are in `docs/THREAT_MODEL.md` and `docs/TESTING.md`. Treat it as software that is honest about
its limits, not as software that is finished.

Do not use this deployment for a real dispute or for real personal data.

## Supported versions

| Version | Supported |
|---|---|
| The deployment named in `deployments/record.json`, and the `main` branch | Yes |
| Earlier disposable deployments | No. They are not kept current and are not referenced by the app |

The contract cannot be upgraded. It has no owner, no admin method and no pause. A fix is a new deployment, and the
record of the old one stays on chain.

## Reporting a vulnerability

Please report privately first:

1. Open a private security advisory on the repository (Security, then "Report a vulnerability").
2. If that is not available to you, open an issue that says only that you have a security report and how to reach
   you. Do not put the details in a public issue.

Include what you can of: the contract method or page involved, the exact steps or transaction hashes, what you
expected and what happened, and whether value or a recorded decision is affected. A failing test against
`tests/direct/` is the most useful report there is; `tests/direct/conftest.py` runs the contract without a network.

You can expect an acknowledgement within seven days. There is no bounty.

## In scope

- Anything that moves the held sum or a bond to the wrong party, or strands value in the contract.
- A decision recorded that a majority of honest validators would not reproduce.
- Party-written text escaping its fence in a validator's prompt.
- A way to change accepted terms, or to change a decision or an exhibit after it was recorded.
- A way for the app to show a state the chain does not hold, or to sign something other than what it showed.
- A receipt that verifies but does not match the contract's record.

## Out of scope

- Faults of GenLayer Studio Next itself (report those to GenLayer), of a wallet, or of a browser.
- That the chain is public. It is, by design, and the app says so before every filing.
- That a model can be wrong, or that a photograph can be staged. KeyWitness assesses filed evidence against agreed
  criteria; it does not authenticate files and says so on every receipt.
- The limits this repository already states in `docs/THREAT_MODEL.md` under "Residual risk".

## Keys and secrets

The app needs no secret: it has no server state, no database and no operator key, and every write is signed by the
visitor's own wallet. The scripts under `scripts/` generate test wallets into `.data/keys.json`, which is ignored by
git and never printed. If you fork this repository, keep it that way: nothing under `.data/` or any `.env` file other
than `.env.example` belongs in a commit.
