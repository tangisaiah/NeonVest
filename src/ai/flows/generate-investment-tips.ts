'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating personalized investment tips.
 *
 * - generateInvestmentTips - A function that generates investment tips based on investment results.
 * - InvestmentTipsInput - The input type for the generateInvestmentTips function.
 * - InvestmentTipsOutput - The return type for the generateInvestmentTips function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InvestmentTipsInputSchema = z.object({
  initialInvestment: z.number().describe('The initial amount invested.'),
  monthlyContribution: z.number().describe('The monthly contribution amount.'),
  interestRate: z.number().describe('The annual interest rate (as a percentage).'),
  investmentDuration: z.number().describe('The investment duration in years.'),
  futureValue: z.number().describe('The calculated future value of the investment.'),
  totalInterest: z.number().describe('The total interest earned over the investment duration.'),
  totalContributions: z.number().describe('The total amount contributed over the investment duration.'),
});
export type InvestmentTipsInput = z.infer<typeof InvestmentTipsInputSchema>;

const InvestmentTipsOutputSchema = z.object({
  tips: z.array(z.string()).describe('An array of personalized investment tips.'),
});
export type InvestmentTipsOutput = z.infer<typeof InvestmentTipsOutputSchema>;

export async function generateInvestmentTips(input: InvestmentTipsInput): Promise<InvestmentTipsOutput> {
  return generateInvestmentTipsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'investmentTipsPrompt',
  input: {schema: InvestmentTipsInputSchema},
  output: {schema: InvestmentTipsOutputSchema},
  prompt: `You are an expert financial advisor. Provide personalized investment tips based on the following investment calculation results.  The response should be an array of tips.

Initial Investment: {{{initialInvestment}}}
Monthly Contribution: {{{monthlyContribution}}}
Interest Rate: {{{interestRate}}}%
Investment Duration: {{{investmentDuration}}} years
Future Value: {{{futureValue}}}
Total Interest Earned: {{{totalInterest}}}
Total Contributions: {{{totalContributions}}}

Consider common investment strategies and market conditions when generating the tips. Be specific and actionable.
`,
});

const generateInvestmentTipsFlow = ai.defineFlow(
  {
    name: 'generateInvestmentTipsFlow',
    inputSchema: InvestmentTipsInputSchema,
    outputSchema: InvestmentTipsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
