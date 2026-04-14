import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI!);
    logger.success('system', 'connectDB', `MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', err => {
      logger.error('system', 'connectDB', `MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('system', 'connectDB', 'MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.success('system', 'connectDB', 'MongoDB reconnected');
    });
  } catch (error: any) {
    logger.error('system', 'connectDB', `Database connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
