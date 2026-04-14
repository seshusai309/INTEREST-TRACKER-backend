import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const handleValidationError = (error: any): CustomError => {
  const errors = Object.values(error.errors).map((val: any) => val.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new CustomError(message, 400);
};

const handleDuplicateKeyError = (error: any): CustomError => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  const message = `Duplicate field value: ${field} = '${value}'. Please use another value.`;
  return new CustomError(message, 400);
};

const handleCastError = (error: any): CustomError => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new CustomError(message, 400);
};

const handleJWTError = (): CustomError =>
  new CustomError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = (): CustomError =>
  new CustomError('Your token has expired. Please log in again.', 401);

const sendError = (err: AppError, res: Response): void => {
  if (err.isOperational) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  } else {
    logger.error('system', 'sendError', `Non-operational error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: 'Something went wrong!',
    });
  }
};

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  err.statusCode = err.statusCode || 500;

  logger.error('system', 'globalErrorHandler', `${err.message} - URL: ${req.originalUrl} - Method: ${req.method}`);

  let error = { ...err };
  error.message = err.message;

  if (err.name === 'ValidationError') error = handleValidationError(error);
  if (err.code === 11000) error = handleDuplicateKeyError(error);
  if (err.name === 'CastError') error = handleCastError(error);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  sendError(error, res);
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new CustomError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

export default globalErrorHandler;
