import type { Client, Task } from '@prisma/client';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const OUTLOOK_MAILBOXES = {
  mike: 'mike@themoneyadvicecentre.com',
  steven: 'steven@themoneyadvicecentre.com',
} as const;

export type OutlookEventIds = {
  mike?: string;
  steven?: string;
};

type CallbackInput = {
  client: Client;
  callbackDate: string;
  callbackTime: string;
  notes?: string;
  existingEventIds?: OutlookEventIds;
};

type TaskInput = {
  client: Client;
  task: Task;
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
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

function lastSunday(year: number, monthIndex: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

function isLondonDstLocal(datePart: string, timePart: string): boolean {
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(5, 7));
  const day = Number(datePart.slice(8, 10));
  const hour = Number(timePart.slice(0, 2));

  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;

  const marchSwitchDay = lastSunday(year, 2);
  const octoberSwitchDay = lastSunday(year, 9);

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

export function londonLocalToUtcDate(datePart?: string, timePart?: string): Date | null {
  if (!datePart || !timePart) return null;

  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(5, 7));
  const day = Number(datePart.slice(8, 10));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(3, 5));

  if (
    [year, month, day, hour, minute].some((v) => Number.isNaN(v))
  ) {
    return null;
  }

  const dst = isLondonDstLocal(datePart, timePart);
  const utcHour = hour - (dst ? 1 : 0);

  return new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0));
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

function buildSubject(client: Client, title: string): string {
  return `TMAC - ${title} - ${client.reference ?? '-'} - ${client.firstName} ${client.lastName}`;
}

function buildBody(client: Client, title: string, notes?: string): string {
  const lines = [
    `Task: ${title}`,
    `Client: ${client.firstName} ${client.lastName}`,
    `Reference: ${client.reference ?? '-'}`,
    client.mobile ? `Mobile: ${client.mobile}` : '',
    client.email ? `Email: ${client.email}` : '',
    notes ? `Notes: ${notes}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function buildGraphDateTimeRange(datePart: string, timePart: string) {
  const [hour, minute] = timePart.split(':').map(Number);
  const endMinuteTotal = hour * 60 + minute + 30;
  const endHour = Math.floor((endMinuteTotal % (24 * 60)) / 60);
  const endMinute = endMinuteTotal % 60;

  return {
    startLocal: `${datePart}T${timePart}:00`,
    endLocal: `${datePart}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`,
  };
}

async function createOrUpdateEventForMailbox(
  mailbox: string,
  token: string,
  client: Client,
  title: string,
  datePart: string,
  timePart: string,
  notes?: string,
  existingEventId?: string,
): Promise<string | undefined> {
  const { startLocal, endLocal } = buildGraphDateTimeRange(datePart, timePart);

  const payload = {
    subject: buildSubject(client, title),
    body: {
      contentType: 'Text',
      content: buildBody(client, title, notes),
    },
    start: {
      dateTime: startLocal,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: endLocal,
      timeZone: 'Europe/London',
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
      `Microsoft Graph event ${existingEventId ? 'update' : 'create'} failed for ${mailbox}: ${response.status} ${text}`,
    );
  }

  if (existingEventId) return existingEventId;

  const json = (await response.json()) as { id?: string };
  return json.id;
}

async function deleteEventForMailbox(mailbox: string, token: string, eventId?: string): Promise<void> {
  if (!eventId) return;

  const response = await fetch(
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 404) return;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph delete failed for ${mailbox}: ${response.status} ${text}`);
  }
}

async function upsertForTitle(
  client: Client,
  title: string,
  date: string,
  time: string,
  notes?: string,
  existingEventIds?: OutlookEventIds,
): Promise<OutlookEventIds> {
  const token = await getAccessToken();

  const mike = await createOrUpdateEventForMailbox(
    OUTLOOK_MAILBOXES.mike,
    token,
    client,
    title,
    date,
    time,
    notes,
    existingEventIds?.mike,
  );

  const steven = await createOrUpdateEventForMailbox(
    OUTLOOK_MAILBOXES.steven,
    token,
    client,
    title,
    date,
    time,
    notes,
    existingEventIds?.steven,
  );

  return { mike, steven };
}

export async function upsertOutlookCallbackEvents(input: CallbackInput): Promise<OutlookEventIds> {
  return upsertForTitle(
    input.client,
    'Client callback booked',
    input.callbackDate,
    input.callbackTime,
    input.notes,
    input.existingEventIds,
  );
}

export async function upsertOutlookTaskEvents(input: TaskInput): Promise<OutlookEventIds | null> {
  if (!input.task.dueAt) return null;

  const london = londonPartsFromDate(input.task.dueAt);
  return upsertForTitle(
    input.client,
    input.task.title,
    london.date,
    london.time,
    input.task.description ?? undefined,
    input.existingEventIds,
  );
}

export async function deleteOutlookCallbackEvents(eventIds?: OutlookEventIds): Promise<void> {
  if (!eventIds?.mike && !eventIds?.steven) return;

  const token = await getAccessToken();
  await deleteEventForMailbox(OUTLOOK_MAILBOXES.mike, token, eventIds?.mike);
  await deleteEventForMailbox(OUTLOOK_MAILBOXES.steven, token, eventIds?.steven);
}

export async function deleteOutlookTaskEvents(eventIds?: OutlookEventIds): Promise<void> {
  return deleteOutlookCallbackEvents(eventIds);
}
