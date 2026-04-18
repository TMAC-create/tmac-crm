import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ✅ 1. Check for Zapier API key FIRST
  const apiKey = req.headers['x-api-key'];

  if (apiKey && apiKey === process.env.ZAPIER_API_KEY) {
    return next();
  }

  // ✅ 2. Normal JWT auth continues as before
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing bearer token.' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as Request['user'];
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}
