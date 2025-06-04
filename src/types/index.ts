
import { z } from 'zod';

export const CalculationModeSchema = z.enum([
  'futureValue',
  'calculateMonthlyContribution',
  'calculateInterestRate',
  'calculateInvestmentDuration',
]);
export type CalculationMode = z.infer<typeof CalculationModeSchema>;

export const InvestmentFormSchema = z.object({
  initialInvestment: z.number().min(0, "Initial investment must be zero or positive").max(1000000000, "Initial investment is too large (max 1B)").nullable().optional(),
  monthlyContribution: z.number().min(0, "Monthly contribution must be zero or positive").max(1000000, "Monthly contribution is too large (max 1M)").nullable().optional(),
  interestRate: z.number().min(0, "Interest rate must be zero or positive").max(100, "Interest rate cannot exceed 100%").nullable().optional(),
  investmentDuration: z.number().min(0, "Duration must be zero or positive").max(100, "Duration cannot exceed 100 years").nullable().optional(),
  targetFutureValue: z.number().min(0, "Target future value must be positive").max(100000000000, "Target future value is too large (max 100B)").nullable().optional(),
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
