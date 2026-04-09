import { Router } from 'express';
import { ClientStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const clientsRouter = Router();

const clientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  mobile: z.string().optional(),
  source: z.string().optional(),
  campaign: z.string().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
});

const noteSchema = z.object({
  body: z.string().min(1).max(5000),
});

clientsRouter.use(requireAuth);

clientsRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();

  const clients = await prisma.client.findMany({
    where: {
      ...(status ? { status: status as ClientStatus } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { mobile: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { assignedUser: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(clients);
});

clientsRouter.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      assignedUser: true,
      notes: { orderBy: { createdAt: 'desc' }, include: { user: true } },
      tasks: { orderBy: { createdAt: 'desc' }, include: { assignedUser: true } },
      activities: { orderBy: { createdAt: 'desc' }, include: { actorUser: true } },
    },
  });

  if (!client) return res.status(404).json({ message: 'Client not found.' });
  res.json(client);
});

clientsRouter.post('/', async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid client payload.', issues: parsed.error.flatten() });
  }

  const email = parsed.data.email || null;
  if (email) {
    const duplicate = await prisma.client.findFirst({ where: { email } });
    if (duplicate) return res.status(409).json({ message: 'A client with this email already exists.' });
  }

  const client = await prisma.client.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email,
      mobile: parsed.data.mobile,
      source: parsed.data.source,
      campaign: parsed.data.campaign,
      status: parsed.data.status || ClientStatus.NEW_LEAD,
      assignedUserId: req.user?.userId,
    },
  });

  await prisma.activity.create({
    data: {
      clientId: client.id,
      actorUserId: req.user?.userId,
      type: 'client_created',
      description: `Client ${client.firstName} ${client.lastName} created.`,
    },
  });

  res.status(201).json(client);
});

clientsRouter.post('/:id/notes', async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid note.' });

  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: 'Client not found.' });

  const note = await prisma.note.create({
    data: {
      clientId: req.params.id,
      userId: req.user?.userId,
      body: parsed.data.body,
      sourceType: 'internal',
    },
  });

  await prisma.activity.create({
    data: {
      clientId: req.params.id,
      actorUserId: req.user?.userId,
      type: 'note_added',
      description: 'A note was added to the client.',
      payloadJson: { noteId: note.id },
    },
  });

  res.status(201).json(note);
});
