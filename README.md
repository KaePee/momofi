# MoMoFi

**Seamless Stablecoin to Mobile Money Settlement**

`USDC (Base Sepolia) -> MTN Mobile Money (GHS)`

## Our Vision: Onboarding the Next 1 Billion Users
MoMoFi is built with a singular mission: to bring over **1 billion users** into the Web3 ecosystem by enabling them to interact with stablecoins without ever needing to understand crypto. By bridging directly to MTN Mobile Money—a platform already trusted by hundreds of millions—users can appreciate the speed and efficiency of crypto using only the mobile money interfaces they are already comfortable with.

### Future Roadmap
Looking ahead, we are expanding MoMoFi to include a robust **PostgreSQL backend with full authentication**. This will allow users to securely log in, track their complete transaction history, view status updates, and manage their MoMoFi activity over time.

---

## Technical Stack & Key Integrations
[![MomoFi](https://github.com/KaePee/momofi/blob/bd60cab466474b284c5f3c98cc9a0575b9aa0c7c/frontend/momofi-screenshot.png)](https://youtu.be/eMK0f1i8Qk8)
MoMoFi leverages cutting-edge infrastructure to ensure secure, verifiable, and frictionless cross-border settlements:

### 1. Chainlink CRE & Confidential HTTP
MoMoFi deeply integrates Chainlink's Custom Runtime Environment (CRE) to securely connect on-chain events to off-chain banking APIs (MTN).
- **Event-Driven Workflow**: The workflow listens to the blockchain for a `TransferRequested` event using `evmClient.logTrigger` ([see `momofi-cre-workflow/main.ts`](momofi-cre-workflow/main.ts)).
- **Confidential HTTP**: We use Chainlink's `ConfidentialHTTPClient` combined with the DON's Secret Vaults to securely authenticate with the MTN Mobile Money API without exposing API Keys on-chain ([see `momofi-cre-workflow/main.ts`](momofi-cre-workflow/main.ts)).
- **Secure Proxy Pattern**: Writes back to the blockchain are routed through a verified `MoMoSettlementProxy`, validating cryptographically signed reports from the Chainlink Forwarder ([see `contracts/src/MoMoSettlementProxy.sol`](contracts/src/MoMoSettlementProxy.sol)).

### 2. Thirdweb for Seamless User Connectivity
The frontend utilizes [Thirdweb](https://thirdweb.com/) to provide a buttery smooth wallet connection experience. 
- **Wallet Connection**: Thirdweb's React SDK powers our native wallet adapter supporting MetaMask, Coinbase Wallet, and Rainbow on the Base Sepolia network ([see `frontend/components/WalletPanel.tsx`](frontend/components/WalletPanel.tsx) and [`frontend/lib/thirdweb.ts`](frontend/lib/thirdweb.ts)).

### 3. Smart Contracts (Solidity + Foundry)
Our core settlement engine (`MoMoSettlement.sol`) ensures safety with strict reentrancy guards, replay protection, and proxy-only access controls.

---

## Repository Layout

- [`contracts/`](contracts/): Foundry project housing the `MoMoSettlement` logic, CRE proxy, and deployment scripts.
- [`momofi-cre-workflow/`](momofi-cre-workflow/): The event-driven TypeScript workflow executed by the Chainlink DON.
- [`frontend/`](frontend/): The Next.js web application utilizing Thirdweb and Ethers v6.
- [`backend/`](backend/): Standalone MTN/FX utility clients.

## Smart Contract Setup & Commands
Ensure you set up env variables like etherscan api key and base sepolia wallet.

```bash
make contract-build
make contract-deploy
```

*Note: Smart contract deployment requires setting up your RPC URL and keystore.*
Private key is secure injected into the deployment pipeline using cast wallet with the deployer account.

## CRE Workflow Setup

1. Deploy the contracts and set the proxy/logic addresses in `momofi-cre-workflow/config.staging.json`.
2. Map your MTN secrets (`MTN_BASIC_AUTH`, `MTN_SUBSCRIPTION_KEY`) in the Chainlink Secret Vault (export via env if testing locally).
3. Simulate the workflow using the provided root Makefile target:

```bash
make cre-workflow
```

## Frontend Setup

The frontend connects natively to Base Sepolia via Thirdweb in `frontend/components/WalletPanel.tsx` and `frontend/lib/thirdweb.ts`, while querying EVM with standard Ethersv6 contracts.

```bash
cd frontend
cp .env.example .env
npm install
cd ..
make frontend
```

## Known Issues
- `FxRate` for USDC/GHS(Mainnet and Testnet) is optimally available on Celo so chainlink PriceFeeds would have been a better candidate to fetch FxRate for USDC/GHS, but our CRE setup focuses on Base Sepolia because workflow does not have forwarder and chain selector support for Celo network.
- We default to an external FX API to fetch the USDC/GHS exchange rate dynamically during the CRE workflow execution.
- Contract is not rigorously tested and therefore not suitable for production for now.