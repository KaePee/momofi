export type MtnValidationResult = {
  valid: boolean;
  reason?: string;
};

export type MtnPayoutResult = {
  status: "SUCCESS" | "FAILED" | "PENDING";
  transactionId: string;
  raw?: unknown;
};

export class MtnClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiUser: string,
    private readonly apiKey: string
  ) {}

  private get headers() {
    return {
      "Content-Type": "application/json",
      "X-Reference-Id": crypto.randomUUID(),
      "X-Target-Environment": "sandbox",
      Authorization: `Basic ${Buffer.from(`${this.apiUser}:${this.apiKey}`).toString("base64")}`,
    };
  }

  async validateMsisdn(msisdn: string): Promise<MtnValidationResult> {
    // Endpoint shape can vary by MTN market; map this to your sandbox product route.
    const res = await fetch(`${this.baseUrl}/v1/momo/validate`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ msisdn }),
    });

    if (!res.ok) {
      return { valid: false, reason: `Validation HTTP ${res.status}` };
    }

    const payload = (await res.json()) as { valid?: boolean; reason?: string };
    return { valid: payload.valid === true, reason: payload.reason };
  }

  async executePayout(msisdn: string, amountGhs: string, externalId: string): Promise<MtnPayoutResult> {
    const res = await fetch(`${this.baseUrl}/v1_0/disbursement`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        amount: amountGhs,
        currency: "GHS",
        externalId,
        payee: {
          partyIdType: "MSISDN",
          partyId: msisdn,
        },
        payerMessage: "MoMoFi settlement",
        payeeNote: "USDC to MoMo cashout",
      }),
    });

    if (!res.ok) {
      return {
        status: "FAILED",
        transactionId: externalId,
        raw: await safeJson(res),
      };
    }

    return {
      status: "PENDING",
      transactionId: externalId,
      raw: await safeJson(res),
    };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
