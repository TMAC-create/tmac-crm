const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const MAILBOXES = {
  mike: process.env.OUTLOOK_MIKE_MAILBOX || process.env.MICROSOFT_MIKE_MAILBOX || 'mike@themoneyadvicecentre.com',
  steven: process.env.OUTLOOK_STEVEN_MAILBOX || process.env.MICROSOFT_STEVEN_MAILBOX || 'steven@themoneyadvicecentre.com',
} as const;

export type OutlookEventIds = {
  mike?: string;
  steven?: string;
};

type ClientSummary = {
  id: string;
  reference?: number | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  mobile?: string | null;
};

type CallbackArgs = {
  client: ClientSummary;
  callbackDate?: string;
  callbackTime?: string;
  notes?: string | null;
  existingEventIds?: OutlookEventIds | null;
};

type TaskArgs = {
  client: ClientSummary;
  title: string;
  description?: string | null;
  dueAt?: string | Date | null;
  existingEventIds?: OutlookEventIds | null;
};

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function isConfigured(): boolean {
  return Boolean(
    getEnv('MICROSOFT_TENANT_ID', 'OUTLOOK_TENANT_ID') &&
      getEnv('MICROSOFT_CLIENT_ID', 'OUTLOOK_CLIENT_ID') &&
      getEnv('MICROSOFT_CLIENT_SECRET', 'OUTLOOK_CLIENT_SECRET'),
  );
}

async function getAccessToken(): Promise<string | null> {
  if (!isConfigured()) {
    console.warn('Outlook sync skipped: Microsoft/Outlook environment variables are not configured.');
    return null;
  }

  const tenantId = getEnv('MICROSOFT_TENANT_ID', 'OUTLOOK_TENANT_ID')!;
  const clientId = getEnv('MICROSOFT_CLIENT_ID', 'OUTLOOK_CLIENT_ID')!;
  const clientSecret = getEnv('MICROSOFT_CLIENT_SECRET', 'OUTLOOK_CLIENT_SECRET')!;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    console.error('Microsoft token error:', await response.text());
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function graphRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
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

  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null;

  const utcHour = hour - (isLondonDstLocal(datePart, timePart) ? 1 : 0);
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0));
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

function addMinutesToLocalDateTime(datePart: string, timePart: string, minutesToAdd: number): { date: string; time: string } {
  const startUtc = londonLocalToUtcDate(datePart, timePart);
  if (!startUtc) return { date: datePart, time: timePart };
  return londonPartsFromDate(new Date(startUtc.getTime() + minutesToAdd * 60_000));
}

function buildClientLabel(client: ClientSummary): string {
  const ref = client.reference ? `#${client.reference} - ` : '';
  return `${ref}${client.firstName} ${client.lastName}`.trim();
}

function buildBody(client: ClientSummary, title: string, notes?: string | null): string {
  return [
    `Client: ${buildClientLabel(client)}`,
    client.email ? `Email: ${client.email}` : '',
    client.mobile ? `Mobile: ${client.mobile}` : '',
    notes ? `Notes: ${notes}` : '',
    `CRM client id: ${client.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEventPayload(client: ClientSummary, title: string, datePart: string, timePart: string, notes?: string | null) {
  const end = addMinutesToLocalDateTime(datePart, timePart, 30);

  return {
    subject: `TMAC - ${title} - ${buildClientLabel(client)}`,
    body: {
      contentType: 'Text',
      content: buildBody(client, title, notes),
    },
    start: {
      dateTime: `${datePart}T${timePart}:00`,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: `${end.date}T${end.time}:00`,
      timeZone: 'Europe/London',
    },
    location: {
      displayName: 'TMAC CRM',
    },
    categories: ['TMAC CRM'],
    showAs: 'busy',
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
  };
}

function hasAnyEventId(eventIds?: OutlookEventIds | null): boolean {
  return Boolean(eventIds?.mike || eventIds?.steven);
}

async function upsertEvents(payload: Record<string, unknown>, existingEventIds?: OutlookEventIds | null): Promise<OutlookEventIds | null> {
  const token = await getAccessToken();
  if (!token) return existingEventIds && hasAnyEventId(existingEventIds) ? existingEventIds : null;

  const result: OutlookEventIds = {};

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<[keyof OutlookEventIds, string]>) {
    const existingId = existingEventIds?.[key];

    if (existingId) {
      const patchResponse = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (patchResponse.ok) {
        result[key] = existingId;
        continue;
      }

      if (patchResponse.status !== 404) {
        console.error(`Outlook event update failed for ${mailbox}:`, await patchResponse.text());
        result[key] = existingId;
        continue;
      }
    }

    const createResponse = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!createResponse.ok) {
      console.error(`Outlook event create failed for ${mailbox}:`, await createResponse.text());
      continue;
    }

    const data = (await createResponse.json()) as { id?: string };
    if (data.id) result[key] = data.id;
  }

  return hasAnyEventId(result) ? result : null;
}

async function deleteEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  if (!hasAnyEventId(eventIds)) return;

  const token = await getAccessToken();
  if (!token) return;

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<[keyof OutlookEventIds, string]>) {
    const eventId = eventIds?.[key];
    if (!eventId) continue;

    const response = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      console.error(`Outlook event delete failed for ${mailbox}:`, await response.text());
    }
  }
}

export async function upsertOutlookCallbackEvents(args: CallbackArgs): Promise<OutlookEventIds | null> {
  const callbackDate = args.callbackDate ?? londonPartsFromDate(new Date()).date;
  const callbackTime = args.callbackTime ?? '10:00';
  return upsertEvents(
    buildEventPayload(args.client, 'Callback', callbackDate, callbackTime, args.notes),
    args.existingEventIds,
  );
}

export async function deleteOutlookCallbackEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  await deleteEvents(eventIds);
}

export async function upsertOutlookTaskEvents(args: TaskArgs): Promise<OutlookEventIds | null> {
  if (!args.dueAt) return null;
  const dueDate = args.dueAt instanceof Date ? args.dueAt : new Date(args.dueAt);
  if (Number.isNaN(dueDate.getTime())) return null;

  const londonParts = londonPartsFromDate(dueDate);
  return upsertEvents(
    buildEventPayload(args.client, args.title, londonParts.date, londonParts.time, args.description),
    args.existingEventIds,
  );
}

export async function deleteOutlookTaskEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  await deleteEvents(eventIds);
}
