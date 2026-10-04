# Deployment

KeyWitness is one contract on GenLayer Studio Next and one static web app. There is no server to provision, no
database to migrate and no secret to set.

## The deployment of record

| | |
|---|---|
| Network | GenLayer Studio Next, chain 61997 |
| RPC | `https://studio-dev.genlayer.com/api` (canonical; `studio-next.genlayer.com` is an alias of the same environment) |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| Contract | `0xB903Dcfd1730818260CFFa05d12497E73CB124Ff` |
| Source | `contracts/keywitness.py`, one file, deployed as is |
| Record | `deployments/record.json` (address, deploy transaction, deployer, sha256 of the source and of the stored code) |
| Live proofs | `docs/proofs/live.md`, generated from `docs/proofs/live.json` |

Studio Next is a test network. Its operators can reset it, and a reset removes this deployment. The record of what
ran is in this repository; the steps below make a new one.

## What you need

| Tool | Version | Why |
|---|---|---|
| Node.js | 22.12 or newer (CI runs 24) | The test runner's native bundler refuses older releases |
| pnpm | 10.33 (pinned in `web/package.json`) | The web app's lockfile |
| Python | 3.12 | The contract's tests and linters |
| A browser wallet | Any EIP-6963 wallet | Signing in the app. The scripts use their own generated test wallets |

## Run the app against the deployment of record

```bash
cd web
pnpm install --frozen-lockfile
pnpm dev
```

The app opens on `http://localhost:3188`. It needs no environment file: the contract address is in
`web/lib/config.ts`, written there by the deployment script. `/status` shows which contract is in use, whether it is
the deployment of record, and what Studio Next answers.

## Check the contract

```bash
pip install -r requirements-dev.txt
ruff check contracts tests scripts
genvm-lint check contracts/keywitness.py --json
python -m pytest tests/direct -q
python tests/mutation/mutate.py
```

The direct suite needs no network: `tests/direct/conftest.py` runs the contract under a stub runtime. The mutation
sweep takes about ten minutes with its default three workers (about half an hour of machine time). `docs/TESTING.md` says what each layer covers.

## Deploy your own copy

1. **Make test wallets and fund them.** This writes `.data/keys.json` (ignored by git, never printed) and tops each
   wallet up from Studio Next's faucet. Only addresses are shown.

   ```bash
   cd scripts
   npm ci
   node keys.mjs
   ```

2. **Deploy.** The script sends the source, waits for the deployment to finalize, fetches the stored code back from
   the network with `gen_getContractCode`, and stops unless its sha256 equals the file's. Then it reads `get_config`
   and `get_stats` to confirm the contract answers.

   ```bash
   node deploy.mjs --label mine
   ```

   The result is written to `.data/deployments/mine.json`.

3. **Point the app at it.** Copy `.env.example` to `web/.env.local` and set:

   ```
   NEXT_PUBLIC_KEYWITNESS_CONTRACT=0x...
   ```

   `/status` will say the app is reading a deployment other than the one of record.

4. **Prove it, live.** About 75 to 90 minutes, most of it waiting out real evidence and challenge windows. The run is
   resumable: every finished step is kept in `.data/proofs-mine.json` and skipped on a rerun.

   ```bash
   node --experimental-strip-types --import ./ts-loader.mjs proofs.mjs --label mine
   node proofs-report.mjs --label mine
   ```

## Replace the deployment of record

Only when the contract source changes. A deployed contract is never upgraded; a fix is a new deployment.

```bash
cd scripts
node deploy.mjs --record
node --experimental-strip-types --import ./ts-loader.mjs proofs.mjs --record
node proofs-report.mjs
node check-address.mjs
```

- `deploy.mjs --record` writes `deployments/record.json` and the address and source sha256 in `web/lib/config.ts`.
- `proofs.mjs --record` writes `docs/proofs/live.json` and the sample case id in `web/lib/config.ts`.
- `proofs-report.mjs` writes `docs/proofs/live.md` from that record.
- `check-address.mjs` fails unless the record, the source in the checkout, the app's configuration, the live proofs
  and every document name the same deployment. CI runs it on every push.

The address also appears in `README.md`, this file and `docs/GENLAYER_INTEGRATION.md`; `check-address.mjs` names any
document that still carries an older one.

## Host the web app

Any host that runs Next.js works. On Vercel:

| Setting | Value |
|---|---|
| Root directory | `web` |
| Framework | Next.js |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Node.js version | 22.x or 24.x |
| Environment variables | None required |

The host serves pages and one route, `/api/health`, which reports whether a contract is configured and whether
Studio Next answers with chain 61997. It reads nothing from the contract and holds no secret. Responses carry
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy and a permissions policy that
turns off camera, microphone and geolocation.

Fonts are served from the app itself (`web/app/fonts`), so a build makes no request to a font service.

## Environment variables

All optional, all public. See `.env.example`.

| Variable | Effect |
|---|---|
| `NEXT_PUBLIC_KEYWITNESS_CONTRACT` | Read and write another KeyWitness deployment |
| `NEXT_PUBLIC_KEYWITNESS_SAMPLE_CASE` | The case id of the live sample on that deployment |
| `NEXT_PUBLIC_GENLAYER_RPC_URL`, `NEXT_PUBLIC_GENLAYER_CHAIN_ID`, `NEXT_PUBLIC_GENLAYER_EXPLORER_URL` | Another GenLayer Studio network. One definition feeds the wallet, the SDK and the kit, so a wallet on a different chain is asked to switch before it can sign |
| `GENLAYER_RPC_URL` | The RPC the scripts deploy to and prove against |

## Verify a deployment yourself

Without this repository's scripts:

```bash
curl -s https://studio-dev.genlayer.com/api -H "content-type: application/json" -H "user-agent: Mozilla/5.0" -d '{"jsonrpc":"2.0","id":1,"method":"gen_getContractCode","params":["0xB903Dcfd1730818260CFFa05d12497E73CB124Ff"]}'
```

The result is the stored source. Its sha256 must equal `source_sha256` in `deployments/record.json` and the sha256 of
`contracts/keywitness.py` at the commit you are reading. The file has LF line endings (`.gitattributes` enforces
them); a checkout that converts them changes the hash.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find native binding` when running the web tests | Node older than 22.12 | Use Node 22.12 or newer |
| Pages render without styles after an install | An install with `--force` fetched native packages for every platform and left the stylesheet compiler incomplete | Delete `web/node_modules` and `web/.next`, then `pnpm install --frozen-lockfile` |
| Pages return 404 in `pnpm dev` after a `pnpm build` | A build wrote into the folder the dev server was using | Stop the dev server, delete `web/.next`, start it again |
| Reads fail with a rate-limit message | Studio Next allows about 30 reads a minute per IP address | The app queues and retries on its own; wait a moment |
| A script stops with "the faucet refused" | The faucet is rate limited | Run `node keys.mjs` again later |
| A write stays pending for minutes | A consensus round on Studio Next can stall | The app keeps the transaction hash and reconciles when the network answers; the scripts resume from their record |
