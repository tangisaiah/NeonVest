
import { z } from 'zod';

export const CalculationModeSchema = z.enum([
  'futureValue',
  'calculateMonthlyContribution',
  'calculateInterestRate',
  'calculateInvestmentDuration',
]);
export type CalculationMode = z.infer<typeof CalculationModeSchema>;

export const InvestmentFormSchema = z.object({
  initialInvestment: z.coerce.number().min(0, "Initial investment must be zero or positive"),
  monthlyContribution: z.coerce.number().min(0, "Monthly contribution must be zero or positive").optional(),
  interestRate: z.coerce.number().min(0, "Interest rate must be zero or positive").max(100, "Interest rate (0-100%)").optional(),
  investmentDuration: z.coerce.number().min(0, "Duration must be zero or positive").max(100, "Duration (0-100 years)").optional(), // Allow 0 for duration if target met by initial
  targetFutureValue: z.coerce.number().min(0, "Target future value must be positive").optional(),
  calculationMode: CalculationModeSchema.default('futureValue'),
});

export type InvestmentFormData = z.infer<typeof InvestmentFormSchema>;

export interface CalculationResults {
  futureValue: number;
  totalInterest: number;
  totalContributions: number;
  calculatedMonthlyContribution?: number;
  calculatedInterestRate?: number;
  calculatedInvestmentDuration?: number;
  originalTargetFutureValue?: number;
}

export interface YearlyData {
  year: number;
  startingBalance: number;
  interestEarned: number;
  contributions: number;
  endingBalance: number;
}

