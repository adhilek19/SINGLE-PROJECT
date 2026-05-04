import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import crypto from 'crypto';

export const generateAccessToken = (userId) =>
  jwt.sign(
    { id: userId, jti: crypto.randomUUID() },
    env.ACCESS_SECRET,
    { expiresIn: env.ACCESS_EXPIRES_IN }
  );

export const generateRefreshToken = (userId) =>
  jwt.sign(
    { id: userId, jti: crypto.randomUUID() },
    env.REFRESH_SECRET,
    { expiresIn: env.REFRESH_EXPIRES_IN }
  );

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.ACCESS_SECRET);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.REFRESH_SECRET);