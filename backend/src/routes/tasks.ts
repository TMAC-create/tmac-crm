import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import type { OutlookEventIds } from '../services/outlook.js';
import {
  deleteOutlookCallbackEvents,
  deleteOutlookTaskEvents,
  londonLocalToUtcDate,
  londonPartsFromDate,
  upsertOutlookCallbackEvents,
  upsertOutlookTaskEvents,
} from '../services/outlook.js';

const router = Router();
router.use(requireAuth);

const OUTLOOK_MARKER = '\n\n<!--TMAC_OUTLOOK:';
const CALLBACK_TITLE = 'Client callback booked';
const CHASE_DOCS_TITLE = 'Chase documents before callback';

function isCallbackTaskTitle(title: string): boolean {
  return title === CALLBACK_TITLE;
}

function sanitiseDescription(value?: string | null): string | null {
  if (!value) return null;
  const index = value.indexOf(OUTLOOK_MARKER);
  const clean = index >= 0 ? value.slice(0, index) : value;
  const trimmed = clean.trim();
  return trimmed ? trimmed : null;
}

function readLegacyOutlookEventIds(description?: string | null): OutlookEventIds | null {
  if (!description) return null;
  const start = description.indexOf(OUTLOOK_MARKER);
  if (start < 0) return null;

  const json = description.slice(start + OUTLOOK_MARKER.length).replace(/-->\s*$/, '').trim();
  if (!json) return null;

  try {
    return JSON.parse(json) as OutlookEventIds;
  } catch {
    return null;
  }
}

function normaliseEventIds(value: unknown): OutlookEventIds | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as OutlookEventIds;
  const eventIds: OutlookEventIds = {};
  if (typeof raw.mike === 'string' && raw.mike.trim()) eventIds.mike = raw.mike.trim();
  if (typeof raw.steven === 'string' && raw.steven.trim()) eventIds.steven = raw.steven.trim();
  return eventIds.mike || eventIds.steven ? eventIds : null;
}

function taskOutlookEventIds(task: { outlookEventIds?: unknown; description?: string | null }): OutlookEventIds | null {
  return normaliseEventIds(task.outlookEventIds) ?? readLegacyOutlookEventIds(task.description);
}

function serialiseTask<T extends { description?: string | null }>(task: T): T {
  return { ...task, description: sanitiseDescription(task.description) };
}

function serialiseTasks<T extends { description?: string | null }>(tasks: T[]): T[] {
  return tasks.map((task) => serialiseTask(task));
}

function parseDueAtInput(value?: string | null): Date | null {
  if (!value) return null;

  const localMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);

  if (localMatch && !hasExplicitZone) {
    return londonLocalToUtcDate(localMatch[1], localMatch[2]);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shouldRemoveFromOutlook(status?: string | null, outcome?: string | null): boolean {
  return status === 'DONE' && ['COMPLETED', 'NO_ANSWER', 'CANCELLED'].includes(outcome || '');
}

async function removeCallbackOutlookForClient(clientId: string, fallbackEventIds?: OutlookEventIds | null): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const metadata = ((client.metadataJson ?? {}) as any) || {};
  const callback = (metadata.callback ?? {}) as any;
  const metadataEventIds = normaliseEventIds(callback.outlookEventIds);
  const eventIds = fallbackEventIds ?? metadataEventIds;

  if (eventIds?.mike || eventIds?.steven) {
    await deleteOutlookCallbackEvents(eventIds);
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      metadataJson: {
        ...metadata,
        callback: {
          ...callback,
          outlookEventIds: {},
        },
      },
    },
  });

  await prisma.task.updateMany({
    where: { clientId, title: CALLBACK_TITLE },
    data: { outlookEventIds: null as any },
  });
}

