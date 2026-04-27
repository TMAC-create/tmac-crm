import fetch from 'node-fetch';

function formatUKMobile(number: string): string {
  if (!number) return number;

  let n = number.replace(/\s+/g, '');

  if (n.startsWith('+44')) return n;
  if (n.startsWith('44')) return `+${n}`;
  if (n.startsWith('0')) return `+44${n.slice(1)}`;

  return n;
}

export async function sendSMS({
  to,
  body,
}: {
  to: string;
  body: string;
}) {
  const apiKey = process.env.ESENDEX_API_KEY;
  const accountRef = process.env.ESENDEX_ACCOUNT_REFERENCE;
  const sender = process.env.ESENDEX_SENDER_NAME;

  const formattedNumber = formatUKMobile(to);

  const payload = {
    accountReference: accountRef,
    messages: [
      {
        to: formattedNumber,
        body: body,
        from: sender,
      },
    ],
  };

  console.log('📤 Sending Esendex SMS:', payload);

  const res = await fetch('https://api.esendex.co.uk/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey || '',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('❌ Esendex ERROR:', {
      status: res.status,
      response: text,
    });

    throw new Error(`Esendex failed: ${res.status} - ${text}`);
  }

  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    console.warn('⚠️ Non-JSON response:', text);
  }

  return json;
}
