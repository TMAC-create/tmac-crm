import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { normaliseUkMobile, sendEsendexSms } from '../services/esendex.js';

export const messagesRouter = Router();

const sendSmsSchema = z.object({
  clientId: z.string().min(1),
  templateId: z.string().optional(),
  body: z.string().min(1),
});

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractInboundPayload(payload: any) {
  const candidates = Array.isArray(payload?.messages)
    ? payload.messages
    : Array.isArray(payload?.Messages)
      ? payload.Messages
      : Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(payload?.Events)
          ? payload.Events
          : Array.isArray(payload)
            ? payload
            : [payload];

  return candidates
    .map((item: any) => {
      const message = item?.Message || item?.message || item?.data?.Message || item?.data?.message || item;
      const fromNumber = firstString(
        message?.Originator,
        message?.originator,
        message?.From,
        message?.from,
        message?.from?.msisdn,
        message?.from?.phoneNumber,
        message?.Sender,
        message?.sender,
        message?.Msisdn,
        message?.msisdn,
        item?.Originator,
        item?.originator,
        item?.from?.msisdn,
        item?.from
      );
      const toNumber = firstString(
        message?.Address,
        message?.address,
        message?.To,
        message?.to,
        message?.to?.msisdn,
        message?.recipient?.msisdn,
        item?.to?.msisdn,
        item?.to
      );
      const body = firstString(
        message?.Body,
        message?.body,
        message?.body?.text,
        message?.Content,
        message?.content,
        message?.content?.text,
        message?.Text,
        message?.text,
        message?.MessageText,
        message?.messageText,
        item?.Body,
        item?.body?.text,
        item?.body,
        item?.text
      );
      const providerMessageId = firstString(message?.MessageId, message?.messageId, message?.id, message?.gatewayId, item?.MessageId, item?.messageId, item?.id);
      const providerRequestId = firstString(message?.MostRecentOutboundRequestId, message?.mostRecentOutboundRequestId, message?.RequestId, message?.requestId);
      const receivedAt = firstString(message?.OccurredAtTime, message?.occurredAtTime, message?.receivedAt, message?.createdAt, message?.sentAt, item?.OccurredAtTime, item?.receivedAt, item?.createdAt);

      return { fromNumber, toNumber, body, providerMessageId, providerRequestId, receivedAt, raw: item };
    })
    .filter((item: { fromNumber?: string; body?: string }) => item.fromNumber && item.body);
}

function mobileMatchTokens(rawMobile: string | null | undefined) {
  const normalised = normaliseUkMobile(rawMobile || '');
  const digits = normalised.replace(/\D/g, '');
  const without44 = digits.startsWith('44') ? digits.slice(2) : digits;
  const local = without44 ? `0${without44}` : '';
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return { normalised, digits, without44, local, last10 };
}

function mobilesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = mobileMatchTokens(left);
  const b = mobileMatchTokens(right);
  if (!a.digits || !b.digits) return false;
  if (a.normalised && b.normalised && a.normalised === b.normalised) return true;
  if (a.digits === b.digits) return true;
  if (a.local && b.local && a.local === b.local) return true;
  return Boolean(a.last10 && b.last10 && a.last10 === b.last10);
}

async function findClientByMobile(rawMobile: string) {
  const clients = await prisma.client.findMany({
    where: { mobile: { not: null } },
    select: { id: true, mobile: true, firstName: true, lastName: true },
  });

  return clients.find((client) => mobilesMatch(client.mobile, rawMobile)) || null;
}

async function findClientFromRecentOutbound(inbound: { providerRequestId?: string; providerMessageId?: string; fromNumber?: string }) {
  const orFilters = [
    inbound.providerRequestId ? { providerRequestId: inbound.providerRequestId } : null,
    inbound.providerMessageId ? { providerMessageId: inbound.providerMessageId } : null,
  ].filter(Boolean) as Array<{ providerRequestId?: string; providerMessageId?: string }>;

  if (orFilters.length === 0) return null;

  const outbound = await prisma.smsMessage.findFirst({
    where: { direction: 'OUTBOUND', clientId: { not: null }, OR: orFilters },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { id: true, mobile: true, firstName: true, lastName: true } } },
  });

  return outbound?.client || null;
}

