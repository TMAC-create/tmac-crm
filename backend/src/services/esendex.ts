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

function buildErrorMessage(raw: unknown) {
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
  }

  return 'Esendex SMS send failed.';
}

export async function sendEsendexSms(input: EsendexSendSmsInput): Promise<EsendexSendSmsResult> {
  const apiKey = requiredEnv('ESENDEX_API_KEY');
  const accountReference = requiredEnv('ESENDEX_ACCOUNT_REFERENCE');
  const senderName = process.env.ESENDEX_SENDER_NAME || 'TMAC';
  const endpoint = process.env.ESENDEX_MESSAGES_URL || 'https://api.esendex.co.uk/v2/messages';
  const apiKeyHeader = process.env.ESENDEX_API_KEY_HEADER || 'X-Api-Key';
  const to = normaliseUkMobile(input.to);

  // Esendex v2 requires recipients as an array of objects with msisdn at the top level.
  // Do not use recipient.address.msisdn here; that is used in response/status payloads.
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

  const responseText = await response.text();
  let raw: unknown = responseText;

  try {
    raw = responseText ? JSON.parse(responseText) : {};
  } catch {
    raw = responseText;
  }

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
      responseText,
    });

    const error = new Error(buildErrorMessage(raw)) as Error & {
      status?: number;
      statusText?: string;
      details?: unknown;
      responseText?: string;
    };
    error.status = response.status;
    error.statusText = response.statusText;
    error.details = raw;
    error.responseText = responseText;
    throw error;
  }

  const data = raw as any;

  return {
    gatewayId: data?.gatewayId || data?.data?.gatewayId || data?.data?.requestId || data?.requestId,
    requestId: data?.requestId || data?.data?.requestId,
    messageIds: data?.data?.messageIds || data?.messageIds,
    raw,
  };
}
