import './src/config/env.js'; // ✅ FIXED

import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from 'passport';
import helmet from 'helmet';

import { connectDB } from './src/config/db.js';
import { redis } from './src/utils/redis.js';
import { env } from './src/config/env.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { requestId } from './src/middleware/requestId.js'; 
import { apiLimiter } from './src/middleware/rateLimit.js';

import authRoutes from './src/routes/authRoutes.js';
import rideRoutes from './src/routes/rideRoutes.js';
import reviewRoutes from './src/routes/reviewRoutes.js';
import reportRoutes from './src/routes/reportRoutes.js';
import meRoutes from './src/routes/meRoutes.js';
import rideRequestRoutes from './src/routes/rideRequestRoutes.js';
import chatRoutes from './src/routes/chatRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js';
import { initSocket } from './src/socket/socketServer.js';

import './src/config/passport.js'; // ✅ this is already correct

const app = express();

const normalizeOrigin = (origin = '') => origin.trim().replace(/\/+$/, '');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  env.CLIENT_URL,
  ...(env.CLIENT_URLS ? env.CLIENT_URLS.split(',') : []),
]
  .map(normalizeOrigin)
  .filter(Boolean);

const vercelPreviewRegex =
  /^https:\/\/saha-yatri-[a-z0-9-]+-adhilek100-3295s-projects\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);

    if (
      allowedOrigins.includes(normalizedOrigin) ||
      vercelPreviewRegex.test(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestId);
app.use(passport.initialize());

app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/me', meRoutes);
app.use('/api/ride-requests', rideRequestRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    redis: redis.status,
    uptime: process.uptime(),
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export const startServer = async () => {
  try {
    console.log('🚀 Starting server...\n');

    await connectDB();
    console.log('✅ MongoDB connected');

    try {
      await redis.connect();
      console.log('Redis connected');
    } catch (err) {
      console.warn('Redis failed → running without cache');
    }

    const PORT = env.PORT || 5000;

    const httpServer = http.createServer(app);
    initSocket({ httpServer });

    const server = httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Redis status: ${redis.status}`);
    });

    return server;

  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
