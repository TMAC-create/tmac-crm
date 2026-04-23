import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import type { OutlookEventIds } from '../services/outlook.js';
import { deleteOutlookTaskEvents, upsertOutlookTaskEvents } from '../services/outlook.js';

const router = Router();

router.use(requireAuth);

const OUTLOOK_MARKER = '\n\n<!--TMAC_OUTLOOK:';

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

function writeOutlookEventIds(
  description: string | null | undefined,
  eventIds?: OutlookEventIds | null,
): string | null {
  const clean = sanitiseDescription(description);

  if (!eventIds || (!eventIds.mike && !eventIds.steven)) {
    return clean;
  }

  return `${clean ?? ''}${OUTLOOK_MARKER}${JSON.stringify(eventIds)}-->`;
}

function serialiseTask<T extends { description?: string | null }>(task: T): T {
  return {
    ...task,
    description: sanitiseDescription(task.description),
  };
}

router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;

  const tasks = await prisma.task.findMany({
    where: { clientId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(tasks.map((task) => serialiseTask(task)));
});

router.post('/', async (req, res) => {
  const { clientId, title, description, dueAt, priority } = req.body as {
    clientId?: string;
    title?: string;
    description?: string;
    dueAt?: string | null;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  };

  if (!clientId || !title?.trim()) {
    return res.status(400).json({ message: 'clientId and title are required.' });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  let task = await prisma.task.create({
    data: {
      clientId,
      title: title.trim(),
      description: sanitiseDescription(description),
      dueAt: dueAt ? new Date(dueAt) : null,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
    },
  });

  if (dueAt) {
    const eventIds = await upsertOutlookTaskEvents({
      client,
      title: task.title,
      description: task.description,
      dueAt,
    });

    if (eventIds) {
      task = await prisma.task.update({
        where: { id: task.id },
        data: {
          description: writeOutlookEventIds(task.description, eventIds),
        },
      });
    }
  }

  res.status(201).json(serialiseTask(task));
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, dueAt, priority } = req.body as {
    title?: string;
    description?: string;
    dueAt?: string | null;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  };

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const client = existing.clientId
    ? await prisma.client.findUnique({ where: { id: existing.clientId } })
    : null;

  let descriptionWithMeta = existing.description ?? null;
  const existingEventIds = readOutlookEventIds(existing.description);

  if (dueAt && client) {
    const eventIds = await upsertOutlookTaskEvents({
      client,
      title: title?.trim() || existing.title,
      description: sanitiseDescription(description) ?? sanitiseDescription(existing.description),
      dueAt,
      existingEventIds,
    });
    descriptionWithMeta = writeOutlookEventIds(description, eventIds);
  } else {
    if (existingEventIds) {
      await deleteOutlookTaskEvents(existingEventIds);
    }
    descriptionWithMeta = sanitiseDescription(description);
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: title?.trim() || existing.title,
      description: descriptionWithMeta,
      dueAt: dueAt ? new Date(dueAt) : null,
      priority: priority || existing.priority,
    },
  });

  res.json(serialiseTask(task));
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, outcome } = req.body as {
    status?: 'OPEN' | 'DONE';
    outcome?: 'COMPLETED' | 'NO_ANSWER' | 'RESCHEDULED' | 'CANCELLED';
  };

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const eventIds = readOutlookEventIds(existing.description);
  const shouldDeleteCalendarEvent =
    status === 'DONE' &&
    ['COMPLETED', 'NO_ANSWER', 'RESCHEDULED', 'CANCELLED'].includes(outcome || '');

  if (shouldDeleteCalendarEvent && eventIds) {
    await deleteOutlookTaskEvents(eventIds);
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: status ?? existing.status,
      outcome: outcome ?? existing.outcome,
      description: shouldDeleteCalendarEvent
        ? sanitiseDescription(existing.description)
        : existing.description,
    },
  });

  res.json(serialiseTask(task));
});

export default router;
