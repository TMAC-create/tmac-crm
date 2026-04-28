import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import type { OutlookEventIds } from '../services/outlook.js';
import {
  deleteOutlookCallbackEvents,
  londonLocalToUtcDate,
  upsertOutlookCallbackEvents,
} from '../services/outlook.js';

export const clientsRouter = Router();

const statusEnum = z.enum([
  'NEW_LEAD',
  'CONTACT_ATTEMPTED',
  'CALL_BACK',
  'QUALIFIED',
  'DOCS_REQUESTED',
  'DOCS_RECEIVED',
  'SUBMITTED',
  'APPROVED',
  'COMPLETED',
  'LOST',
]);

const debtItemSchema = z.object({
  id: z.string(),
  creditorName: z.string(),
  referenceNumber: z.string().optional().or(z.literal('')),
  debtType: z.string(),
  classification: z.enum(['SECURED', 'UNSECURED']),
  balance: z.string().optional().or(z.literal('')),
  monthlyPayment: z.string().optional().or(z.literal('')),
});

const loanSchema = z.object({
  initialLoanAmount: z.string().optional().or(z.literal('')),
  furtherAdvance: z.string().optional().or(z.literal('')),
  propertyValue: z.string().optional().or(z.literal('')),
  includeHirePurchase: z.enum(['yes', 'no']).optional(),
  includeSecuredLoans: z.enum(['yes', 'no']).optional(),
  notes: z.string().optional().or(z.literal('')),
});

const callbackSchema = z
  .object({
    date: z.string().optional(),
    time: z.string().optional(),
    notes: z.string().optional(),
    outlookEventIds: z
      .object({
        mike: z.string().optional(),
        steven: z.string().optional(),
      })
      .optional(),
  })
  .optional();

const metadataSchema = z
  .object({
    income: z.record(z.string(), z.any()).optional(),
    expenditure: z.record(z.string(), z.any()).optional(),
    debts: z.array(debtItemSchema).optional(),
    loan: loanSchema.optional(),
    callback: callbackSchema,
    manualTaskEvents: z.record(z.string(), z.any()).optional(),
  })
  .optional();

const clientSchema = z.object({
  title: z.string().optional(),
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
  clientSalary: z.string().optional(),
  propertyValue: z.string().optional(),
  metadataJson: metadataSchema,
});

const updateClientSchema = clientSchema.partial();

const noteSchema = z.object({
  body: z.string().min(1),
});

type CallbackMeta = {
  date?: string;
  time?: string;
  notes?: string;
  outlookEventIds?: OutlookEventIds;
};

function fallbackCallbackDate(): { date: string; time: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: '10:00' };
}

