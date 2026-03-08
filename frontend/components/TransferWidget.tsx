"use client";

import { useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { MOMO_SETTLEMENT_ABI, ERC20_ABI } from "@/lib/abi";
import { appConfig, requiredAddress } from "@/lib/config";
import { formatGhs8, parseUsdcInput, shortHash } from "@/lib/format";

type QuoteResponse = {
  rate: number;
  fxRate8: string;
  ghsAmount8: string;
};

type ResolveStatus = {
  transferId: string;
  settled: boolean;
  refunded: boolean;
  usdcAmount: string;
  ghsAmount: string;
  fxRate: string;
};

function hashPhone(phone: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(phone.trim()));
}

export function TransferWidget() {
  const [phone, setPhone] = useState("");
  const [usdcInput, setUsdcInput] = useState("20");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [transferId, setTransferId] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [status, setStatus] = useState<ResolveStatus | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>("");

  const canSubmit = useMemo(
    () => phone.trim().length >= 10 && usdcInput.trim().length > 0,
    [phone, usdcInput],
  );

  async function fetchQuote() {
    try {
      setLoadingQuote(true);
      setMessage("");
      const usdcAmount = parseUsdcInput(usdcInput);
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdcAmount: usdcAmount.toString() }),
      });

      if (!res.ok) throw new Error(`Quote failed (${res.status})`);
      const data = (await res.json()) as QuoteResponse;
      setQuote(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to fetch quote");
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }

  async function submitTransfer() {
    if (!window.ethereum) {
      setMessage(
        "No injected wallet found. Please install MetaMask or Coinbase Wallet.",
      );
      return;
    }

    try {
      setPending(true);
      setMessage("");
      const usdcAmount = parseUsdcInput(usdcInput);
      const settlementAddress = requiredAddress(
        appConfig.settlementAddress,
        "NEXT_PUBLIC_MOMO_SETTLEMENT_ADDRESS",
      );
      const usdcAddress = requiredAddress(
        appConfig.usdcAddress,
        "NEXT_PUBLIC_USDC_ADDRESS",
      );
      const phoneHash = hashPhone(phone);

      const provider = new BrowserProvider(
        window.ethereum as ethers.Eip1193Provider,
      );
      const signer = await provider.getSigner();

      const usdc = new Contract(usdcAddress, ERC20_ABI, signer);
      const settlement = new Contract(
        settlementAddress,
        MOMO_SETTLEMENT_ABI,
        signer,
      );

      const owner = await signer.getAddress();
      const allowance = (await usdc.allowance(
        owner,
        settlementAddress,
      )) as bigint;
      if (allowance < usdcAmount) {
        setMessage("Approving USDC for MoMoFi...");
        const approveTx = await usdc.approve(settlementAddress, ethers.MaxUint256);
        await approveTx.wait();

        // Wait for RPC nodes to synchronize the allowance update
        let newAllowance = allowance;
        let retries = 0;
        while (newAllowance < usdcAmount && retries < 15) {
          setMessage(`Syncing allowance to RPC node... (${retries + 1}/15)`);
          await new Promise((r) => setTimeout(r, 2000));
          newAllowance = (await usdc.allowance(owner, settlementAddress)) as bigint;
          retries++;
        }
        if (newAllowance < usdcAmount) {
          throw new Error("RPC synchronization failed. Please try again.");
        }
        setMessage("Approval confirmed! Requesting transfer...");
      }

      const tx = await settlement.requestTransfer(phoneHash, usdcAmount);
      const receipt = await tx.wait();
      setTxHash(receipt.hash);

      const eventLog = receipt.logs
        .map(
          (log: { fragment?: { name?: string }; args?: { id?: bigint } }) =>
            log,
        )
        .find(
          (log: { fragment?: { name?: string } }) =>
            log.fragment?.name === "TransferRequested",
        );

      const id = eventLog?.args?.id;
      if (!id) {
        throw new Error("TransferRequested event not found in receipt");
      }

      const idString = id.toString();
      setTransferId(idString);

      await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId: idString, phone, phoneHash }),
      });

      await refreshStatus(idString);
      setMessage("Transfer requested. CRE workflow will process payout.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setPending(false);
    }
  }

  async function refreshStatus(idArg?: string) {
    const id = idArg ?? transferId;
    if (!id) return;

    const settlementAddress = requiredAddress(
      appConfig.settlementAddress,
      "NEXT_PUBLIC_MOMO_SETTLEMENT_ADDRESS",
    );
    if (!window.ethereum) return;

    const provider = new BrowserProvider(
      window.ethereum as ethers.Eip1193Provider,
    );
    const settlement = new Contract(
      settlementAddress,
      MOMO_SETTLEMENT_ABI,
      provider,
    );
    const transfer = (await settlement.transfers(id)) as [
      string,
      string,
      bigint,
      bigint,
      bigint,
      boolean,
      boolean,
    ];

    setStatus({
      transferId: id,
      settled: transfer[5],
      refunded: transfer[6],
      usdcAmount: transfer[2].toString(),
      ghsAmount: transfer[3].toString(),
      fxRate: transfer[4].toString(),
    });
  }

  return (
    <section className="panel panelPrimary">
      <header className="panelHeader">
        <p className="eyebrow">MoMoFi</p>
        <h2>USDC to Mobile Money</h2>
        <p className="muted">
          Enter recipient number and amount. The workflow validates, pays out,
          then settles onchain.
        </p>
      </header>

      <div className="fieldGroup">
        <label>Recipient MTN number</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+233XXXXXXXXX"
        />
      </div>

      <div className="fieldGroup">
        <label>USDC amount</label>
        <input
          value={usdcInput}
          onChange={(e) => setUsdcInput(e.target.value)}
          placeholder="20"
        />
      </div>

      <div className="actionRow">
        <button
          className="btn secondary"
          onClick={fetchQuote}
          disabled={loadingQuote || !canSubmit}
        >
          {loadingQuote ? "Fetching quote..." : "Get FX quote"}
        </button>
        <button
          className="btn"
          onClick={submitTransfer}
          disabled={pending || !canSubmit}
        >
          {pending ? "Submitting..." : "Approve + Send"}
        </button>
      </div>

      {quote ? (
        <div className="quoteBox">
          <p className="label">Estimated payout</p>
          <h3>{formatGhs8(BigInt(quote.ghsAmount8))} GHS</h3>
          <p className="muted">Rate: {quote.rate.toFixed(4)} GHS / USD</p>
        </div>
      ) : null}

      {transferId ? (
        <div className="statusBox">
          <div className="statusTop">
            <p className="label">Transfer #{transferId}</p>
            <button className="btn tertiary" onClick={() => refreshStatus()}>
              Refresh
            </button>
          </div>
          {status ? (
            <>
              <p>
                State:{" "}
                {status.settled
                  ? "Settled"
                  : status.refunded
                    ? "Refunded"
                    : "Pending"}
              </p>
              <p>GHS settled: {formatGhs8(BigInt(status.ghsAmount))}</p>
              <p>FX rate (8dp): {status.fxRate}</p>
            </>
          ) : (
            <p>Waiting for status...</p>
          )}
          {txHash ? <p className="muted">Tx: {txHash}</p> : null}
        </div>
      ) : null}

      {message ? <p className="feedback">{message}</p> : null}
    </section>
  );
}
