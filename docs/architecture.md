# MoMoFi Architecture

## Objective

Convert sender USDC to recipient MTN Mobile Money (GHS) with verifiable onchain finality.

## End-to-End Flow

1. Sender approves USDC and calls `requestTransfer(phoneHash, usdcAmount)`.
2. `MoMoSettlement` escrows USDC and emits `TransferRequested`.
3. Chainlink CRE listens for event and executes settlement workflow:
   - Fetch USD/GHS rate.
   - Validate MTN recipient.
   - Execute payout.
   - Confirm or refund onchain.
4. Contract stores final `ghsAmount` + `fxRate` and sets status (`settled` or `refunded`).

## Onchain Guarantees

- Replay protection: each transfer can be settled or refunded only once.
- Executor gating: only configured CRE executor can finalize/refund.
- Slippage guard: execution FX must remain within configurable tolerance of onchain feed (if configured).
- Reentrancy guard on state-changing functions.

## Data Handling

- Onchain: `bytes32 phoneHash` only.
- Offchain: raw MSISDN for MTN API operations obfuscated by Confidential HTTP.

## Rate Sources

- CRE HTTP request to FX API.
- Optional fallback: Chainlink Data Feed comparison for slippage checks. (Later improvements)
