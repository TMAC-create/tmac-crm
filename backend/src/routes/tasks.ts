import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

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

  res.json(task);
});

export default router;
