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
import { validateCorsOrigin } from './src/utils/corsConfig.js';

import authRoutes from './src/routes/authRoutes.js';
import rideRoutes from './src/routes/rideRoutes.js';
import reviewRoutes from './src/routes/reviewRoutes.js';
import reportRoutes from './src/routes/reportRoutes.js';
import meRoutes from './src/routes/meRoutes.js';
import rideRequestRoutes from './src/routes/rideRequestRoutes.js';
import chatRoutes from './src/routes/chatRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js';
import callRoutes from './src/routes/callRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import { initSocket } from './src/socket/socketServer.js';

import './src/config/passport.js'; // ✅ this is already correct

const app = express();

const corsOptions = {
  origin(origin, callback) {
    validateCorsOrigin(origin, callback, 'express');
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
app.use('/api/calls', callRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

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
    console.log(' Starting server...\n');

    await connectDB();
    console.log('MongoDB connected');

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
