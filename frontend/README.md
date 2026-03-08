# MoMoFi Frontend

Next.js app (App Router) with Thirdweb wallet connection and Ethers v6 contract interactions.

## Features

- Responsive UI with quote preview.
- Connect wallet (Thirdweb ConnectButton).
- Approve USDC then call `requestTransfer`.
- Store offchain transfer intent (`transferId -> phone`) for CRE resolver endpoint.
- Poll onchain transfer status (`pending`, `settled`, `refunded`).

## Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Required Env

- `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`
- `NEXT_PUBLIC_MOMO_SETTLEMENT_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS`
- `NEXT_PUBLIC_CHAIN_ID` (default `84532` for Base Sepolia)

## API Endpoints

- `POST /api/quote` -> returns live USD/GHS quote and estimated payout.
- `POST /api/intents` -> store `{ transferId, phone, phoneHash }`.
- `GET /api/intents/resolve` -> CRE resolver endpoint for payout phone lookup.

Note: `/api/intents*` storage is in-memory for demo use.
