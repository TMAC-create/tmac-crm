import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteOutlookCallbackEvents,
  londonPartsFromDate,
  upsertOutlookCallbackEvents,
} from '../services/outlook.js';

const router = Router();

router.use(requireAuth);

function isCallbackTaskTitle(title: string): boolean {
  return title === 'Client callback booked';
}

// GET tasks for a client
router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;

  const tasks = await prisma.task.findMany({
    where: { clientId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  res.json(tasks);
});

// CREATE task
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

  res.status(201).json(task);
});

// UPDATE task
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

  if (task.clientId && isCallbackTaskTitle(task.title)) {
    const client = await prisma.client.findUnique({
      where: { id: task.clientId },
    });

    if (client) {
      const metadata = (client.metadataJson ?? {}) as any;
      const callbackMeta = (metadata.callback ?? {}) as any;
      const existingEventIds = callbackMeta.outlookEventIds;

      const shouldDeleteEvent =
        (task.status === 'DONE' && task.outcome === 'NO_ANSWER') ||
        (task.status === 'DONE' && task.outcome === 'CANCELLED') ||
        task.status === 'CANCELLED';

      if (shouldDeleteEvent && existingEventIds) {
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
        const londonParts = londonPartsFromDate(task.dueAt);
        const eventIds = await upsertOutlookCallbackEvents({
          client,
          callbackDate: londonParts.date,
          callbackTime: londonParts.time,
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
                date: londonParts.date,
                time: londonParts.time,
                notes: task.description ?? callbackMeta.notes ?? '',
                outlookEventIds: eventIds ?? {},
              },
            },
          },
        });
      }
    }
  }
  
  res.json(task);
});

export default router;
