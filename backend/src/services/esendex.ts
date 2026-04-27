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
  if (!input) return input;

  const cleaned = input.replace(/[\s().-]/g, '');

  // Already in international format, e.g. +447813784494
  if (cleaned.startsWith('+')) return cleaned;

  // International prefix format, e.g. 00447813784494
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;

  // UK mobile format stored in CRM, e.g. 07813784494
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`;

  // UK international without plus, e.g. 447813784494
  if (cleaned.startsWith('44')) return `+${cleaned}`;

  return cleaned;
}

function parseMaybeJson(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function getReadableEsendexError(status: number, parsedBody: unknown) {
  if (parsedBody && typeof parsedBody === 'object') {
    const body = parsedBody as any;

    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.title === 'string') return body.title;
    if (typeof body.detail === 'string') return body.detail;

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors
        .map((item: any) => item?.message || item?.detail || JSON.stringify(item))
        .join('; ');
    }

    if (body.rawText) return String(body.rawText);
  }

  if (status === 400) return 'Esendex rejected the SMS request. Check recipient number, sender name, account reference and payload format.';
  if (status === 401) return 'Esendex rejected the API key.';
  if (status === 403) return 'Esendex rejected access for this account/API key.';

  return 'Esendex SMS send failed.';
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

  console.log('Sending Esendex SMS', {
    endpoint,
    accountReference,
    to,
    senderName,
    bodyLength: input.body.length,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [apiKeyHeader]: apiKey,
      AccountReference: accountReference,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => '');
  const parsedBody = parseMaybeJson(responseText);

  if (!response.ok) {
    const message = getReadableEsendexError(response.status, parsedBody);

    console.error('Esendex SMS send failed', {
      status: response.status,
      statusText: response.statusText,
      endpoint,
      accountReference,
      to,
      senderName,
      requestPayload: payload,
      responseBody: parsedBody,
      responseText,
    });

    const error = new Error(message) as Error & {
      status?: number;
      details?: unknown;
      responseText?: string;
    };

    error.status = response.status;
    error.details = {
      status: response.status,
      statusText: response.statusText,
      responseBody: parsedBody,
      responseText,
      requestPayload: payload,
    };
    error.responseText = responseText;

    throw error;
  }

  const data = parsedBody as any;

  console.log('Esendex SMS accepted', {
    status: response.status,
    to,
    gatewayId: data?.gatewayId || data?.id || data?.messageId,
    requestId: data?.requestId,
  });

  return {
    gatewayId: data?.gatewayId || data?.id || data?.messageId,
    requestId: data?.requestId,
    raw: parsedBody,
  };
}
