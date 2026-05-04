import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { createEsendexWebhookSubscription, normaliseUkMobile, sendEsendexSms } from '../services/esendex.js';

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
      const eventType = firstString(item?.eventType, item?.type, item?.eventName);
      if (eventType && eventType !== 'sms-message-received') return null;

      const data = item?.data || item?.payload || item?.message || item;
      const message = data?.message || data;

      const fromNumber = firstString(
        message?.from?.msisdn,
        message?.from?.phoneNumber,
        message?.from?.address?.msisdn,
        message?.from?.number,
        message?.originator,
        message?.sender,
        message?.senderAddress,
        message?.msisdn,
        data?.from?.msisdn,
        data?.from?.phoneNumber,
        data?.from,
        item?.from?.msisdn,
        item?.from
      );

      const toNumber = firstString(
        message?.to?.msisdn,
        message?.to?.phoneNumber,
        message?.recipient?.msisdn,
        message?.recipient?.phoneNumber,
        message?.recipientAddress,
        message?.accountReference,
        data?.to?.msisdn,
        data?.to?.phoneNumber,
        data?.to,
        item?.to?.msisdn,
        item?.to
      );

      const body = firstString(
        message?.body?.text,
        message?.body?.value,
        message?.body,
        message?.content?.text,
        message?.content?.body,
        message?.text,
        message?.message,
        message?.messageBody,
        data?.body?.text,
        data?.body,
        data?.text,
        data?.message,
        item?.body?.text,
        item?.body,
        item?.text
      );

      const providerMessageId = firstString(
        message?.id,
        message?.messageId,
        message?.gatewayId,
        message?.reference,
        data?.id,
        data?.messageId,
        item?.id,
        item?.eventId
      );

      const receivedAt = firstString(
        message?.receivedAt,
        message?.createdAt,
        message?.sentAt,
        data?.receivedAt,
        data?.createdAt,
        item?.occurredAt,
        item?.createdAt,
        item?.timestamp
      );

      return { fromNumber, toNumber, body, providerMessageId, receivedAt, raw: item };
    })
    .filter(Boolean)
    .filter((item: { fromNumber?: string; body?: string }) => item.fromNumber && item.body);
}

async function findClientByMobile(rawMobile: string) {
  const normalised = normaliseUkMobile(rawMobile);
  const clients = await prisma.client.findMany({
    where: { mobile: { not: null } },
    select: { id: true, mobile: true, firstName: true, lastName: true },
  });

  return clients.find((client) => client.mobile && normaliseUkMobile(client.mobile) === normalised) || null;
}


function isWebhookSetupAuthorised(req: any) {
  const setupSecret = process.env.ESENDEX_WEBHOOK_SETUP_SECRET;

  if (!setupSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const suppliedSecret = firstString(
    req.query?.setupKey,
    req.headers?.['x-webhook-setup-secret'],
    req.body?.setupKey
  );

  return suppliedSecret === setupSecret;
}

async function handleCreateWebhookSubscription(req: any, res: any) {
  if (!isWebhookSetupAuthorised(req)) {
    return res.status(401).json({
      message: 'Webhook setup is not authorised. Add ESENDEX_WEBHOOK_SETUP_SECRET in Render and pass it as ?setupKey=...',
    });
  }

  try {
    const result = await createEsendexWebhookSubscription();
    return res.status(201).json({
      message: 'Esendex webhook subscription created.',
      eventType: result.eventType,
      callbackUrl: result.callbackUrl,
      result: result.raw,
    });
  } catch (error) {
    const err = error as Error & { status?: number; details?: unknown };
    console.error('ESENDEX WEBHOOK SUBSCRIPTION FAILED', {
      status: err.status,
      message: err.message,
      details: err.details,
    });

    return res.status(err.status || 502).json({
      message: err.message || 'Could not create Esendex webhook subscription.',
      details: err.details,
    });
  }
}

messagesRouter.get('/esendex/webhook-health', (_req, res) => {
  res.json({
    ok: true,
    eventType: process.env.ESENDEX_INBOUND_EVENT_TYPE || 'sms-message-received',
    webhookUrl: `${(process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || 'https://tmac-crm-web.onrender.com').replace(/\/$/, '')}/api/messages/esendex/webhook`,
  });
});

messagesRouter.post('/esendex/create-webhook-subscription', handleCreateWebhookSubscription);
messagesRouter.get('/esendex/create-webhook-subscription', handleCreateWebhookSubscription);

messagesRouter.post('/esendex/webhook', async (req, res) => {
  const inboundMessages = extractInboundPayload(req.body);

  console.log('Esendex inbound webhook received', {
    count: inboundMessages.length,
    body: req.body,
  });

  for (const inbound of inboundMessages) {
    const client = await findClientByMobile(inbound.fromNumber);

    if (!client) {
      if (inbound.providerMessageId) {
        const existing = await prisma.smsMessage.findFirst({
          where: { provider: 'ESENDEX', providerMessageId: inbound.providerMessageId },
          select: { id: true },
        });
        if (existing) continue;
      }

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

    if (inbound.providerMessageId) {
      const existing = await prisma.smsMessage.findFirst({
        where: { provider: 'ESENDEX', providerMessageId: inbound.providerMessageId },
        select: { id: true },
      });
      if (existing) continue;
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

messagesRouter.get('/overview', async (_req, res) => {
  const messages = await prisma.smsMessage.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
    include: {
      client: {
        select: { id: true, reference: true, firstName: true, lastName: true, mobile: true },
      },
    },
  });

  const conversations = new Map<string, any>();

  for (const message of messages) {
    const key = message.clientId || message.fromNumber || message.toNumber || message.id;
    const existing = conversations.get(key);

    if (!existing) {
      conversations.set(key, {
        ...message,
        latestAt: message.receivedAt || message.createdAt,
        messageCount: 1,
        unreadCount: message.direction === 'INBOUND' && !message.readAt && message.clientId ? 1 : 0,
      });
      continue;
    }

    existing.messageCount += 1;
    if (message.direction === 'INBOUND' && !message.readAt && message.clientId) {
      existing.unreadCount += 1;
    }
  }

  const grouped = Array.from(conversations.values()).sort((a, b) => {
    if ((a.unreadCount || 0) !== (b.unreadCount || 0)) return (b.unreadCount || 0) - (a.unreadCount || 0);
    return new Date(b.latestAt || b.createdAt).getTime() - new Date(a.latestAt || a.createdAt).getTime();
  });

  res.json(grouped);
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
