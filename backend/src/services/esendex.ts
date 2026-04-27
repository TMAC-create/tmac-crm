type EsendexSmsArgs = {
  to: string;
  body: string;
  clientId?: string;
  templateId?: string;
};

type EsendexError = Error & {
  status?: number;
  details?: unknown;
};

export function normaliseUkMobile(number: string): string {
  if (!number) return number;

  let n = String(number).trim();
  n = n.replace(/[\s\-().]/g, '');

  if (n.startsWith('00')) return `+${n.slice(2)}`;
  if (n.startsWith('+44')) return n;
  if (n.startsWith('44')) return `+${n}`;
  if (n.startsWith('0')) return `+44${n.slice(1)}`;

  return n;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function parseJsonSafely(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function firstDefined(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

export async function sendEsendexSms({ to, body, clientId, templateId }: EsendexSmsArgs) {
  const apiKey = getRequiredEnv('ESENDEX_API_KEY');
  const accountReference = getRequiredEnv('ESENDEX_ACCOUNT_REFERENCE');
  const senderName = process.env.ESENDEX_SENDER_NAME || 'TMAC';
  const formattedNumber = normaliseUkMobile(to);

  if (!body || !body.trim()) {
    throw new Error('SMS body is empty.');
  }

  if (!formattedNumber || !formattedNumber.startsWith('+')) {
    throw new Error(`Invalid mobile number after formatting: ${formattedNumber || '(blank)'}`);
  }

  // Esendex v2 /messages expects:
  // - channel, not channels
  // - recipients, not recipient
  // - body or templateId at the top level, not content.text
  const requestPayload = {
    channel: 'SMS',
    recipients: [
      {
        address: {
          msisdn: formattedNumber,
        },
      },
    ],
    body,
    channelSettings: {
      sms: {
        originator: senderName,
        characterSet: 'GSM',
      },
    },
    metadata: {
      crm: 'TMAC',
      ...(clientId ? { clientId } : {}),
      ...(templateId ? { templateId } : {}),
    },
  };

  console.log('Sending Esendex SMS', {
    endpoint: 'https://api.esendex.co.uk/v2/messages',
    accountReference,
    to: formattedNumber,
    senderName,
    bodyLength: body.length,
    requestPayload,
  });

  const response = await fetch('https://api.esendex.co.uk/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      AccountReference: accountReference,
    },
    body: JSON.stringify(requestPayload),
  });

  const responseText = await response.text();
  const responseBody = parseJsonSafely(responseText);

  if (!response.ok) {
    const error = new Error(
      typeof responseBody === 'string'
        ? responseBody
        : JSON.stringify(responseBody)
    ) as EsendexError;

    error.status = response.status;
    error.details = {
      status: response.status,
      statusText: response.statusText,
      responseBody,
      responseText,
      requestPayload,
    };

    console.error('Esendex SMS send failed', error.details);
    throw error;
  }

  console.log('Esendex SMS send success', responseBody);

  return {
    raw: responseBody,
    requestId: firstDefined(
      response.headers.get('x-request-id'),
      response.headers.get('request-id'),
      responseBody?.requestId,
      responseBody?.id
    ),
    gatewayId: firstDefined(
      responseBody?.gatewayId,
      responseBody?.messageId,
      responseBody?.id,
      responseBody?.messages?.[0]?.id,
      responseBody?.messages?.[0]?.gatewayId
    ),
  };
}