messagesRouter.post('/esendex/webhook', async (req, res) => {
  const inboundMessages = extractInboundPayload(req.body);

  console.log('Esendex inbound webhook received', {
    count: inboundMessages.length,
    body: req.body,
  });

  for (const inbound of inboundMessages) {
    const client = (await findClientByMobile(inbound.fromNumber)) || (await findClientFromRecentOutbound(inbound));

    if (inbound.providerMessageId) {
      const existing = await prisma.smsMessage.findFirst({
        where: { provider: 'ESENDEX', providerMessageId: inbound.providerMessageId, direction: 'INBOUND' },
      });
      if (existing) continue;
    }


    if (!client) {
      await prisma.smsMessage.create({
        data: {
          direction: 'INBOUND',
          fromNumber: normaliseUkMobile(inbound.fromNumber),
          toNumber: inbound.toNumber ? normaliseUkMobile(inbound.toNumber) : null,
          body: inbound.body,
          status: 'UNMATCHED',
          provider: 'ESENDEX',
          providerMessageId: inbound.providerMessageId || null,
          providerRequestId: inbound.providerRequestId || null,
          responseJson: inbound.raw as any,
          receivedAt: inbound.receivedAt ? new Date(inbound.receivedAt) : new Date(),
        },
      });
      continue;
    }

    const smsMessage = await prisma.smsMessage.create({
      data: {
        clientId: client.id,
        direction: 'INBOUND',
        fromNumber: normaliseUkMobile(inbound.fromNumber),
        toNumber: inbound.toNumber ? normaliseUkMobile(inbound.toNumber) : null,
        body: inbound.body,
        status: 'RECEIVED',
        provider: 'ESENDEX',
        providerMessageId: inbound.providerMessageId || null,
        providerRequestId: inbound.providerRequestId || null,
        responseJson: inbound.raw as any,
        receivedAt: inbound.receivedAt ? new Date(inbound.receivedAt) : new Date(),
      },
    });

    await prisma.activity.create({
      data: {
        clientId: client.id,
        type: 'sms_received',
        description: `SMS reply received from ${normaliseUkMobile(inbound.fromNumber)}.`,
        payloadJson: {
          smsMessageId: smsMessage.id,
          providerMessageId: inbound.providerMessageId || null,
        },
      },
    });

    await prisma.note.create({
      data: {
        clientId: client.id,
        body: `SMS received from ${normaliseUkMobile(inbound.fromNumber)}:\n\n${inbound.body}`,
        sourceType: 'sms',
      },
    });
  }

  res.status(200).json({ received: true, count: inboundMessages.length });
});

messagesRouter.use(requireAuth);

messagesRouter.get('/unread-count', async (_req, res) => {
  const count = await prisma.smsMessage.count({
    where: {
      direction: 'INBOUND',
      readAt: null,
      clientId: { not: null },
    },
  });

  res.json({ count });
});

messagesRouter.get('/overview', async (_req, res) => {
  const messages = await prisma.smsMessage.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: {
      client: {
        select: { id: true, reference: true, firstName: true, lastName: true, mobile: true },
      },
    },
  });

  res.json(messages);
});


messagesRouter.patch('/:messageId/assign-client', async (req, res) => {
  const parsed = z.object({ clientId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Client ID is required.' });

  const message = await prisma.smsMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message) return res.status(404).json({ message: 'SMS message not found.' });

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client) return res.status(404).json({ message: 'Client not found.' });

  const fromNumber = message.fromNumber;
  const toNumber = message.toNumber;

  await prisma.smsMessage.updateMany({
    where: {
      clientId: null,
      OR: [
        fromNumber ? { fromNumber } : undefined,
        toNumber ? { toNumber } : undefined,
        { id: message.id },
      ].filter(Boolean) as any,
    },
    data: { clientId: client.id, status: 'RECEIVED' },
  });

  await prisma.activity.create({
    data: {
      clientId: client.id,
      type: 'sms_assigned',
      description: `Unmatched SMS thread assigned to ${client.firstName} ${client.lastName}.`,
      payloadJson: { smsMessageId: message.id, fromNumber: message.fromNumber },
    },
  });

  res.json({ message: 'SMS thread assigned to client.' });
});

messagesRouter.patch('/unmatched/:messageId/archive', async (req, res) => {
  const message = await prisma.smsMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message) return res.status(404).json({ message: 'SMS message not found.' });

  await prisma.smsMessage.updateMany({
    where: {
      clientId: null,
      OR: [
        message.fromNumber ? { fromNumber: message.fromNumber } : undefined,
        message.toNumber ? { toNumber: message.toNumber } : undefined,
        { id: message.id },
      ].filter(Boolean) as any,
    },
    data: { status: 'ARCHIVED', readAt: new Date() },
  });

  res.json({ message: 'Unmatched SMS thread archived.' });
});

