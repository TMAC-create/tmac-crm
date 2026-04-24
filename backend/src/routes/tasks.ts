import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteOutlookCallbackEvents,
  deleteOutlookTaskEvents,
  londonPartsFromDate,
  upsertOutlookCallbackEvents,
  upsertOutlookTaskEvents,
} from '../services/outlook.js';

const router = Router();

router.use(requireAuth);

const CALLBACK_TASK_TITLE = 'Client callback booked';
const CHASE_DOCS_TASK_TITLE = 'Chase documents before callback';

function isCallbackAppointmentTask(title: string): boolean {
  return title === CALLBACK_TASK_TITLE;
}

function isSystemTaskWithoutOwnCalendarEvent(title: string): boolean {
  return title === CHASE_DOCS_TASK_TITLE;
}

function shouldDeleteOutlookEvent(status?: string, outcome?: string | null): boolean {
  return (
    status === 'DONE' &&
    (outcome === 'COMPLETED' || outcome === 'CANCELLED' || outcome === 'NO_ANSWER')
  );
}

router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;

  const tasks = await prisma.task.findMany({
    where: { clientId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(tasks);
});

router.post('/', async (req, res) => {
  const { clientId, title, description, dueAt, priority } = req.body;

  if (!clientId || !title) {
    return res.status(400).json({ message: 'clientId and title are required.' });
  }

  const task = await prisma.task.create({
    data: {
      clientId,
      title,
      description: description || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      outcome: null,
    },
  });

  if (task.clientId && task.dueAt && !isSystemTaskWithoutOwnCalendarEvent(task.title)) {
    const client = await prisma.client.findUnique({ where: { id: task.clientId } });

    if (client) {
      const metadata = (client.metadataJson ?? {}) as any;
      const manualTaskEvents = (metadata.manualTaskEvents ?? {}) as Record<string, any>;

      const eventIds = await upsertOutlookTaskEvents({
        client,
        task,
        existingEventIds: manualTaskEvents[task.id] ?? {},
      });

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            manualTaskEvents: {
              ...manualTaskEvents,
              [task.id]: eventIds ?? {},
            },
          },
        },
      });
    }
  }

  res.status(201).json(task);
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, outcome, dueAt, description, priority, title } = req.body;

  const existingTask = await prisma.task.findUnique({ where: { id } });

  if (!existingTask) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: status ?? undefined,
      outcome: outcome === null ? null : outcome ?? undefined,
      dueAt: dueAt ? new Date(dueAt) : dueAt === null ? null : undefined,
      description: description === null ? null : description ?? undefined,
      priority: priority ?? undefined,
      title: title ?? undefined,
    },
  });

  if (!task.clientId) {
    return res.json(task);
  }

  const client = await prisma.client.findUnique({ where: { id: task.clientId } });

  if (!client) {
    return res.json(task);
  }

  const metadata = (client.metadataJson ?? {}) as any;
  const callbackMeta = (metadata.callback ?? {}) as any;
  const manualTaskEvents = (metadata.manualTaskEvents ?? {}) as Record<string, any>;

  if (isCallbackAppointmentTask(task.title)) {
    const existingEventIds = callbackMeta.outlookEventIds;

    if (shouldDeleteOutlookEvent(task.status, task.outcome) && existingEventIds) {
      await deleteOutlookCallbackEvents(existingEventIds);

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            callback: {
              ...callbackMeta,
              outlookEventIds: {},
            },
          },
        },
      });
    } else if (task.status === 'OPEN' && task.dueAt) {
      const london = londonPartsFromDate(task.dueAt);
      const eventIds = await upsertOutlookCallbackEvents({
        client,
        callbackDate: london.date,
        callbackTime: london.time,
        notes: task.description ?? undefined,
        existingEventIds,
      });

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            callback: {
              ...callbackMeta,
              date: london.date,
              time: london.time,
              notes: task.description ?? callbackMeta.notes ?? '',
              outlookEventIds: eventIds ?? {},
            },
          },
        },
      });
    }
  } else if (!isSystemTaskWithoutOwnCalendarEvent(task.title)) {
    const existingEventIds = manualTaskEvents[task.id] ?? {};

    if (shouldDeleteOutlookEvent(task.status, task.outcome)) {
      await deleteOutlookTaskEvents(existingEventIds);

      const nextManualTaskEvents = { ...manualTaskEvents };
      delete nextManualTaskEvents[task.id];

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            manualTaskEvents: nextManualTaskEvents,
          },
        },
      });
    } else if (task.status === 'OPEN' && task.dueAt) {
      const eventIds = await upsertOutlookTaskEvents({
        client,
        task,
        existingEventIds,
      });

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            manualTaskEvents: {
              ...manualTaskEvents,
              [task.id]: eventIds ?? {},
            },
          },
        },
      });
    } else if (!task.dueAt && (existingEventIds.mike || existingEventIds.steven)) {
      await deleteOutlookTaskEvents(existingEventIds);

      const nextManualTaskEvents = { ...manualTaskEvents };
      delete nextManualTaskEvents[task.id];

      await prisma.client.update({
        where: { id: client.id },
        data: {
          metadataJson: {
            ...metadata,
            manualTaskEvents: nextManualTaskEvents,
          },
        },
      });
    }
  }

  res.json(task);
});

export default router;
