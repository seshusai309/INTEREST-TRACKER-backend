import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import globalErrorHandler, { notFound } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import transactionRoutes from './routes/transaction.routes';

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, origin?: string | boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    // Allow exact matches from env
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    // Allow wildcard
    if (allowedOrigins.includes('*')) {
      return callback(null, origin);
    }
    // Allow local dev & hybrid apps (Capacitor/Ionic)
    if (
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://')
    ) {
      return callback(null, origin);
    }
    // Block everything else
    return callback(new Error(`CORS blocked: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.options('*', cors());

// Health check — must be before protected routes
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Interest Tracker API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', transactionRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
