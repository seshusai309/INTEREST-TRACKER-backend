import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import Transaction from "../models/Transaction";
import { CustomError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { calculateCurrentBalance, calculateMonthlyBreakdown } from "../services/interest.service";

export class TransactionController {
  // POST /api/transactions
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        type,
        person_name,
        principal_amount,
        interest_rate,
        start_date,
        due_date,
      } = req.body;

      if (
        !type ||
        !person_name ||
        !principal_amount ||
        !interest_rate ||
        !start_date ||
        !due_date
      ) {
        throw new CustomError(
          "All fields are required: type, person_name, principal_amount, interest_rate, start_date, due_date",
          400,
        );
      }

      if (!["credit", "debit"].includes(type)) {
        throw new CustomError("Type must be credit or debit", 400);
      }

      const transaction = await Transaction.create({
        type,
        person_name,
        principal_amount,
        interest_rate,
        start_date,
        due_date,
        status: "active",
        payments: [],
      });

      logger.success(
        (req as any).user._id.toString(),
        "createTransaction",
        `Transaction created for ${person_name}: ${type} of ${principal_amount}`,
      );

      res.status(201).json({
        success: true,
        message: "Transaction created",
        data: { transaction },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "createTransaction",
        error.message,
      );
      next(error);
    }
  }

  // GET /api/transactions
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filter: any = {};

      if (req.query.type) {
        if (!["credit", "debit"].includes(req.query.type as string)) {
          throw new CustomError("Type filter must be credit or debit", 400);
        }
        filter.type = req.query.type;
      }

      if (req.query.person_name) {
        filter.person_name = {
          $regex: req.query.person_name as string,
          $options: "i",
        };
      }

      const transactions = await Transaction.find(filter).sort({
        created_at: -1,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const formatted = transactions.map((t) => {
        const remaining_amount = calculateCurrentBalance(
          t.principal_amount,
          t.interest_rate,
          t.start_date,
          t.payments,
        );

        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const due_days = Math.round(
          (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: t._id,
          type: t.type,
          person_name: t.person_name,
          principal_amount: t.principal_amount,
          remaining_amount,
          due_days,
          status: t.status,
        };
      });

      logger.success(
        (req as any).user._id.toString(),
        "getAllTransactions",
        `Fetched ${transactions.length} transactions`,
      );

      res.status(200).json({
        success: true,
        data: { transactions: formatted },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "getAllTransactions",
        error.message,
      );
      next(error);
    }
  }

  // GET /api/transactions/:id
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const remaining_amount = calculateCurrentBalance(
        transaction.principal_amount,
        transaction.interest_rate,
        transaction.start_date,
        transaction.payments,
      );

      const total_paid = transaction.payments.reduce(
        (sum, p) => sum + p.amount,
        0,
      );
      const remaining_principal = transaction.principal_amount - total_paid;
      const total_interest =
        Math.round(Math.max(0, remaining_amount - remaining_principal) * 100) /
        100;

      const dueDate = new Date(transaction.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const days_remaining = Math.round(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Auto-sync status in DB if it has drifted
      const computedStatus =
        transaction.status === "closed"
          ? "closed"
          : days_remaining < 0
            ? "overdue"
            : "active";
      if (transaction.status !== computedStatus) {
        await Transaction.findByIdAndUpdate(req.params.id, {
          status: computedStatus,
        });
      }

      logger.success(
        (req as any).user._id.toString(),
        "getOneTransaction",
        `Fetched transaction ${req.params.id}`,
      );

      res.status(200).json({
        success: true,
        data: {
          transaction: {
            id: transaction._id,
            type: transaction.type,
            person_name: transaction.person_name,
            principal_amount: transaction.principal_amount,
            interest_rate: transaction.interest_rate,
            start_date: transaction.start_date,
            due_date: transaction.due_date,
            remaining_amount,
            total_interest,
            total_paid,
            days_remaining,
            status: computedStatus,
            payments: transaction.payments,
          },
        },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "getOneTransaction",
        error.message,
      );
      next(error);
    }
  }

  // PUT /api/transactions/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, principal_amount, interest_rate, status } = req.body;

      const allowedFields = [
        "type",
        "person_name",
        "principal_amount",
        "interest_rate",
        "start_date",
        "due_date",
        "status",
      ];
      const sentFields = Object.keys(req.body).filter((k) =>
        allowedFields.includes(k),
      );

      if (sentFields.length === 0) {
        throw new CustomError(
          "At least one field is required to update: type, person_name, principal_amount, interest_rate, start_date, due_date, status",
          400,
        );
      }

      if (type && !["credit", "debit"].includes(type)) {
        throw new CustomError("type must be credit or debit", 400);
      }

      if (status && !["active", "overdue", "closed"].includes(status)) {
        throw new CustomError("status must be active, overdue or closed", 400);
      }

      if (principal_amount !== undefined && principal_amount <= 0) {
        throw new CustomError("principal_amount must be positive", 400);
      }

      if (interest_rate !== undefined && interest_rate < 0) {
        throw new CustomError("interest_rate must be positive", 400);
      }

      // Validate principal_amount against already paid amount
      let autoClose = false;
      if (principal_amount !== undefined) {
        const existing = await Transaction.findById(req.params.id);
        if (!existing) {
          throw new CustomError("Transaction not found", 404);
        }
        const total_paid = existing.payments.reduce((sum, p) => sum + p.amount, 0);
        if (total_paid > principal_amount) {
          throw new CustomError(
            `Already paid ${total_paid}. New principal must be at least ${total_paid}.`,
            400,
          );
        }
        const remaining = calculateCurrentBalance(
          principal_amount,
          existing.interest_rate,
          existing.start_date,
          existing.payments,
        );
        if (remaining <= 0) autoClose = true;
      }

      // Build update object with only sent fields
      const updates: any = {};
      sentFields.forEach((f) => {
        updates[f] = req.body[f];
      });
      if (autoClose) updates.status = "closed";

      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true },
      );

      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      logger.success(
        (req as any).user._id.toString(),
        "updateTransaction",
        `Transaction ${req.params.id} updated: ${sentFields.join(", ")}`,
      );

      res.status(200).json({
        success: true,
        message: "Transaction updated",
        data: {
          id: transaction._id,
          type: transaction.type,
          person_name: transaction.person_name,
          principal_amount: transaction.principal_amount,
          interest_rate: transaction.interest_rate,
          start_date: transaction.start_date,
          due_date: transaction.due_date,
          status: transaction.status,
        },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "updateTransaction",
        error.message,
      );
      next(error);
    }
  }

  // DELETE /api/transactions/:id
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await Transaction.findByIdAndDelete(req.params.id);
      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      logger.success(
        (req as any).user._id.toString(),
        "deleteTransaction",
        `Transaction ${req.params.id} deleted`,
      );

      res.status(200).json({
        success: true,
        message: "Transaction deleted",
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "deleteTransaction",
        error.message,
      );
      next(error);
    }
  }

  // POST /api/transactions/:id/payments
  async addPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { amount, date } = req.body;

      if (!amount) {
        throw new CustomError("Payment amount is required", 400);
      }

      if (amount <= 0) {
        throw new CustomError("Payment amount must be positive", 400);
      }

      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      const currentBalance = calculateCurrentBalance(
        transaction.principal_amount,
        transaction.interest_rate,
        transaction.start_date,
        transaction.payments,
      );

      if (amount > currentBalance) {
        throw new CustomError(
          `Remaining balance is ${currentBalance}. Pay exactly ${currentBalance} to close this transaction.`,
          400,
        );
      }

      const paymentDate = date || new Date().toISOString().split("T")[0];
      const payment = { paymentId: uuidv4(), amount, date: paymentDate };
      transaction.payments.push(payment);
      await transaction.save();

      const remaining_amount = calculateCurrentBalance(
        transaction.principal_amount,
        transaction.interest_rate,
        transaction.start_date,
        transaction.payments,
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(transaction.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const days_remaining = Math.round(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const status =
        remaining_amount <= 0
          ? "closed"
          : days_remaining < 0
            ? "overdue"
            : "active";

      if (transaction.status !== status) {
        await Transaction.findByIdAndUpdate(req.params.id, { status });
      }

      logger.success(
        (req as any).user._id.toString(),
        "addPayment",
        `Payment of ${amount} added to transaction ${req.params.id} | status: ${status}`,
      );

      res.status(201).json({
        success: true,
        message: "Payment added",
        data: {
          payment: {
            id: payment.paymentId,
            amount: payment.amount,
            date: payment.date,
          },
          remaining_amount,
          status,
        },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "addPayment",
        error.message,
      );
      next(error);
    }
  }

  // DELETE /api/transactions/:id/payments/:paymentId
  async removePayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      const paymentIndex = transaction.payments.findIndex(
        (p) => p.paymentId === req.params.paymentId,
      );

      if (paymentIndex === -1) {
        throw new CustomError("Payment not found", 404);
      }

      transaction.payments.splice(paymentIndex, 1);
      await transaction.save();

      logger.success(
        (req as any).user._id.toString(),
        "removePayment",
        `Payment ${req.params.paymentId} removed from transaction ${req.params.id}`,
      );

      res.status(200).json({
        success: true,
        message: "Payment removed",
        data: { transaction },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "removePayment",
        error.message,
      );
      next(error);
    }
  }

  // GET /api/transactions/:id/balance
  async getBalance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        throw new CustomError("Transaction not found", 404);
      }

      const current_balance = calculateCurrentBalance(
        transaction.principal_amount,
        transaction.interest_rate,
        transaction.start_date,
        transaction.payments,
      );

      const total_interest = Math.round(Math.max(0, current_balance - transaction.principal_amount) * 100) / 100;

      const monthly_breakdown = calculateMonthlyBreakdown(
        transaction.principal_amount,
        transaction.interest_rate,
        transaction.start_date,
        transaction.payments,
      );

      logger.success(
        (req as any).user._id.toString(),
        "getBalance",
        `Balance calculated for transaction ${req.params.id}: ${current_balance}`,
      );

      res.status(200).json({
        success: true,
        data: {
          person: transaction.person_name,
          type: transaction.type,
          principal: transaction.principal_amount,
          current_balance,
          total_interest,
          monthly_breakdown,
        },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "getBalance",
        error.message,
      );
      next(error);
    }
  }

  // GET /api/summary
  async getSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const transactions = await Transaction.find();

      let totalCredit = 0;
      let totalDebit = 0;
      let toReceive = 0;
      let toPay = 0;

      for (const t of transactions) {
        const currentAmount = calculateCurrentBalance(
          t.principal_amount,
          t.interest_rate,
          t.start_date,
          t.payments,
        );

        if (t.type === "credit") {
          totalCredit += t.principal_amount;
          toReceive += currentAmount;
        } else {
          totalDebit += t.principal_amount;
          toPay += currentAmount;
        }
      }

      totalCredit = Math.round(totalCredit * 100) / 100;
      totalDebit = Math.round(totalDebit * 100) / 100;
      toReceive = Math.round(toReceive * 100) / 100;
      toPay = Math.round(toPay * 100) / 100;
      const net = Math.round((toReceive - toPay) * 100) / 100;

      logger.success(
        (req as any).user._id.toString(),
        "getSummary",
        `Summary calculated: net ${net}`,
      );

      res.status(200).json({
        success: true,
        data: {
          totalCredit,
          totalDebit,
          toReceive,
          toPay,
          net,
        },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "getSummary",
        error.message,
      );
      next(error);
    }
  }

  // GET /api/notifications
  async getNotifications(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(today.getDate() + 7);

      const sevenDaysLaterStr = sevenDaysLater.toISOString().split("T")[0];

      // due_date <= today+7days, exclude closed transactions
      const transactions = await Transaction.find({
        due_date: { $lte: sevenDaysLaterStr },
        status: { $ne: 'closed' },
      });

      const notifications = transactions.map((t) => {
        const currentAmount = calculateCurrentBalance(
          t.principal_amount,
          t.interest_rate,
          t.start_date,
          t.payments,
        );

        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const diffMs = dueDate.getTime() - today.getTime();
        const days_remaining = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const overdue = days_remaining < 0;

        return {
          id: t._id,
          person_name: t.person_name,
          type: t.type,
          due_date: t.due_date,
          days_remaining,
          overdue,
          remaining_amount: currentAmount,
        };
      });

      // Sort: overdue first (most overdue at top), then upcoming by days_remaining
      notifications.sort((a, b) => a.days_remaining - b.days_remaining);

      logger.success(
        (req as any).user._id.toString(),
        "getNotifications",
        `Notifications fetched: ${notifications.length} items`,
      );

      res.status(200).json({
        success: true,
        data: { notifications },
      });
    } catch (error: any) {
      logger.error(
        (req as any).user?._id?.toString() || "unknown",
        "getNotifications",
        error.message,
      );
      next(error);
    }
  }
}
