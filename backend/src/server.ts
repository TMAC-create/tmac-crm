import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './lib/env.js';

import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';

const app = express();

app.use(cors({ origin: env.clientOrigin }));
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/clients', clientsRouter);
app.use('/dashboard', dashboardRouter);

app.get('/', (_req, res) => {
  res.json({ message: 'TMAC CRM API running' });
});

app.listen(env.port, () => {
  console.log(`TMAC CRM API running on http://localhost:${env.port}`);
});
