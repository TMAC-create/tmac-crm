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
    : Array.isArray(payload?.events)
      ? payload.events
      : Array.isArray(payload)
        ? payload
        : [payload];

  return candidates
    .map((item: any) => {
      const message = item?.message || item;
      const fromNumber = firstString(
        message?.from?.msisdn,
        message?.from?.phoneNumber,
        message?.from?.address?.msisdn,
        message?.originator,
        message?.sender,
        message?.msisdn,
        item?.from?.msisdn,
        item?.from
      );
      const toNumber = firstString(
        message?.to?.msisdn,
        message?.to?.phoneNumber,
        message?.recipient?.msisdn,
        message?.accountReference,
        item?.to?.msisdn,
        item?.to
      );
      const body = firstString(
        message?.body?.text,
        message?.body,
        message?.content?.text,
        message?.content?.body,
        message?.text,
        message?.message,
        item?.body?.text,
        item?.body,
        item?.text
      );
      const providerMessageId = firstString(message?.id, message?.messageId, message?.gatewayId, item?.id);
      const receivedAt = firstString(message?.receivedAt, message?.createdAt, message?.sentAt, item?.receivedAt, item?.createdAt);

      return { fromNumber, toNumber, body, providerMessageId, receivedAt, raw: item };
    })
    .filter((item) => item.fromNumber && item.body);
}

async function findClientByMobile(rawMobile: string) {
  const normalised = normaliseUkMobile(rawMobile);
  const clients = await prisma.client.findMany({
    where: { mobile: { not: null } },
    select: { id: true, mobile: true, firstName: true, lastName: true },
  });

  return clients.find((client) => client.mobile && normaliseUkMobile(client.mobile) === normalised) || null;
}

messagesRouter.post('/esendex/webhook', async (req, res) => {
  const inboundMessages = extractInboundPayload(req.body);

  console.log('Esendex inbound webhook received', {
    count: inboundMessages.length,
    body: req.body,
  });

  for (const inbound of inboundMessages) {
    const client = await findClientByMobile(inbound.fromNumber);

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
