# MoMoFi CRE Workflow

Event-driven Chainlink CRE workflow for `TransferRequested` events from `MoMoSettlement`.

## Trigger

- Chain: Base Sepolia (`ethereum-testnet-sepolia-base-1`)
- Event: `TransferRequested(uint256,address,uint256,bytes32)`

## Steps

1. Fetch USD/GHS rate from `fxApiUrl`.
2. Resolve recipient phone from `intentResolverUrl` using `transferId` + `phoneHash`.
3. Validate and disburse via MTN APIs (or `simulateMtn=true` for dry-runs).
4. On success: call `confirmSettlement(id, ghsAmount, fxRate)`.
5. On failure: call `refundTransfer(id, reason)`.

## Config

Set in `config.staging.json` / `config.production.json`:

- `evm.contractAddress`: deployed `MoMoSettlement` address.
- `fxApiUrl`: USD/GHS source (e.g. `https://open.er-api.com/v6/latest/USD`).
- `intentResolverUrl`: backend endpoint that returns phone by `transferId`.
- `mtn.*`: sandbox endpoint URLs + secret IDs.
- `simulateMtn`: `true` for simulation-only workflow, `false` for live MTN sandbox.

## Secrets

`secrets.yaml` maps:

- `MTN_API_USER`
- `MTN_API_KEY`
- `MTN_SUBSCRIPTION_KEY`

## Run

From project root:

Simulate

```bash
make cre-workflow
```

Deploy
> Coming soon 
