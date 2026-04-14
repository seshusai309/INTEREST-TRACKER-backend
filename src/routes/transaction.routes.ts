import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const transactionController = new TransactionController();

// Summary & Notifications (before /:id to avoid route conflicts)
router.get('/summary', authenticateToken, (req, res, next) => transactionController.getSummary(req, res, next));
router.get('/notifications', authenticateToken, (req, res, next) => transactionController.getNotifications(req, res, next));

// Transactions CRUD
router.post('/transactions', authenticateToken, (req, res, next) => transactionController.create(req, res, next));
router.get('/transactions', authenticateToken, (req, res, next) => transactionController.getAll(req, res, next));
router.get('/transactions/:id', authenticateToken, (req, res, next) => transactionController.getOne(req, res, next));
router.put('/transactions/:id', authenticateToken, (req, res, next) => transactionController.update(req, res, next));
router.delete('/transactions/:id', authenticateToken, (req, res, next) => transactionController.remove(req, res, next));

// Payments
router.post('/transactions/:id/payments', authenticateToken, (req, res, next) => transactionController.addPayment(req, res, next));
router.delete('/transactions/:id/payments/:paymentId', authenticateToken, (req, res, next) => transactionController.removePayment(req, res, next));

// Balance
router.get('/transactions/:id/balance', authenticateToken, (req, res, next) => transactionController.getBalance(req, res, next));

export default router;
