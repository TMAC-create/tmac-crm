type EsendexSendSmsInput = {
  to: string;
  body: string;
  clientId?: string;
  templateId?: string;
};

type EsendexSendSmsResult = {
  gatewayId?: string;
  requestId?: string;
  messageIds?: string[];
  raw: unknown;
};

type EsendexWebhookSubscriptionResult = {
  eventType: string;
  callbackUrl: string;
  raw: unknown;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function normaliseUkMobile(input: string | null | undefined): string {
  const raw = String(input || '').trim();
  const cleaned = raw.replace(/[\s().-]/g, '');

  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`;
  if (cleaned.startsWith('44')) return `+${cleaned}`;

  return cleaned;
}

export function mobileMatchKeys(input: string | null | undefined): string[] {
  const normalised = normaliseUkMobile(input);
  if (!normalised) return [];

  const digits = normalised.replace(/\D/g, '');
  const without44 = digits.startsWith('44') ? digits.slice(2) : digits;
  const local = without44.startsWith('0') ? without44 : `0${without44}`;

  return Array.from(new Set([normalised, digits, local, `+${digits}`].filter(Boolean)));
}

function buildErrorMessage(raw: unknown, fallback = 'Esendex request failed.'): string {
  if (typeof raw === 'string') return raw;

  if (raw && typeof raw === 'object') {
    const maybeErrors = (raw as any).errors;
    if (Array.isArray(maybeErrors) && maybeErrors.length > 0) {
      return maybeErrors
        .map((item) => item?.errorMessage || item?.message || JSON.stringify(item))
        .filter(Boolean)
        .join(' | ');
    }

    if ('message' in raw) return String((raw as any).message);
    if ('title' in raw) return String((raw as any).title);
  }

  return fallback;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const responseText = await response.text();

  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return responseText;
  }
}

function throwEsendexError(raw: unknown, response: Response, fallback: string): never {
  const error = new Error(buildErrorMessage(raw, fallback)) as Error & {
    status?: number;
    statusText?: string;
    details?: unknown;
  };

  error.status = response.status;
  error.statusText = response.statusText;
  error.details = raw;
  throw error;
}

export async function createEsendexWebhookSubscription(): Promise<EsendexWebhookSubscriptionResult> {
  const apiKey = requiredEnv('ESENDEX_API_KEY');
  const accountReference = requiredEnv('ESENDEX_ACCOUNT_REFERENCE');
  const endpoint = process.env.ESENDEX_WEBHOOK_SUBSCRIPTIONS_URL || 'https://api.esendex.co.uk/v2/webhooks/subscriptions';
  const eventType = process.env.ESENDEX_INBOUND_EVENT_TYPE || 'sms-message-received';
  const callbackUrl =
    process.env.ESENDEX_WEBHOOK_CALLBACK_URL ||
    `${(process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || 'https://tmac-crm-web.onrender.com').replace(/\/$/, '')}/api/messages/esendex/webhook`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Esendex docs/reference examples vary between X-Api-Key and Api-Key.
      // Supplying both is harmless and avoids header-name mismatch.
      'X-Api-Key': apiKey,
      'Api-Key': apiKey,
      AccountReference: accountReference,
    },
    // Esendex v2 expects an array of CreateSubscriptionBody objects at the root.
    // Sending a single object causes:
    // "could not be converted to IEnumerable<CreateSubscriptionBody>"
    body: JSON.stringify([
      {
        eventType,
        callbacks: [
          {
            url: callbackUrl,
          },
        ],
      },
    ]),
  });

  const raw = await readJsonResponse(response);

  if (!response.ok) {
    throwEsendexError(raw, response, 'Could not create Esendex webhook subscription.');
  }

  return {
    eventType,
    callbackUrl,
    raw,
  };
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
    channel: 'SMS',
    from: senderName,
    characterSet: 'Auto',
    messageType: 'CustomerSupport',
    body: {
      text: input.body,
    },
    recipients: [
      {
        msisdn: to,
        variables: {},
        metaData: {
          crm: 'TMAC',
          clientId: input.clientId || '',
          templateId: input.templateId || '',
        },
      },
    ],
    metaData: {
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

  const raw = await readJsonResponse(response);

  if (!response.ok) {
    throwEsendexError(raw, response, 'Esendex SMS send failed.');
  }

  const data = raw as any;

  return {
    gatewayId: data?.gatewayId || data?.data?.gatewayId || data?.data?.requestId || data?.requestId,
    requestId: data?.requestId || data?.data?.requestId,
    messageIds: data?.data?.messageIds || data?.messageIds,
    raw,
  };
}
