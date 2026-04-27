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

async function readResponseBody(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) return { rawText: '' };

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

export async function sendEsendexSms(input: EsendexSendSmsInput): Promise<EsendexSendSmsResult> {
  const apiKey = requiredEnv('ESENDEX_API_KEY');
  const accountReference = requiredEnv('ESENDEX_ACCOUNT_REFERENCE');
  const senderName = process.env.ESENDEX_SENDER_NAME || 'TMAC';
  const endpoint = process.env.ESENDEX_MESSAGES_URL || 'https://api.esendex.co.uk/v2/messages';
  const apiKeyHeader = process.env.ESENDEX_API_KEY_HEADER || 'X-Api-Key';
  const to = normaliseUkMobile(input.to);

  // Esendex v2 /messages expects:
  // accountReference: string
  // channel: 'SMS'
  // recipients: array of recipient objects
  // body: object with text OR templateId
  const payload = {
    accountReference,
    channel: 'SMS',
    recipients: [
      {
        address: {
          msisdn: to,
        },
      },
    ],
    body: {
      text: input.body,
    },
    from: senderName,
    characterSet: 'Auto',
    name: `TMAC SMS ${input.clientId || ''}`.trim(),
  };

  console.log('Sending Esendex SMS', {
    endpoint,
    accountReference,
    to,
    senderName,
    bodyLength: input.body.length,
    requestPayload: payload,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [apiKeyHeader]: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await readResponseBody(response);

  if (!response.ok) {
    console.error('Esendex SMS send failed', {
      status: response.status,
      statusText: response.statusText,
      endpoint,
      accountReference,
      to,
      senderName,
      requestPayload: payload,
      responseBody: raw,
    });

    const responseText = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    const error = new Error(responseText || 'Esendex SMS send failed.') as Error & {
      status?: number;
      details?: unknown;
    };
    error.status = response.status;
    error.details = raw;
    throw error;
  }

  const data = raw as any;

  return {
    gatewayId:
      data.gatewayId ||
      data.id ||
      data.messageId ||
      data.messages?.[0]?.id ||
      data.messages?.[0]?.gatewayId,
    requestId: data.requestId || data.id,
    raw,
  };
}