messagesRouter.post('/unmatched/:messageId/reply', async (req, res) => {
  const parsed = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Reply body is required.' });

  const source = await prisma.smsMessage.findUnique({ where: { id: req.params.messageId } });
  if (!source) return res.status(404).json({ message: 'SMS message not found.' });

  const toNumber = source.fromNumber || source.toNumber;
  if (!toNumber) return res.status(400).json({ message: 'No phone number is available for this unmatched SMS.' });

  let sendResult: Awaited<ReturnType<typeof sendEsendexSms>>;
  try {
    sendResult = await sendEsendexSms({ to: toNumber, body: parsed.data.body });
  } catch (error) {
    const err = error as Error & { status?: number; details?: unknown };
    return res.status(err.status || 502).json({ message: err.message || 'Could not send SMS through Esendex.', details: err.details });
  }

  const smsMessage = await prisma.smsMessage.create({
    data: {
      direction: 'OUTBOUND',
      toNumber: normaliseUkMobile(toNumber),
      fromName: process.env.ESENDEX_SENDER_NAME || 'TMAC',
      body: parsed.data.body,
      status: 'SUBMITTED',
      provider: 'ESENDEX',
      providerMessageId: sendResult.gatewayId || null,
      providerRequestId: sendResult.requestId || null,
      responseJson: sendResult.raw as any,
    },
  });

  res.status(201).json({ message: 'Reply sent to unmatched number.', smsMessage });
});

messagesRouter.get('/client/:clientId', async (req, res) => {
  const messages = await prisma.smsMessage.findMany({
    where: { clientId: req.params.clientId },
    orderBy: { createdAt: 'asc' },
  });

  res.json(messages);
});

messagesRouter.patch('/client/:clientId/read', async (req, res) => {
  await prisma.smsMessage.updateMany({
    where: {
      clientId: req.params.clientId,
      direction: 'INBOUND',
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  res.json({ message: 'SMS messages marked as read.' });
});

messagesRouter.post('/sms', async (req, res) => {
  const parsed = sendSmsSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid SMS payload.',
      issues: parsed.error.flatten(),
    });
  }

  const client = await prisma.client.findUnique({
    where: { id: parsed.data.clientId },
  });

  if (!client) return res.status(404).json({ message: 'Client not found.' });
  if (!client.mobile) return res.status(400).json({ message: 'Client does not have a mobile number.' });

  const toNumber = normaliseUkMobile(client.mobile);
  let sendResult: Awaited<ReturnType<typeof sendEsendexSms>>;

  try {
    sendResult = await sendEsendexSms({
      to: client.mobile,
      body: parsed.data.body,
      clientId: client.id,
      templateId: parsed.data.templateId,
    });
  } catch (error) {
    const err = error as Error & { status?: number; details?: unknown };

    console.error('SMS SEND FAILED', {
      clientId: client.id,
      clientName: `${client.firstName} ${client.lastName}`,
      crmMobile: client.mobile,
      normalisedMobile: toNumber,
      status: err.status,
      message: err.message,
      details: err.details,
    });

    await prisma.smsMessage.create({
      data: {
        clientId: client.id,
        templateId: parsed.data.templateId || null,
        direction: 'OUTBOUND',
        toNumber,
        fromName: process.env.ESENDEX_SENDER_NAME || 'TMAC',
        body: parsed.data.body,
        status: 'FAILED',
        provider: 'ESENDEX',
        errorJson: (err.details || { message: err.message }) as any,
      },
    });

    return res.status(err.status || 502).json({
      message: err.message || 'Could not send SMS through Esendex.',
      details: err.details,
    });
  }

  const smsMessage = await prisma.smsMessage.create({
    data: {
      clientId: client.id,
      templateId: parsed.data.templateId || null,
      direction: 'OUTBOUND',
      toNumber,
      fromName: process.env.ESENDEX_SENDER_NAME || 'TMAC',
      body: parsed.data.body,
      status: 'SUBMITTED',
      provider: 'ESENDEX',
      providerMessageId: sendResult.gatewayId || null,
      providerRequestId: sendResult.requestId || null,
      responseJson: sendResult.raw as any,
    },
  });

  await prisma.activity.create({
    data: {
      clientId: client.id,
      type: 'sms_sent',
      description: `SMS sent to ${toNumber}.`,
      payloadJson: {
        smsMessageId: smsMessage.id,
        templateId: parsed.data.templateId || null,
        providerMessageId: sendResult.gatewayId || null,
      },
    },
  });

  await prisma.note.create({
    data: {
      clientId: client.id,
      body: `SMS sent to ${toNumber}:\n\n${parsed.data.body}`,
      sourceType: 'sms',
    },
  });

  res.status(201).json({
    message: 'SMS sent successfully.',
    smsMessage,
  });
});
