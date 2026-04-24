import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

const templateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['SMS', 'EMAIL']),
  subject: z.string().optional().or(z.literal('')),
  body: z.string().min(1),
  active: z.boolean().optional(),
});

templatesRouter.get('/', async (_req, res) => {
  const templates = await prisma.template.findMany({
    orderBy: [
      { type: 'asc' },
      { name: 'asc' },
    ],
  });

  res.json(templates);
});

templatesRouter.post('/', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid template payload.',
      issues: parsed.error.flatten(),
    });
  }

  const template = await prisma.template.create({
    data: {
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      subject: parsed.data.type === 'EMAIL' ? parsed.data.subject || null : null,
      body: parsed.data.body,
      active: parsed.data.active ?? true,
    },
  });

  res.status(201).json(template);
});

templatesRouter.put('/:id', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid template payload.',
      issues: parsed.error.flatten(),
    });
  }

  const existing = await prisma.template.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ message: 'Template not found.' });
  }

  const template = await prisma.template.update({
    where: { id: req.params.id },
    data: {
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      subject: parsed.data.type === 'EMAIL' ? parsed.data.subject || null : null,
      body: parsed.data.body,
      active: parsed.data.active ?? true,
    },
  });

  res.json(template);
});

templatesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.template.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ message: 'Template not found.' });
  }

  await prisma.template.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Template deleted successfully.' });
});
