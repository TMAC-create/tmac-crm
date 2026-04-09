import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './lib/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { dashboardRouter } from './routes/dashboard.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/', (_req, res) => {
  res.json({ name: 'TMAC CRM API', version: '0.2.0' });
});

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/clients', clientsRouter);
app.use('/dashboard', dashboardRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong.' });
});

app.listen(env.port, () => {
  console.log(`TMAC CRM API running on http://localhost:${env.port}`);
});
