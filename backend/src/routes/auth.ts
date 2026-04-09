import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { env } from '../lib/env.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
authRouter.get('/seed-admin', async (_req, res) => {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@tmaccrm.local' } });
  if (existing) {
    return res.json({ message: 'Seed admin already exists.' });
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  const user = await prisma.user.create({
    data: {
      name: 'TMAC Admin',
      email: 'admin@tmaccrm.local',
      passwordHash,
      role: 'ADMIN',
    },
  });

  return res.status(201).json({
    message: 'Seed admin created.',
    login: {
      email: user.email,
      password: 'ChangeMe123!',
    },
  });
});
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid login payload.' });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

authRouter.get('/bootstrap', async (_req, res) => {
  const user = await prisma.user.findUnique({ where: { email: env.adminEmail.toLowerCase() } });
  res.json({
    seeded: Boolean(user),
    email: env.adminEmail,
  });
});