router.get('/open', async (_req, res) => {
  const tasks = await prisma.task.findMany({
    where: { status: 'OPEN' },
    include: { client: { select: { id: true, reference: true, firstName: true, lastName: true, mobile: true } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(serialiseTasks(tasks));
});

router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const tasks = await prisma.task.findMany({
    where: { clientId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(serialiseTasks(tasks));
});

router.post('/', async (req, res) => {
  const { clientId, title, description, dueAt, priority } = req.body as {
    clientId?: string;
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  };

  if (!clientId || !title?.trim()) {
    return res.status(400).json({ message: 'clientId and title are required.' });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ message: 'Client not found.' });

  const dueAtDate = parseDueAtInput(dueAt);
  const cleanDescription = sanitiseDescription(description);
  const taskTitle = title.trim();
  let outlookEventIds: OutlookEventIds | null = null;

  if (dueAtDate) {
    outlookEventIds = isCallbackTaskTitle(taskTitle)
      ? await upsertOutlookCallbackEvents({
          client,
          callbackDate: londonPartsFromDate(dueAtDate).date,
          callbackTime: londonPartsFromDate(dueAtDate).time,
          notes: cleanDescription,
        })
      : await upsertOutlookTaskEvents({
          client,
          title: taskTitle,
          description: cleanDescription,
          dueAt: dueAtDate,
        });
  }

  const task = await prisma.task.create({
    data: {
      clientId,
      title: taskTitle,
      description: cleanDescription,
      dueAt: dueAtDate,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      outcome: null,
      outlookEventIds: outlookEventIds as any,
    },
  });

  if (isCallbackTaskTitle(taskTitle) && dueAtDate) {
    const metadata = ((client.metadataJson ?? {}) as any) || {};
    const callback = (metadata.callback ?? {}) as any;
    const londonParts = londonPartsFromDate(dueAtDate);
    await prisma.client.update({
      where: { id: client.id },
      data: {
        status: 'CALL_BACK',
        metadataJson: {
          ...metadata,
          callback: {
            ...callback,
            date: londonParts.date,
            time: londonParts.time,
            notes: cleanDescription || '',
            outlookEventIds: outlookEventIds ?? callback.outlookEventIds ?? {},
          },
        },
      },
    });
  }

  res.status(201).json(serialiseTask(task));
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, outcome, title, description, dueAt, priority } = req.body as {
    status?: 'OPEN' | 'DONE';
    outcome?: 'COMPLETED' | 'NO_ANSWER' | 'RESCHEDULED' | 'CANCELLED' | null;
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  };

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Task not found.' });

  const client = existing.clientId ? await prisma.client.findUnique({ where: { id: existing.clientId } }) : null;
  const nextTitle = title?.trim() || existing.title;
  const cleanIncomingDescription = description !== undefined ? sanitiseDescription(description) : sanitiseDescription(existing.description);
  const nextDueAtDate = dueAt !== undefined ? parseDueAtInput(dueAt) : existing.dueAt;
  const nextStatus = status ?? existing.status;
  const nextOutcome = outcome === undefined ? existing.outcome : outcome;
  const existingEventIds = taskOutlookEventIds(existing);

  let nextOutlookEventIds: OutlookEventIds | null = existingEventIds;
  const closeAndRemove = shouldRemoveFromOutlook(nextStatus, nextOutcome);

  if (client && existing.clientId) {
    if (isCallbackTaskTitle(existing.title)) {
      if (closeAndRemove) {
        await removeCallbackOutlookForClient(existing.clientId, existingEventIds);
        nextOutlookEventIds = null;
      } else if (nextStatus === 'OPEN' && nextDueAtDate) {
        const metadata = ((client.metadataJson ?? {}) as any) || {};
        const callback = (metadata.callback ?? {}) as any;
        const londonParts = londonPartsFromDate(nextDueAtDate);
        const eventIds = await upsertOutlookCallbackEvents({
          client,
          callbackDate: londonParts.date,
          callbackTime: londonParts.time,
          notes: cleanIncomingDescription || undefined,
          existingEventIds: existingEventIds ?? normaliseEventIds(callback.outlookEventIds),
        });
        nextOutlookEventIds = eventIds ?? existingEventIds;

        await prisma.client.update({
          where: { id: client.id },
          data: {
            status: 'CALL_BACK',
            metadataJson: {
              ...metadata,
              callback: {
                ...callback,
                date: londonParts.date,
                time: londonParts.time,
                notes: cleanIncomingDescription || '',
                outlookEventIds: nextOutlookEventIds ?? {},
              },
            },
          },
        });
      }
    } else {
      if (closeAndRemove) {
        await deleteOutlookTaskEvents(existingEventIds);
        nextOutlookEventIds = null;
      } else if (nextStatus === 'OPEN' && nextDueAtDate) {
        const eventIds = await upsertOutlookTaskEvents({
          client,
          title: nextTitle,
          description: cleanIncomingDescription,
          dueAt: nextDueAtDate,
          existingEventIds,
        });
        nextOutlookEventIds = eventIds ?? existingEventIds;
      } else if (nextStatus === 'OPEN' && !nextDueAtDate && existingEventIds) {
        await deleteOutlookTaskEvents(existingEventIds);
        nextOutlookEventIds = null;
      }
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: title !== undefined ? nextTitle : undefined,
      description: cleanIncomingDescription,
      dueAt: dueAt !== undefined ? nextDueAtDate : undefined,
      priority: priority ?? undefined,
      status: nextStatus,
      outcome: nextOutcome,
      outlookEventIds: nextOutlookEventIds as any,
    },
  });

  res.json(serialiseTask(task));
});

export default router;
