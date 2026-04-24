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

type TaskSummary = {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: Date | string | null;
  priority?: string | null;
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
  task?: TaskSummary;
  title?: string;
  description?: string | null;
  dueAt?: Date | string | null;
  priority?: string | null;
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
  if (!isConfigured()) {
    console.warn('Outlook sync skipped: Microsoft environment variables are not configured.');
    return null;
  }

  const tenantId = getEnv('MICROSOFT_TENANT_ID')!;
  const clientId = getEnv('MICROSOFT_CLIENT_ID')!;
  const clientSecret = getEnv('MICROSOFT_CLIENT_SECRET')!;

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

function addMinutes(time: string, minutesToAdd: number): string {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const total = hours * 60 + minutes + minutesToAdd;
  const day = 24 * 60;
  const wrapped = ((total % day) + day) % day;
  const newHours = Math.floor(wrapped / 60);
  const newMinutes = wrapped % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

export function londonPartsFromDate(value: Date | string): { date: string; time: string } {
  const date = value instanceof Date ? value : new Date(value);

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

function londonOffsetMinutesForUtc(date: Date): number {
  const london = londonPartsFromDate(date);
  const londonAsUtc = Date.UTC(
    Number(london.date.slice(0, 4)),
    Number(london.date.slice(5, 7)) - 1,
    Number(london.date.slice(8, 10)),
    Number(london.time.slice(0, 2)),
    Number(london.time.slice(3, 5)),
  );

  return Math.round((londonAsUtc - date.getTime()) / 60000);
}

export function londonLocalToUtcDate(date: string, time: string): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));

  let utc = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  let offset = londonOffsetMinutesForUtc(utc);
  utc = new Date(Date.UTC(year, month, day, hour, minute - offset, 0, 0));

  // Re-check once because the first estimate can cross a DST boundary.
  offset = londonOffsetMinutesForUtc(utc);
  return new Date(Date.UTC(year, month, day, hour, minute - offset, 0, 0));
}

function buildClientLabel(client: ClientSummary): string {
  const ref = client.reference ? `#${client.reference} - ` : '';
  return `${ref}${client.firstName} ${client.lastName}`.trim();
}

function normaliseTaskArgs(args: TaskArgs): Required<Pick<TaskArgs, 'title'>> & {
  description?: string | null;
  dueAt?: Date | string | null;
  priority?: string | null;
} {
  return {
    title: args.title ?? args.task?.title ?? 'Task',
    description: args.description ?? args.task?.description ?? null,
    dueAt: args.dueAt ?? args.task?.dueAt ?? null,
    priority: args.priority ?? args.task?.priority ?? null,
  };
}

function taskPayload(args: TaskArgs) {
  const task = normaliseTaskArgs(args);
  const dueAt = task.dueAt ? new Date(task.dueAt) : new Date();
  const { date: dueDate, time } = londonPartsFromDate(dueAt);
  const subject = `TMAC Task - ${task.title} - ${buildClientLabel(args.client)}`;
  const bodyLines = [
    `Client: ${buildClientLabel(args.client)}`,
    task.description ? `Task notes: ${task.description}` : '',
    task.priority ? `Priority: ${task.priority}` : '',
    args.client.email ? `Email: ${args.client.email}` : '',
    args.client.mobile ? `Mobile: ${args.client.mobile}` : '',
  ].filter(Boolean);

  return {
    subject,
    body: { contentType: 'Text', content: bodyLines.join('\n') },
    start: { dateTime: `${dueDate}T${time}:00`, timeZone: 'Europe/London' },
    end: { dateTime: `${dueDate}T${addMinutes(time, 30)}:00`, timeZone: 'Europe/London' },
    location: { displayName: 'TMAC Task' },
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
    body: { contentType: 'Text', content: bodyLines.join('\n') },
    start: { dateTime: `${callbackDate}T${callbackTime}:00`, timeZone: 'Europe/London' },
    end: { dateTime: `${callbackDate}T${addMinutes(callbackTime, 30)}:00`, timeZone: 'Europe/London' },
    location: { displayName: 'TMAC Callback' },
    categories: ['TMAC CRM'],
  };
}

async function upsertEvents(
  payload: Record<string, unknown>,
  existingEventIds?: OutlookEventIds | null,
): Promise<OutlookEventIds | null> {
  const token = await getAccessToken();
  if (!token) return existingEventIds ?? null;

  const result: OutlookEventIds = {};

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<[keyof OutlookEventIds, string]>) {
    const existingId = existingEventIds?.[key];
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

      if (response.status !== 404) {
        console.error(`Outlook event update failed for ${mailbox}:`, await response.text());
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
    if (data.id) result[key] = data.id;
  }

  return result;
}

async function deleteEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  if (!eventIds) return;

  const token = await getAccessToken();
  if (!token) return;

  for (const [key, mailbox] of Object.entries(MAILBOXES) as Array<[keyof OutlookEventIds, string]>) {
    const eventId = eventIds[key];
    if (!eventId) continue;

    const response = await graphRequest(token, `/users/${encodeURIComponent(mailbox)}/events/${eventId}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      console.error(`Outlook event delete failed for ${mailbox}:`, await response.text());
    }
  }
}

export async function upsertOutlookTaskEvents(args: TaskArgs): Promise<OutlookEventIds | null> {
  const task = normaliseTaskArgs(args);
  if (!task.dueAt) return args.existingEventIds ?? null;
  return upsertEvents(taskPayload(args), args.existingEventIds);
}

export async function deleteOutlookTaskEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  await deleteEvents(eventIds);
}

export async function upsertOutlookCallbackEvents(args: CallbackArgs): Promise<OutlookEventIds | null> {
  return upsertEvents(callbackPayload(args), args.existingEventIds);
}

export async function deleteOutlookCallbackEvents(eventIds?: OutlookEventIds | null): Promise<void> {
  await deleteEvents(eventIds);
}
