import { IPayment } from '../models/Transaction';
import { logger } from '../utils/logger';

/**
 * Calculates the number of months (fractional) between two date strings.
 * Uses exact day difference divided by average days per month (30.4375).
 */
function monthsBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays / 30.4375;
}

/**
 * Applies monthly compound interest to an amount over a number of months.
 * Formula: A = P * (1 + r/100)^months
 * where r = monthly rate e.g. 5 means 5% per month
 */
function compound(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return principal;
  const rate = monthlyRate / 100;
  return principal * Math.pow(1 + rate, months);
}

/**
 * Calculates the current outstanding balance for a transaction.
 *
 * Flow:
 *   amount = principal
 *   for each payment (sorted by date ASC):
 *     compound from last_date → payment.date
 *     amount -= payment.amount
 *     if amount < 0, amount = 0 (overpaid)
 *   compound from last_date → today
 *   return amount
 */
export interface IMonthlyBreakdown {
  month: string;
  opening: number;
  interest: number;
  total_to_pay: number;
  payment: number;
  closing: number;
}

export function calculateMonthlyBreakdown(
  principal: number,
  monthlyRate: number,
  startDate: string,
  payments: IPayment[]
): IMonthlyBreakdown[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const rate = monthlyRate / 100;
  const breakdown: IMonthlyBreakdown[] = [];

  // Build a map of payments by YYYY-MM key
  const paymentsByMonth: Record<string, number> = {};
  for (const p of payments) {
    const key = p.date.slice(0, 7);
    paymentsByMonth[key] = (paymentsByMonth[key] || 0) + p.amount;
  }

  const start = new Date(startDate);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let balance = principal;

  while (cursor <= today) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    // Period start: max(start_date, first of this month)
    const periodStart = cursor < start ? startDate : cursor.toISOString().split('T')[0];

    // Period end: min(first of next month, today)
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];
    const periodEnd = nextMonthStr <= todayStr ? nextMonthStr : todayStr;

    const opening = Math.round(balance * 100) / 100;

    // Use fractional months — clamp to 0 to prevent negative interest
    const months = Math.max(0, monthsBetween(periodStart, periodEnd));
    const afterInterest = Math.round(opening * Math.pow(1 + rate, months) * 100) / 100;
    const interest = Math.max(0, Math.round((afterInterest - opening) * 100) / 100);
    const total_to_pay = afterInterest;
    const payment = Math.round((paymentsByMonth[monthKey] || 0) * 100) / 100;
    const closing = Math.max(0, Math.round((afterInterest - payment) * 100) / 100);

    breakdown.push({ month: monthLabel, opening, interest, total_to_pay, payment, closing });

    balance = closing;
    cursor = nextMonth;
  }

  return breakdown;
}

export function calculateCurrentBalance(
  principal: number,
  annualRate: number,
  startDate: string,
  payments: IPayment[]
): number {
  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

  // Sort payments by date ascending
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let amount = principal;
  let lastDate = startDate;

  for (const payment of sortedPayments) {
    // Only process payments that are on or before today
    if (payment.date > today) continue;

    const months = monthsBetween(lastDate, payment.date);
    amount = compound(amount, annualRate, months);
    amount -= payment.amount;

    if (amount < 0) {
      logger.warn('system', 'calculateCurrentBalance', `Overpayment detected on ${payment.date}: balance went negative, clamped to 0`);
      amount = 0;
    }
    lastDate = payment.date;
  }

  // Compound from last processed date to today
  const remainingMonths = monthsBetween(lastDate, today);
  amount = compound(amount, annualRate, remainingMonths);

  const result = Math.round(amount * 100) / 100;
  logger.success('system', 'calculateCurrentBalance', `Balance calculated: principal=${principal}, rate=${annualRate}%, result=${result}`);

  return result;
}
