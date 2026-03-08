type IntentRecord = {
  transferId: string;
  phone: string;
  phoneHash: string;
  createdAt: string;
};

const globalForIntents = globalThis as unknown as { __momofiIntents?: Map<string, IntentRecord> };

const intentMap = globalForIntents.__momofiIntents ?? new Map<string, IntentRecord>();

if (!globalForIntents.__momofiIntents) {
  globalForIntents.__momofiIntents = intentMap;
}

export function saveIntent(record: IntentRecord) {
  intentMap.set(record.transferId, record);
}

export function getIntent(transferId: string) {
  return intentMap.get(transferId);
}
