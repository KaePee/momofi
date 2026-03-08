import { momoAbi } from "./abi";
import {
  ConfidentialHTTPClient,
  EVMClient,
  HTTPClient,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  handler,
  hexToBase64,
  ok,
  prepareReportRequest,
  text,
  json,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk";
import {
  decodeEventLog,
  encodeFunctionData,
  stringToHex,
  toEventSelector,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";

const configSchema = z.object({
  evm: z.object({
    chainSelectorName: z.string().min(1),
    logicContractAddress: z.string().min(1),
    proxyContractAddress: z.string().min(1),
  }),
  fxApiUrl: z.string().min(1),
  intentResolverUrl: z.string().min(1),
  mtn: z.object({
    validateUrl: z.string().min(1).optional(),
    payoutUrl: z.string().min(1).optional(),
    targetEnvironment: z.string().min(1),
    basicAuthSecretId: z.string().min(1),
    subscriptionKeySecretId: z.string().min(1),
    callbackHost: z.string().optional(),
    secretOwner: z.string().optional(),
  }),
  simulateMtn: z.boolean(),
});

type Config = z.infer<typeof configSchema>;

type TransferRequestedEvent = {
  id: bigint;
  sender: Address;
  usdcAmount: bigint;
  phoneHash: Hex;
};

type FxRateResponse = {
  rates?: Record<string, number>;
  result?: string;
  info?: { rate?: number };
};

type IntentResponse = {
  phone?: string;
  msisdn?: string;
  transferId?: string;
};

const transferRequestedTopic = toEventSelector(
  "TransferRequested(uint256,address,uint256,bytes32)",
);

function utf8ToBodyBase64(payload: string): string {
  return hexToBase64(stringToHex(payload));
}

function formatGhsAmount(ghsAmount8: bigint): string {
  const whole = ghsAmount8 / 100_000_000n;
  const decimals = (ghsAmount8 % 100_000_000n).toString().padStart(8, "0");
  return `${whole.toString()}.${decimals.slice(0, 2)}`;
}

function parseTransferEvent(log: EVMLog): TransferRequestedEvent {
  const topics = log.topics.map((topic) => bytesToHex(topic)) as Hex[];
  if (topics.length === 0) {
    throw new Error("No topics found in log");
  }

  const decoded = decodeEventLog({
    abi: momoAbi,
    eventName: "TransferRequested",
    topics: [topics[0], ...topics.slice(1)],
    data: bytesToHex(log.data),
  });

  return {
    id: decoded.args.id,
    sender: decoded.args.sender,
    usdcAmount: decoded.args.usdcAmount,
    phoneHash: decoded.args.phoneHash,
  };
}

function toFxRate8(rate: number): bigint {
  return BigInt(Math.round(rate * 100_000_000));
}

function computeGhsAmount8(usdcAmount: bigint, fxRate8: bigint): bigint {
  return (usdcAmount * fxRate8) / 1_000_000n;
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing required config value: ${fieldName}`);
  }
  return trimmed;
}

function requireSecret(runtime: Runtime<Config>, secretId: string): string {
  try {
    const value = runtime.getSecret({ id: secretId }).result().value.trim();
    if (!value) {
      throw new Error(`Secret '${secretId}' exists but is empty`);
    }
    return value;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Missing or unreadable secret '${secretId}': ${message}`);
  }
}

function validateRuntimeConfig(runtime: Runtime<Config>): void {
  requireNonEmpty(runtime.config.evm.chainSelectorName, "evm.chainSelectorName");
  requireNonEmpty(runtime.config.evm.logicContractAddress, "evm.logicContractAddress");
  requireNonEmpty(runtime.config.evm.proxyContractAddress, "evm.proxyContractAddress");
  requireNonEmpty(runtime.config.fxApiUrl, "fxApiUrl");
  requireNonEmpty(runtime.config.intentResolverUrl, "intentResolverUrl");

  if (!runtime.config.simulateMtn) {
    requireNonEmpty(runtime.config.mtn.validateUrl ?? "", "mtn.validateUrl");
    requireNonEmpty(runtime.config.mtn.payoutUrl ?? "", "mtn.payoutUrl");
    requireNonEmpty(runtime.config.mtn.targetEnvironment, "mtn.targetEnvironment");

    // The secrets will be fetched by the Vault DON enclave, so we just
    // ensure their configuration names are not empty.
    requireNonEmpty(runtime.config.mtn.basicAuthSecretId, "mtn.basicAuthSecretId");
    requireNonEmpty(runtime.config.mtn.subscriptionKeySecretId, "mtn.subscriptionKeySecretId");
  }
}


