import dotenv from 'dotenv';
import app from './src/app';
import connectDB from './src/config/database';
import { logger } from './src/utils/logger';

dotenv.config();

process.on('uncaughtException', (err: any) => {
  logger.error('system', 'uncaughtException', `Uncaught Exception! Shutting down... ${err.message}`);
  process.exit(1);
});

connectDB();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.success('system', 'serverStart', `Server running on port ${PORT} | API: http://localhost:${PORT}/api | Health: http://localhost:${PORT}/api/health | ENV: ${process.env.NODE_ENV || 'development'}`);
});

process.on('unhandledRejection', (err: any) => {
  logger.error('system', 'unhandledRejection', `Unhandled Rejection! Shutting down... ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  logger.success('system', 'SIGTERM', 'SIGTERM received. Shutting down gracefully');
  server.close(() => {
    logger.success('system', 'SIGTERM', 'Process terminated');
  });
});

process.on('SIGINT', () => {
  logger.success('system', 'SIGINT', 'SIGINT received. Shutting down gracefully');
  server.close(() => {
    logger.success('system', 'SIGINT', 'Process terminated');
  });
});

export default server;
