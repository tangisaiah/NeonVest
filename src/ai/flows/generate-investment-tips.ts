
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating personalized investment tips.
 *
 * - generateInvestmentTips - A function that generates investment tips based on investment results.
 * - InvestmentTipsInput - The input type for the generateInvestmentTips function.
 * - InvestmentTipsOutput - The return type for the generateInvestmentTips function, which includes optional tips (with title and description) and an optional error message.
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

// Schema for individual tip object
const TipSchema = z.object({
  title: z.string().describe('The title of the investment tip.'),
  description: z.string().describe('The detailed description of the investment tip.'),
});

// Schema for the data structure the LLM is expected to return
const InvestmentTipsLLMOutputSchema = z.object({
  tips: z.array(TipSchema).max(3).describe('An array of up to 3 personalized investment tips, each with a title and description.'),
});

// Schema for the actual output of the flow, including potential errors
const InvestmentTipsFlowOutputSchema = z.object({
  tips: z.array(TipSchema).optional().describe('An array of personalized investment tips, if successful.'),
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
  prompt: `You are an expert financial advisor. Provide a maximum of 3 personalized investment tips based on the following investment calculation results. Each tip must have a 'title' and a 'description'.

The response should be an array of tip objects, structured like this example:
[
  { "title": "Example Tip Title 1", "description": "Detailed description for example tip 1." },
  { "title": "Example Tip Title 2", "description": "Detailed description for example tip 2." }
]

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
