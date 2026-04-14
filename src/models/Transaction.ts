import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment {
  paymentId: string;
  amount: number;
  date: string; // ISO date string: "YYYY-MM-DD"
}

export interface ITransaction extends Document {
  type: 'credit' | 'debit';
  person_name: string;
  principal_amount: number;
  interest_rate: number; // annual percentage e.g. 5 means 5%
  start_date: string;    // "YYYY-MM-DD"
  due_date: string;      // "YYYY-MM-DD"
  status: 'active' | 'overdue' | 'closed';
  payments: IPayment[];
  created_at: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount must be positive'],
    },
    date: {
      type: String,
      required: [true, 'Payment date is required'],
    },
  },
  { _id: false }
);

const transactionSchema = new Schema<ITransaction>(
  {
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: [true, 'Transaction type is required'],
    },
    person_name: {
      type: String,
      required: [true, 'Person name is required'],
      trim: true,
    },
    principal_amount: {
      type: Number,
      required: [true, 'Principal amount is required'],
      min: [0, 'Principal amount must be positive'],
    },
    interest_rate: {
      type: Number,
      required: [true, 'Interest rate is required'],
      min: [0, 'Interest rate must be positive'],
    },
    start_date: {
      type: String,
      required: [true, 'Start date is required'],
    },
    due_date: {
      type: String,
      required: [true, 'Due date is required'],
    },
    status: {
      type: String,
      enum: ['active', 'overdue', 'closed'],
      default: 'active',
    },
    payments: {
      type: [paymentSchema],
      default: [],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

export default mongoose.model<ITransaction>('Transaction', transactionSchema);
