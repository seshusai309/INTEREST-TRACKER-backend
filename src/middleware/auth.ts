import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Accept token from cookie (mobile app) OR Authorization header (Postman/testing)
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      logger.warn('unknown', 'authenticateToken', `No token provided - ${req.method} ${req.originalUrl}`);
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      logger.warn('unknown', 'authenticateToken', `User not found for token - ${req.method} ${req.originalUrl}`);
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    logger.success(user._id.toString(), 'authenticateToken', `Authenticated - ${req.method} ${req.originalUrl}`);
    (req as any).user = user;
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      logger.error('unknown', 'authenticateToken', `Invalid token - ${req.method} ${req.originalUrl}`);
      res.status(401).json({ success: false, message: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      logger.error('unknown', 'authenticateToken', `Token expired - ${req.method} ${req.originalUrl}`);
      res.status(401).json({ success: false, message: 'Token expired' });
    } else {
      logger.error('unknown', 'authenticateToken', `Auth error: ${error.message} - ${req.method} ${req.originalUrl}`);
      res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  }
};
