import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: required('CLIENT_ORIGIN', 'http://localhost:5173'),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'change-this-to-a-long-random-value'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  adminEmail: process.env.TMAC_ADMIN_EMAIL || 'admin@tmaccrm.local',
  adminPassword: process.env.TMAC_ADMIN_PASSWORD || 'ChangeMe123!',
};