function fetchFxRate(runtime: Runtime<Config>, http: HTTPClient): number {
  const send = http.sendRequest(
    runtime,
    (requester, url: string) => {
      const response = requester
        .sendRequest({
          method: "GET",
          url,
          headers: { accept: "application/json" },
        })
        .result();

      if (!ok(response)) {
        throw new Error(`FX request failed (${response.statusCode})`);
      }

      const parsed = JSON.parse(text(response)) as FxRateResponse;

      // Supports open.er-api.com and exchangerate.host style payloads.
      const rate = parsed.rates?.GHS ?? parsed.info?.rate;
      if (!rate || rate <= 0) {
        throw new Error("USD/GHS rate missing in FX response");
      }

      return rate;
    },
    consensusMedianAggregation<number>(),
  );

  return Number(send(runtime.config.fxApiUrl).result());
}

function resolvePhone(
  runtime: Runtime<Config>,
  http: HTTPClient,
  transferId: bigint,
  phoneHash: Hex,
): string {
  const send = http.sendRequest(
    runtime,
    (requester, baseUrl: string, id: string, hash: string) => {
      const response = requester
        .sendRequest({
          method: "GET",
          url: `${baseUrl}?transferId=${id}&phoneHash=${hash}`,
          headers: { accept: "application/json" },
        })
        .result();

      if (!ok(response)) {
        throw new Error(`Intent resolver failed (${response.statusCode})`);
      }

      const parsed = JSON.parse(text(response)) as IntentResponse;
      const phone = parsed.phone ?? parsed.msisdn;
      if (!phone) {
        throw new Error("Phone not found in intent resolver response");
      }

      return phone;
    },
    consensusIdenticalAggregation<string>(),
  );

  return send(
    runtime.config.intentResolverUrl,
    transferId.toString(),
    phoneHash,
  ).result();
}

function validateAndPayout(
  runtime: Runtime<Config>,
  confHttp: ConfidentialHTTPClient,
  msisdn: string,
  amountGhs: string,
  externalId: string,
): { ok: boolean; reason?: string } {
  if (runtime.config.simulateMtn) {
    runtime.log("simulateMtn=true, skipping MTN network calls.");
    return { ok: true };
  }

  if (!runtime.config.mtn.validateUrl || !runtime.config.mtn.payoutUrl) {
    return { ok: false, reason: "MTN endpoints are not configured" };
  }

  const secretOwner = runtime.config.mtn.secretOwner ?? "";
  const vaultDonSecrets = [
    { key: runtime.config.mtn.basicAuthSecretId, owner: secretOwner },
    { key: runtime.config.mtn.subscriptionKeySecretId, owner: secretOwner },
  ].sort((a, b) => a.key.localeCompare(b.key)); // Alphabetize by key for Vault DON

  const validateResponse = confHttp.sendRequest(runtime, {
    request: {
      url: runtime.config.mtn.validateUrl!,
      method: "POST",
      multiHeaders: {
        "Authorization": { values: [`Basic {{.${runtime.config.mtn.basicAuthSecretId}}}`] as string[] },
        "Ocp-Apim-Subscription-Key": { values: [`{{.${runtime.config.mtn.subscriptionKeySecretId}}}`] as string[] },
        "X-Target-Environment": { values: [runtime.config.mtn.targetEnvironment] as string[] },
        "Content-Type": { values: ["application/json"] as string[] },
      } as any,
      body: { value: JSON.stringify({ msisdn }), case: "bodyString" },
    } as any,
    vaultDonSecrets,
  }).result();

  if (!ok(validateResponse) || validateResponse.statusCode < 200 || validateResponse.statusCode > 299) {
    return {
      ok: false,
      reason: `MTN validate failed (${validateResponse.statusCode})`,
    };
  }

  const payoutPayload = {
    amount: amountGhs,
    currency: "GHS",
    externalId,
    payee: { partyIdType: "MSISDN", partyId: msisdn },
    payerMessage: "MoMoFi settlement",
    payeeNote: "USDC cashout",
  };

  const payoutResponse = confHttp.sendRequest(runtime, {
    request: {
      url: runtime.config.mtn.payoutUrl!,
      method: "POST",
      multiHeaders: {
        "Authorization": { values: [`Basic {{.${runtime.config.mtn.basicAuthSecretId}}}`] as string[] },
        "Ocp-Apim-Subscription-Key": { values: [`{{.${runtime.config.mtn.subscriptionKeySecretId}}}`] as string[] },
        "X-Target-Environment": { values: [runtime.config.mtn.targetEnvironment] as string[] },
        "Content-Type": { values: ["application/json"] as string[] },
      } as any,
      body: { value: JSON.stringify(payoutPayload), case: "bodyString" },
    } as any,
    vaultDonSecrets,
  }).result();

  if (!ok(payoutResponse) || payoutResponse.statusCode < 200 || payoutResponse.statusCode > 299) {
    return {
      ok: false,
      reason: `MTN payout failed (${payoutResponse.statusCode})`,
    };
  }

  return { ok: true };
}

