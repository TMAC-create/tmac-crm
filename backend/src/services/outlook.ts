const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAILBOXES = {
  mike: 'mike@themoneyadvicecentre.com',
  steven: 'steven@themoneyadvicecentre.com',
} as const;

type OutlookEventIds = {
  mike?: string;
  steven?: string;
};

type UpsertArgs = {
  client: {
    id: string;
    reference?: number | null;
    firstName: string;
    lastName: string;
    email?: string | null;
    mobile?: string | null;
  };
  callbackDate?: string;
  callbackTime?: string;
  notes?: string;
  existingEventIds?: OutlookEventIds;
};

function getEnv(name: string): string | undefined {
  return process.env[name]?.trim();
}

function isConfigured(): boolean {
  return Boolean(
    getEnv('MICROSOFT_TENANT_ID') &&
      getEnv('MICROSOFT_CLIENT_ID') &&
      getEnv('MICROSOFT_CLIENT_SECRET'),
  );
}

async function getAccessToken(): Promise<string | null> {
  if (!isConfigured()) return null;

  const tenantId = getEnv('MICROSOFT_TENANT_ID')!;
  const clientId = getEnv('MICROSOFT_CLIENT_ID')!;
  const clientSecret = getEnv('MICROSOFT_CLIENT_SECRET')!;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Microsoft token error:', text);
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function graphRequest(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const total = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor((total % (24 * 60)) / 60);
  const newMinutes = total % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

function buildSubject(client: UpsertArgs['client']): string {
  const ref = client.reference ? ` #${client.reference}` : '';
  return `TMAC Callback${ref} - ${client.firstName} ${client.lastName}`;
}

function buildBody(client: UpsertArgs['client'], notes?: string): string {
  const parts = [
    `Client: ${client.firstName} ${client.lastName}`,
    client.reference ? `Reference: ${client.reference}` : '',
    client.email ? `Email: ${client.email}` : '',
    client.mobile ? `Mobile: ${client.mobile}` : '',
    notes ? `Notes: ${notes}` : '',
  ].filter(Boolean);

  return parts.join('\n');
}

function buildEventPayload(args: UpsertArgs) {
  const callbackDate = args.callbackDate ?? londonPartsFromDate(new Date()).date;
  const callbackTime = args.callbackTime ?? '10:00';

  return {
    subject: buildSubject(args.client),
    body: {
      contentType: 'Text',
      content: buildBody(args.client, args.notes),
    },
    start: {
      dateTime: `${callbackDate}T${callbackTime}:00`,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: `${callbackDate}T${addMinutesToTime(callbackTime, 30)}:00`,
      timeZone: 'Europe/London',
    },
    location: {
      displayName: 'TMAC Callback',
    },
    categories: ['TMAC CRM'],
  };
}

export function londonPartsFromDate(date: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export async function upsertOutlookCallbackEvents(
  args: UpsertArgs,
): Promise<OutlookEventIds | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const payload = buildEventPayload(args);
  const result: OutlookEventIds = {};

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<
    [keyof OutlookEventIds, string]
  >) {
    const existingId = args.existingEventIds?.[key];

    let response: Response;
    if (existingId) {
      response = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        result[key] = existingId;
        continue;
      }
    }

    response = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Outlook event create failed for ${mailbox}:`, text);
      continue;
    }

    const data = (await response.json()) as { id?: string };
    if (data.id) {
      result[key] = data.id;
    }
  }

  return result;
}

export async function deleteOutlookCallbackEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  if (!eventIds) return;

  const token = await getAccessToken();
  if (!token) return;

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<
    [keyof OutlookEventIds, string]
  >) {
    const eventId = eventIds[key];
    if (!eventId) continue;

    const response = await graphRequest(
      token,
      `/users/${encodeURIComponent(mailbox)}/events/${eventId}`,
      { method: 'DELETE' },
    );

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      console.error(`Outlook event delete failed for ${mailbox}:`, text);
    }
  }
}
