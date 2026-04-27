type EsendexSendSmsInput = {
  to: string;
  body: string;
  clientId?: string;
  templateId?: string;
};

type EsendexSendSmsResult = {
  gatewayId?: string;
  requestId?: string;
  raw: unknown;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function normaliseUkMobile(input: string) {
  const cleaned = input.replace(/[\s().-]/g, '');

  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`;
  if (cleaned.startsWith('44')) return `+${cleaned}`;

  return cleaned;
}

export async function sendEsendexSms(input: EsendexSendSmsInput): Promise<EsendexSendSmsResult> {
  const apiKey = requiredEnv('ESENDEX_API_KEY');
  const accountReference = requiredEnv('ESENDEX_ACCOUNT_REFERENCE');
  const senderName = process.env.ESENDEX_SENDER_NAME || 'TMAC';
  const endpoint = process.env.ESENDEX_MESSAGES_URL || 'https://api.esendex.co.uk/v2/messages';
  const apiKeyHeader = process.env.ESENDEX_API_KEY_HEADER || 'X-Api-Key';
  const to = normaliseUkMobile(input.to);

  const payload = {
    accountReference,
    channels: ['SMS'],
    recipient: {
      address: {
        msisdn: to,
      },
    },
    content: {
      text: input.body,
    },
    channelSettings: {
      sms: {
        originator: senderName,
        characterSet: 'Auto',
      },
    },
    metadata: {
      crm: 'TMAC',
      clientId: input.clientId || '',
      templateId: input.templateId || '',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [apiKeyHeader]: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }));

  if (!response.ok) {
    const message = typeof raw === 'object' && raw && 'message' in raw ? String((raw as any).message) : 'Esendex SMS send failed.';
    const error = new Error(message) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = raw;
    throw error;
  }

  const data = raw as any;

  return {
    gatewayId: data.gatewayId || data.id || data.messageId,
    requestId: data.requestId,
    raw,
  };
}
