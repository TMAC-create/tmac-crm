import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET tasks for a client
router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;

  const tasks = await prisma.task.findMany({
    where: { clientId },
    orderBy: { dueAt: 'asc' },
  });

  res.json(tasks);
});

// CREATE task
router.post('/', async (req, res) => {
  const { clientId, title, description, dueAt } = req.body;

  const task = await prisma.task.create({
    data: {
      clientId,
      title,
      description,
      dueAt: dueAt ? new Date(dueAt) : null,
    },
  });

  res.json(task);
});

// UPDATE task status
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, outcome } = req.body;

  const task = await prisma.task.update({
    where: { id },
    data: {
      status,
      outcome,
    },
  });

  res.json(task);
});

export default router;
