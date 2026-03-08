"use client";

import { ConnectButton } from "thirdweb/react";
import { createWallet } from "thirdweb/wallets";
import { defineChain } from "thirdweb";
import { thirdwebClient } from "@/lib/thirdweb";

const wallets = [
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
];

const supportedChains = [
  defineChain(84532), // Base Sepolia
  defineChain(31337), // Localhost
];

export function WalletPanel() {
  return (
    <div className="walletPanel">
      <div>
        <p className="label">Wallet</p>
        <h3 className="title">Connect Wallet</h3>
      </div>
      <ConnectButton
        client={thirdwebClient}
        chains={supportedChains}
        wallets={wallets}
      />
    </div>
  );
}
