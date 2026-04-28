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

function isCallbackTaskTitle(title: string): boolean {
  return title === 'Client callback booked';
}

function sanitiseDescription(value?: string | null): string | null {
  if (!value) return null;
  const index = value.indexOf(OUTLOOK_MARKER);
  const clean = index >= 0 ? value.slice(0, index) : value;
  const trimmed = clean.trim();
  return trimmed ? trimmed : null;
}

function readOutlookEventIds(description?: string | null): OutlookEventIds | null {
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

function writeOutlookEventIds(description: string | null | undefined, eventIds?: OutlookEventIds | null): string | null {
  const clean = sanitiseDescription(description);
  if (!eventIds || (!eventIds.mike && !eventIds.steven)) return clean;
  return `${clean ?? ''}${OUTLOOK_MARKER}${JSON.stringify(eventIds)}-->`;
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

async function removeCallbackOutlookForClient(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const metadata = ((client.metadataJson ?? {}) as any) || {};
  const callback = (metadata.callback ?? {}) as any;
  const eventIds = callback.outlookEventIds as OutlookEventIds | undefined;

  if (!eventIds?.mike && !eventIds?.steven) return;

  await deleteOutlookCallbackEvents(eventIds);

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
}

router.get('/open', async (_req, res) => {
  const tasks = await prisma.task.findMany({
    where: { status: 'OPEN' },
    include: { client: true },
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

  let task = await prisma.task.create({
    data: {
      clientId,
      title: title.trim(),
      description: sanitiseDescription(description),
      dueAt: dueAtDate,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      outcome: null,
    },
  });

  if (dueAtDate && !isCallbackTaskTitle(task.title)) {
    const eventIds = await upsertOutlookTaskEvents({
      client,
      title: task.title,
      description: task.description,
      dueAt: dueAtDate,
    });

    if (eventIds) {
      task = await prisma.task.update({
        where: { id: task.id },
        data: { description: writeOutlookEventIds(task.description, eventIds) },
      });
    }
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

  const shouldCloseTask =
    nextStatus === 'DONE' && ['COMPLETED', 'NO_ANSWER', 'RESCHEDULED', 'CANCELLED'].includes(nextOutcome || '');

  let descriptionToStore: string | null = cleanIncomingDescription;

  if (client && existing.clientId && isCallbackTaskTitle(existing.title)) {
    if (shouldCloseTask && ['NO_ANSWER', 'CANCELLED', 'COMPLETED'].includes(nextOutcome || '')) {
      await removeCallbackOutlookForClient(existing.clientId);
    } else if (nextStatus === 'OPEN' && nextDueAtDate) {
      const metadata = ((client.metadataJson ?? {}) as any) || {};
      const callback = (metadata.callback ?? {}) as any;
      const londonParts = londonPartsFromDate(nextDueAtDate);
      const eventIds = await upsertOutlookCallbackEvents({
        client,
        callbackDate: londonParts.date,
        callbackTime: londonParts.time,
        notes: cleanIncomingDescription || undefined,
        existingEventIds: callback.outlookEventIds,
      });

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            callback: {
              ...callback,
              date: londonParts.date,
              time: londonParts.time,
              notes: cleanIncomingDescription || '',
              outlookEventIds: eventIds ?? callback.outlookEventIds ?? {},
            },
          },
        },
      });
    }
  } else if (client) {
    const existingEventIds = readOutlookEventIds(existing.description);

    if (shouldCloseTask) {
      await deleteOutlookTaskEvents(existingEventIds);
      descriptionToStore = cleanIncomingDescription;
    } else if (nextStatus === 'OPEN' && nextDueAtDate) {
      const eventIds = await upsertOutlookTaskEvents({
        client,
        title: nextTitle,
        description: cleanIncomingDescription,
        dueAt: nextDueAtDate,
        existingEventIds,
      });
      descriptionToStore = writeOutlookEventIds(cleanIncomingDescription, eventIds ?? existingEventIds);
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: title !== undefined ? nextTitle : undefined,
      description: descriptionToStore,
      dueAt: dueAt !== undefined ? nextDueAtDate : undefined,
      priority: priority ?? undefined,
      status: nextStatus,
      outcome: nextOutcome,
    },
  });

  res.json(serialiseTask(task));
});

export default router;
