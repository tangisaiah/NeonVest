
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating personalized investment tips.
 *
 * - generateInvestmentTips - A function that generates investment tips based on investment results.
 * - InvestmentTipsInput - The input type for the generateInvestmentTips function.
 * - InvestmentTipsOutput - The return type for the generateInvestmentTips function, which includes optional tips and an optional error message.
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

// Schema for the data structure the LLM is expected to return
const InvestmentTipsLLMOutputSchema = z.object({
  tips: z.array(z.string()).describe('An array of personalized investment tips.'),
});

// Schema for the actual output of the flow, including potential errors
const InvestmentTipsFlowOutputSchema = z.object({
  tips: z.array(z.string()).optional().describe('An array of personalized investment tips, if successful.'),
  error: z.string().optional().describe('An error message, if tips generation failed.'),
});
export type InvestmentTipsOutput = z.infer<typeof InvestmentTipsFlowOutputSchema>;

export async function generateInvestmentTips(input: InvestmentTipsInput): Promise<InvestmentTipsOutput> {
  return generateInvestmentTipsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'investmentTipsPrompt',
  input: {schema: InvestmentTipsInputSchema},
  output: {schema: InvestmentTipsLLMOutputSchema}, // LLM aims to produce this
  prompt: `You are an expert financial advisor. Provide personalized investment tips based on the following investment calculation results. The response should be an array of tips.

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
    outputSchema: InvestmentTipsFlowOutputSchema, // Flow returns this extended schema
  },
  async (input): Promise<InvestmentTipsOutput> => {
    try {
      const llmResponse = await prompt(input);
      if (!llmResponse.output || !llmResponse.output.tips || llmResponse.output.tips.length === 0) {
        console.warn("AI model returned no tips or undefined output.");
        return { tips: [], error: "The AI model did not provide any tips at this time." };
      }
      return { tips: llmResponse.output.tips, error: undefined };
    } catch (e) {
      console.error("Error in generateInvestmentTipsFlow during LLM call:", e);
      let errorMessage = "An unexpected error occurred while generating AI tips.";
      if (e instanceof Error) {
        if (e.message.includes("503") || e.message.toLowerCase().includes("service unavailable") || e.message.toLowerCase().includes("model is overloaded")) {
          errorMessage = "The AI model is currently overloaded. Please try again later.";
        } else if (e.message.toLowerCase().includes("api key not valid")) {
          errorMessage = "AI configuration error. Please check API key.";
        }
        else {
           errorMessage = `Failed to generate tips.`; // Keep server error details from client
        }
      }
      return { tips: [], error: errorMessage };
    }
  }
);