function buildCallbackDueAt(date?: string, time?: string): Date {
  if (date && time) {
    const londonDate = londonLocalToUtcDate(date, time);
    if (londonDate) return londonDate;
  }

  const fallback = fallbackCallbackDate();
  return londonLocalToUtcDate(fallback.date, fallback.time) ?? new Date();
}

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

  const data = parsed.data;

  const clientsWithReference = await prisma.client.findMany({
    where: { reference: { not: null } },
    orderBy: { reference: 'desc' },
    take: 1,
  });

  const nextReference =
    clientsWithReference.length > 0 && clientsWithReference[0].reference
      ? clientsWithReference[0].reference + 1
      : 1000;

  const client = await prisma.client.create({
    data: {
      reference: nextReference,
      title: data.title || null,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      mobile: data.mobile || null,
      dob: data.dob ? new Date(data.dob) : null,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      city: data.city || null,
      county: data.county || null,
      postcode: data.postcode || null,
      source: data.source || null,
      campaign: data.campaign || null,
      status: data.status || 'NEW_LEAD',
      clientSalary: data.clientSalary || null,
      propertyValue: data.propertyValue || null,
      metadataJson: data.metadataJson || {},
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

  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  const existingMetadata = ((existing.metadataJson ?? {}) as any) || {};
  const incomingMetadata = parsed.data.metadataJson;
  const mergedMetadata = incomingMetadata
    ? {
        ...existingMetadata,
        ...incomingMetadata,
        callback: {
          ...(existingMetadata.callback ?? {}),
          ...(incomingMetadata.callback ?? {}),
        },
      }
    : existingMetadata;

  let updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      title: parsed.data.title ?? undefined,
      firstName: parsed.data.firstName ?? undefined,
      lastName: parsed.data.lastName ?? undefined,
      email: parsed.data.email ?? undefined,
      mobile: parsed.data.mobile ?? undefined,
      dob: parsed.data.dob ? new Date(parsed.data.dob) : undefined,
      addressLine1: parsed.data.addressLine1 ?? undefined,
      addressLine2: parsed.data.addressLine2 ?? undefined,
      city: parsed.data.city ?? undefined,
      county: parsed.data.county ?? undefined,
      postcode: parsed.data.postcode ?? undefined,
      source: parsed.data.source ?? undefined,
      campaign: parsed.data.campaign ?? undefined,
      status: parsed.data.status ?? undefined,
      clientSalary: parsed.data.clientSalary ?? undefined,
      propertyValue: parsed.data.propertyValue ?? undefined,
      metadataJson: incomingMetadata ? mergedMetadata : undefined,
    },
  });

  if (parsed.data.status === 'CALL_BACK') {
    const callbackMeta = ((mergedMetadata.callback ?? {}) as CallbackMeta) || {};
    const fallback = fallbackCallbackDate();
    const callbackDate = callbackMeta.date || fallback.date;
    const callbackTime = callbackMeta.time || fallback.time;
    const callbackNotes = callbackMeta.notes || '';
    const callbackDueAt = buildCallbackDueAt(callbackDate, callbackTime);

    const eventIds = await upsertOutlookCallbackEvents({
      client: updated,
      callbackDate,
      callbackTime,
      notes: callbackNotes,
      existingEventIds: callbackMeta.outlookEventIds,
    });

    const metadataWithCallback = {
      ...mergedMetadata,
      callback: {
        ...callbackMeta,
        date: callbackDate,
        time: callbackTime,
        notes: callbackNotes,
        outlookEventIds: eventIds ?? callbackMeta.outlookEventIds ?? {},
      },
    };

    updated = await prisma.client.update({
      where: { id: updated.id },
      data: { metadataJson: metadataWithCallback },
    });

    const existingOpenCallbackTasks = await prisma.task.findMany({
      where: {
        clientId: req.params.id,
        status: 'OPEN',
        title: { in: ['Client callback booked', 'Chase documents before callback'] },
      },
    });

    const callbackTask = existingOpenCallbackTasks.find((task) => task.title === 'Client callback booked');
    const chaseDocsTask = existingOpenCallbackTasks.find((task) => task.title === 'Chase documents before callback');

    if (callbackTask) {
      await prisma.task.update({
        where: { id: callbackTask.id },
        data: {
          dueAt: callbackDueAt,
          description: callbackNotes || 'Call client back at the scheduled appointment time.',
          priority: 'HIGH',
        },
      });
    } else {
      await prisma.task.create({
        data: {
          clientId: req.params.id,
          title: 'Client callback booked',
          description: callbackNotes || 'Call client back at the scheduled appointment time.',
          dueAt: callbackDueAt,
          status: 'OPEN',
          priority: 'HIGH',
        },
      });
    }

    if (chaseDocsTask) {
      await prisma.task.update({
        where: { id: chaseDocsTask.id },
        data: {
          dueAt: callbackDueAt,
          description: 'Check outstanding documents before the callback appointment.',
          priority: 'MEDIUM',
        },
      });
    } else {
      await prisma.task.create({
        data: {
          clientId: req.params.id,
          title: 'Chase documents before callback',
          description: 'Check outstanding documents before the callback appointment.',
          dueAt: callbackDueAt,
          status: 'OPEN',
          priority: 'MEDIUM',
        },
      });
    }
  } else if (parsed.data.status && parsed.data.status !== 'CALL_BACK') {
    const callbackMeta = ((existingMetadata.callback ?? {}) as CallbackMeta) || {};
    if (callbackMeta.outlookEventIds?.mike || callbackMeta.outlookEventIds?.steven) {
      await deleteOutlookCallbackEvents(callbackMeta.outlookEventIds);
      await prisma.client.update({
        where: { id: updated.id },
        data: {
          metadataJson: {
            ...mergedMetadata,
            callback: {
              ...callbackMeta,
              ...(incomingMetadata?.callback ?? {}),
              outlookEventIds: {},
            },
          },
        },
      });
    }
  }

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

  const metadata = ((existing.metadataJson ?? {}) as any) || {};
  const callbackMeta = (metadata.callback ?? {}) as CallbackMeta;
  if (callbackMeta.outlookEventIds?.mike || callbackMeta.outlookEventIds?.steven) {
    await deleteOutlookCallbackEvents(callbackMeta.outlookEventIds);
  }

  await prisma.client.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Client deleted successfully.' });
});
