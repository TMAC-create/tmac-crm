const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAILBOXES = {
  mike: 'mike@themoneyadvicecentre.com',
  steven: 'steven@themoneyadvicecentre.com',
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
  notes?: string;
  existingEventIds?: OutlookEventIds | null;
};

type TaskArgs = {
  client: ClientSummary;
  title: string;
  description?: string | null;
  dueAt?: string | Date | null;
  existingEventIds?: OutlookEventIds | null;
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
    console.error('Microsoft token error:', await response.text());
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

function addMinutes(time: string, minutesToAdd: number): string {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const total = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor((total % (24 * 60)) / 60);
  const newMinutes = total % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
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

function buildClientLabel(client: ClientSummary): string {
  const ref = client.reference ? `#${client.reference} - ` : '';
  return `${ref}${client.firstName} ${client.lastName}`.trim();
}

function taskPayload(args: TaskArgs) {
  const date = args.dueAt ? new Date(args.dueAt) : new Date();
  const { date: dueDate, time } = londonPartsFromDate(date);
  const subject = `TMAC Task - ${args.title} - ${buildClientLabel(args.client)}`;
  const bodyLines = [
    `Client: ${buildClientLabel(args.client)}`,
    args.description ? `Task notes: ${args.description}` : '',
    args.client.email ? `Email: ${args.client.email}` : '',
    args.client.mobile ? `Mobile: ${args.client.mobile}` : '',
  ].filter(Boolean);

  return {
    subject,
    body: {
      contentType: 'Text',
      content: bodyLines.join('\n'),
    },
    start: {
      dateTime: `${dueDate}T${time}:00`,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: `${dueDate}T${addMinutes(time, 30)}:00`,
      timeZone: 'Europe/London',
    },
    location: {
      displayName: 'TMAC Task',
    },
    categories: ['TMAC CRM'],
  };
}

function callbackPayload(args: CallbackArgs) {
  const callbackDate = args.callbackDate ?? londonPartsFromDate(new Date()).date;
  const callbackTime = args.callbackTime ?? '10:00';
  const subject = `TMAC Callback - ${buildClientLabel(args.client)}`;

  const bodyLines = [
    `Client: ${buildClientLabel(args.client)}`,
    args.client.email ? `Email: ${args.client.email}` : '',
    args.client.mobile ? `Mobile: ${args.client.mobile}` : '',
    args.notes ? `Notes: ${args.notes}` : '',
  ].filter(Boolean);

  return {
    subject,
    body: {
      contentType: 'Text',
      content: bodyLines.join('\n'),
    },
    start: {
      dateTime: `${callbackDate}T${callbackTime}:00`,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: `${callbackDate}T${addMinutes(callbackTime, 30)}:00`,
      timeZone: 'Europe/London',
    },
    location: {
      displayName: 'TMAC Callback',
    },
    categories: ['TMAC CRM'],
  };
}

async function upsertEvents(
  payload: Record<string, unknown>,
  existingEventIds?: OutlookEventIds | null,
): Promise<OutlookEventIds | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const result: OutlookEventIds = {};

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<
    [keyof OutlookEventIds, string]
  >) {
    const existingId = existingEventIds?.[key];
    let response: Response;

    if (existingId) {
      response = await graphRequest(
        token,
        `/users/${encodeURIComponent(mailbox)}/events/${existingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );

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
      console.error(`Outlook event create failed for ${mailbox}:`, await response.text());
      continue;
    }

    const data = (await response.json()) as { id?: string };
    if (data.id) {
      result[key] = data.id;
    }
  }

  return result;
}

async function deleteEvents(eventIds?: OutlookEventIds | null): Promise<void> {
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
      console.error(`Outlook event delete failed for ${mailbox}:`, await response.text());
    }
  }
}

export async function upsertOutlookTaskEvents(args: TaskArgs): Promise<OutlookEventIds | null> {
  if (!args.dueAt) return null;
  return upsertEvents(taskPayload(args), args.existingEventIds);
}

export async function deleteOutlookTaskEvents(
  eventIds?: OutlookEventIds | null,
): Promise<void> {
  await deleteEvents(eventIds);
}

export async function upsertOutlookCallbackEvents(
  args: CallbackArgs,
): Promise<OutlookEventIds | null> {
  return upsertEvents(callbackPayload(args), args.existingEventIds);
}

export async function deleteOutlookCallbackEvents(
  eventIds?: OutlookEventIds | null,
): Promise<void> {
  await deleteEvents(eventIds);
}
