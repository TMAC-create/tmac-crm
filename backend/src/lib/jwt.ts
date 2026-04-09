import jwt from 'jsonwebtoken';
import { env } from './env.js';

export type JwtPayload = {
  userId: string;
  email: string;
  role: string;
};

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, env.jwtSecret as string, {
    expiresIn: '8h' as jwt.SignOptions['expiresIn'],
  });
}
