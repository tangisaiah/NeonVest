import { z } from 'zod';

export const InvestmentFormSchema = z.object({
  initialInvestment: z.coerce.number().min(0, "Initial investment must be zero or positive"),
  monthlyContribution: z.coerce.number().min(0, "Monthly contribution must be zero or positive"),
  interestRate: z.coerce.number().min(0, "Interest rate must be zero or positive").max(100, "Interest rate (0-100)"),
  investmentDuration: z.coerce.number().int().min(1, "Duration must be at least 1 year").max(100, "Duration (1-100 years)"),
});

export type InvestmentFormData = z.infer<typeof InvestmentFormSchema>;

export interface CalculationResults {
  futureValue: number;
  totalInterest: number;
  totalContributions: number;
}

export interface YearlyData {
  year: number;
  startingBalance: number;
  interestEarned: number;
  contributions: number;
  endingBalance: number;
}
