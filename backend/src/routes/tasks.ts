import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteOutlookCallbackEvents,
  deleteOutlookTaskEvents,
  upsertOutlookCallbackEvents,
  upsertOutlookTaskEvents,
  londonPartsFromDate,
} from '../services/outlook.js';

const router = Router();

router.use(requireAuth);

function isCallbackTaskTitle(title: string): boolean {
  return title === 'Client callback booked' || title === 'Chase documents before callback';
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

  const task = await prisma.task.create({
    data: {
      clientId,
      title,
      description: description || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
    },
  });

  if (task.clientId && task.dueAt) {
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

  const existingTask = await prisma.task.findUnique({
    where: { id },
  });

  if (!existingTask) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: status ?? undefined,
      outcome: outcome ?? undefined,
      dueAt: dueAt ? new Date(dueAt) : dueAt === null ? null : undefined,
      description: description ?? undefined,
      priority: priority ?? undefined,
      title: title ?? undefined,
    },
  });

  if (task.clientId) {
    const client = await prisma.client.findUnique({ where: { id: task.clientId } });

    if (client) {
      const metadata = (client.metadataJson ?? {}) as any;
      const callbackMeta = (metadata.callback ?? {}) as any;
      const manualTaskEvents = (metadata.manualTaskEvents ?? {}) as Record<string, any>;

      if (isCallbackTaskTitle(task.title)) {
        const existingEventIds = callbackMeta.outlookEventIds;

        const shouldDeleteCallbackEvents =
          task.status === 'DONE' &&
          (task.outcome === 'NO_ANSWER' || task.outcome === 'CANCELLED');

        if (shouldDeleteCallbackEvents && existingEventIds) {
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
        } else if (task.status === 'OPEN' && task.dueAt && task.title === 'Client callback booked') {
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
      } else {
        const existingEventIds = manualTaskEvents[task.id] ?? {};

        const shouldDeleteManualEvents =
          (task.status === 'DONE' && task.outcome === 'COMPLETED') ||
          (task.status === 'DONE' && task.outcome === 'CANCELLED') ||
          (task.status === 'DONE' && task.outcome === 'NO_ANSWER');

        if (shouldDeleteManualEvents && (existingEventIds.mike || existingEventIds.steven)) {
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
        }
      }
    }
  }

  res.json(task);
});

export default router;
