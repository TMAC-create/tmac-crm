import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { normaliseUkMobile, sendEsendexSms } from '../services/esendex.js';

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

const sendSmsSchema = z.object({
  clientId: z.string().min(1),
  templateId: z.string().optional(),
  body: z.string().min(1),
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
