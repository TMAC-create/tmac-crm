import type { Client } from '@prisma/client';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const OUTLOOK_MAILBOXES = {
  mike: 'mike@themoneyadvicecentre.com',
  steven: 'steven@themoneyadvicecentre.com',
} as const;

export type OutlookEventIds = {
  mike?: string;
  steven?: string;
};

type UpsertOutlookCallbackEventsInput = {
  client: Client;
  callbackDate: string;
  callbackTime: string;
  notes?: string;
  existingEventIds?: OutlookEventIds;
};

type LondonParts = {
  date: string;
  time: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getAccessToken(): Promise<string> {
  const tenantId = requireEnv('MICROSOFT_TENANT_ID');
  const clientId = requireEnv('MICROSOFT_CLIENT_ID');
  const clientSecret = requireEnv('MICROSOFT_CLIENT_SECRET');

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft token request failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Microsoft token response did not include access_token.');
  }

  return json.access_token;
}

function buildSubject(client: Client): string {
  return `TMAC Callback - ${client.reference ?? '-'} - ${client.firstName} ${client.lastName}`;
}

function buildBody(client: Client, notes?: string): string {
  const lines = [
    `Client: ${client.firstName} ${client.lastName}`,
    `Reference: ${client.reference ?? '-'}`,
    client.mobile ? `Mobile: ${client.mobile}` : '',
    client.email ? `Email: ${client.email}` : '',
    notes ? `Notes: ${notes}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function isLondonDstLocal(datePart: string, timePart: string): boolean {
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(5, 7));
  const day = Number(datePart.slice(8, 10));
  const hour = Number(timePart.slice(0, 2));

  const lastSunday = (monthIndex: number) => {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
    return lastDay.getUTCDate() - lastDay.getUTCDay();
  };

  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;

  const marchSwitchDay = lastSunday(2);
  const octoberSwitchDay = lastSunday(9);

  if (month === 3) {
    if (day > marchSwitchDay) return true;
    if (day < marchSwitchDay) return false;
    return hour >= 2;
  }

  if (month === 10) {
    if (day < octoberSwitchDay) return true;
    if (day > octoberSwitchDay) return false;
    return hour < 2;
  }

  return false;
}

function buildGraphDateTimeRange(datePart: string, timePart: string) {
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const offset = isLondonDstLocal(datePart, timePart) ? '+01:00' : '+00:00';
  const start = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour
    .toString()
    .padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00${offset}`;

  const endDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  endDate.setUTCMinutes(endDate.getUTCMinutes() + 30);
  const endYear = endDate.getUTCFullYear();
  const endMonth = (endDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const endDay = endDate.getUTCDate().toString().padStart(2, '0');
  const endHour = hour.toString().padStart(2, '0');
  const endMinute = ((minute + 30) % 60).toString().padStart(2, '0');
  const end = `${endYear}-${endMonth}-${endDay}T${endHour}:${endMinute}:00${offset}`;

  return { start, end };
}

async function createOrUpdateEventForMailbox(
  mailbox: string,
  token: string,
  client: Client,
  callbackDate: string,
  callbackTime: string,
  notes?: string,
  existingEventId?: string
): Promise<string | undefined> {
  const { start, end } = buildGraphDateTimeRange(callbackDate, callbackTime);

  const payload = {
    subject: buildSubject(client),
    body: {
      contentType: 'Text',
      content: buildBody(client, notes),
    },
    start: {
      dateTime: start,
      timeZone: 'UTC',
    },
    end: {
      dateTime: end,
      timeZone: 'UTC',
    },
  };

  const url = existingEventId
    ? `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/events/${existingEventId}`
    : `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/events`;

  const response = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Microsoft Graph event ${existingEventId ? 'update' : 'create'} failed for ${mailbox}: ${response.status} ${text}`
    );
  }

  if (existingEventId) {
    return existingEventId;
  }

  const json = (await response.json()) as { id?: string };
  return json.id;
}

async function deleteEventForMailbox(
  mailbox: string,
  token: string,
  eventId?: string
): Promise<void> {
  if (!eventId) return;

  const response = await fetch(
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 404) return;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph delete failed for ${mailbox}: ${response.status} ${text}`);
  }
}

export function londonPartsFromDate(date: Date): LondonParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export async function upsertOutlookCallbackEvents(
  input: UpsertOutlookCallbackEventsInput
): Promise<OutlookEventIds> {
  const token = await getAccessToken();

  const mike = await createOrUpdateEventForMailbox(
    OUTLOOK_MAILBOXES.mike,
    token,
    input.client,
    input.callbackDate,
    input.callbackTime,
    input.notes,
    input.existingEventIds?.mike
  );

  const steven = await createOrUpdateEventForMailbox(
    OUTLOOK_MAILBOXES.steven,
    token,
    input.client,
    input.callbackDate,
    input.callbackTime,
    input.notes,
    input.existingEventIds?.steven
  );

  return { mike, steven };
}

export async function deleteOutlookCallbackEvents(
  eventIds?: OutlookEventIds
): Promise<void> {
  if (!eventIds?.mike && !eventIds?.steven) return;

  const token = await getAccessToken();
  await deleteEventForMailbox(OUTLOOK_MAILBOXES.mike, token, eventIds?.mike);
  await deleteEventForMailbox(OUTLOOK_MAILBOXES.steven, token, eventIds?.steven);
}