function writeConfirm(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  transferId: bigint,
  ghsAmount: bigint,
  fxRate8: bigint,
): void {
  const callData = encodeFunctionData({
    abi: momoAbi,
    functionName: "confirmSettlement",
    args: [transferId, ghsAmount, fxRate8],
  });

  const report = runtime.report(prepareReportRequest(callData)).result();
  
  const proxyHex = ensureHexPrefix(runtime.config.evm.proxyContractAddress);

  evmClient
    .writeReport(runtime, {
      receiver: proxyHex,
      report,
    })
    .result();
}

function writeRefund(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  transferId: bigint,
  reason: string,
): void {
  const callData = encodeFunctionData({
    abi: momoAbi,
    functionName: "refundTransfer",
    args: [transferId, reason],
  });

  const report = runtime.report(prepareReportRequest(callData)).result();

  const proxyHex = ensureHexPrefix(runtime.config.evm.proxyContractAddress);

  evmClient
    .writeReport(runtime, {
      receiver: proxyHex,
      report,
    })
    .result();
}

const onTransferRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  validateRuntimeConfig(runtime);

  const transfer = parseTransferEvent(log);
  runtime.log(
    `Processing transfer id=${transfer.id.toString()} sender=${transfer.sender}`,
  );

  const selectors = EVMClient.SUPPORTED_CHAIN_SELECTORS as Record<
    string,
    bigint
  >;
  const chainSelector = selectors[runtime.config.evm.chainSelectorName];
  if (!chainSelector) {
    throw new Error(
      `Unsupported chain selector name: ${runtime.config.evm.chainSelectorName}`,
    );
  }

  const evmClient = new EVMClient(chainSelector);
  const httpClient = new HTTPClient();
  const confHttpClient = new ConfidentialHTTPClient();

  const fxRate = fetchFxRate(runtime, httpClient);
  const fxRate8 = toFxRate8(fxRate);
  const ghsAmount = computeGhsAmount8(transfer.usdcAmount, fxRate8);
  const msisdn = resolvePhone(
    runtime,
    httpClient,
    transfer.id,
    transfer.phoneHash,
  );

  const payout = validateAndPayout(
    runtime,
    confHttpClient,
    msisdn,
    formatGhsAmount(ghsAmount),
    transfer.id.toString(),
  );

  if (!payout.ok) {
    const reason = payout.reason ?? "MTN payout failed";
    runtime.log(
      `Payout failed for transfer ${transfer.id.toString()}: ${reason}`,
    );
    writeRefund(runtime, evmClient, transfer.id, reason);
    return `Refunded transfer ${transfer.id.toString()}`;
  }

  writeConfirm(runtime, evmClient, transfer.id, ghsAmount, fxRate8);
  return `Settled transfer ${transfer.id.toString()} @ ${fxRate.toFixed(4)} GHS/USD`;
};

function ensureHexPrefix(val: string): Hex {
  return (val.startsWith("0x") ? val : `0x${val}`) as Hex;
}

const initWorkflow = (config: Config) => {
  const selectors = EVMClient.SUPPORTED_CHAIN_SELECTORS as Record<
    string,
    bigint
  >;
  const chainSelector = selectors[config.evm.chainSelectorName];
  if (!chainSelector) {
    throw new Error(
      `Unsupported chain selector name: ${config.evm.chainSelectorName}`,
    );
  }

  const logicAddressHex = ensureHexPrefix(config.evm.logicContractAddress);
  const topicHex = transferRequestedTopic;

  const evmClient = new EVMClient(chainSelector);
  const trigger = evmClient.logTrigger({
    addresses: [logicAddressHex],
    topics: [
      { values: [topicHex] },
      { values: [] },
      { values: [] },
      { values: [] },
    ],
  });

  return [handler(trigger, onTransferRequested)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
