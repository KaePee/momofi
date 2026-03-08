import { TransferWidget } from "@/components/TransferWidget";
import { WalletPanel } from "@/components/WalletPanel";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="heroBackdrop" />
      <section className="hero">
        <p className="kicker">CHAINLINK CONVERGENCE 2026</p>
        <h1>Settle USDC into MTN Mobile Money in one workflow.</h1>
        <p>
          MoMoFi combines Base Sepolia, Chainlink CRE, and MTN APIs for verifiable payout settlement with refund safety.
        </p>
      </section>

      <section className="grid">
        <WalletPanel />
        <TransferWidget />
      </section>
    </main>
  );
}
