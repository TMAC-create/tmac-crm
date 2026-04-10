import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const clientsRouter = Router();

const statusEnum = z.enum([
  'NEW_LEAD',
  'CONTACT_ATTEMPTED',
  'QUALIFIED',
  'DOCS_REQUESTED',
  'DOCS_RECEIVED',
  'SUBMITTED',
  'APPROVED',
  'COMPLETED',
  'LOST',
]);

const clientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  mobile: z.string().optional(),
  dob: z.string().optional().or(z.literal('')),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  source: z.string().optional(),
  campaign: z.string().optional(),
  status: statusEnum.optional(),
});

const updateClientSchema = clientSchema;

const noteSchema = z.object({
  body: z.string().min(1),
});

clientsRouter.use(requireAuth);

clientsRouter.get('/', async (_req, res) => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    include: { assignedUser: true },
  });

  res.json(clients);
});

clientsRouter.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      assignedUser: true,
      notes: {
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      },
      tasks: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  res.json(client);
});

clientsRouter.post('/', async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid client payload.',
      issues: parsed.error.flatten(),
    });
  }

  const client = await prisma.client.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      dob: parsed.data.dob ? new Date(parsed.data.dob) : null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      county: parsed.data.county || null,
      postcode: parsed.data.postcode || null,
      source: parsed.data.source || null,
      campaign: parsed.data.campaign || null,
      status: parsed.data.status || 'NEW_LEAD',
    },
  });

  await prisma.activity.create({
    data: {
      clientId: client.id,
      type: 'client_created',
      description: `Client ${client.firstName} ${client.lastName} created.`,
    },
  });

  res.status(201).json(client);
});

clientsRouter.patch('/:id', async (req, res) => {
  const parsed = updateClientSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid client update payload.',
      issues: parsed.error.flatten(),
    });
  }

  const existing = await prisma.client.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      dob: parsed.data.dob ? new Date(parsed.data.dob) : null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      county: parsed.data.county || null,
      postcode: parsed.data.postcode || null,
      source: parsed.data.source || null,
      campaign: parsed.data.campaign || null,
      status: parsed.data.status || 'NEW_LEAD',
    },
  });

  await prisma.activity.create({
    data: {
      clientId: updated.id,
      type: 'client_updated',
      description: `Client ${updated.firstName} ${updated.lastName} updated.`,
    },
  });

  res.json(updated);
});

clientsRouter.post('/:id/notes', async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid note payload.',
      issues: parsed.error.flatten(),
    });
  }

  const existing = await prisma.client.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  const note = await prisma.note.create({
    data: {
      clientId: req.params.id,
      body: parsed.data.body,
      sourceType: 'internal',
    },
  });

  await prisma.activity.create({
    data: {
      clientId: req.params.id,
      type: 'note_added',
      description: 'A note was added to the client record.',
    },
  });

  res.status(201).json(note);
});

clientsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.client.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  await prisma.client.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Client deleted successfully.' });
});
