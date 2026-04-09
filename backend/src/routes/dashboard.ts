import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/summary', async (_req, res) => {
  const [totalClients, totalTasksOpen, statusCounts, recentClients] = await Promise.all([
    prisma.client.count(),
    prisma.task.count({ where: { status: 'OPEN' } }),
    prisma.client.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.client.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  res.json({
    totalClients,
    totalTasksOpen,
    statusCounts: statusCounts.map((item) => ({ status: item.status, count: item._count.status })),
    recentClients,
  });
});
