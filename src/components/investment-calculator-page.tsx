
"use client";

import type { InvestmentFormData, CalculationResults, YearlyData, CalculationMode } from '@/types';
import { InvestmentFormSchema } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { generateInvestmentTips, type InvestmentTipsInput, type InvestmentTipsOutput } from '@/ai/flows/generate-investment-tips';
import { DollarSign, Percent, CalendarDays, TrendingUp, Lightbulb, Loader2, AreaChart, Target, HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from '@/components/ui/label';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Line as RechartsLine, Legend as RechartsLegend, Tooltip as RechartsTooltip } from 'recharts';


const formatCurrency = (value: number | undefined) => {
  if (value === undefined || isNaN(value)) return "N/A";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatPercentage = (value: number | undefined) => {
  if (value === undefined || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

const formatYears = (value: number | undefined) => {
  if (value === undefined || isNaN(value)) return "N/A";
  return `${value.toFixed(2)} years`;
}

const formatForDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '';
  }
  const numValue = Number(value);
  // Check if it's an integer or has decimal places
  if (numValue % 1 === 0) {
    return numValue.toLocaleString('en-US'); // Format integers without decimals
  }
  // For numbers with decimals, ensure they are formatted correctly, possibly with limited precision if needed
  // This example uses default toLocaleString which should handle decimals fine for display.
  // If specific decimal places are needed for display, add options: { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 20 });
};

const parseInput = (inputValue: string): number | undefined => {
  // Remove all non-numeric characters except for the decimal point
  const cleaned = inputValue.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return undefined; // Handle empty or only decimal point input
  const numberValue = parseFloat(cleaned);
  return isNaN(numberValue) ? undefined : numberValue;
};


interface ChartDisplayDataItem {
  name: string;
  totalValue: number;
  amountInvested: number;
  interestAccumulated: number;
}

const chartConfig = {
  totalValue: {
    label: "Total Value",
    color: "hsl(var(--chart-1))",
  },
  amountInvested: {
    label: "Amount Invested",
    color: "hsl(195, 100%, 50%)", // Neon Blue
  },
  interestAccumulated: {
    label: "Interest Accumulated",
    color: "hsl(0, 100%, 50%)", // Neon Red
  },
} satisfies ChartConfig;

const tooltipOrder: (keyof ChartDisplayDataItem)[] = ["totalValue", "amountInvested", "interestAccumulated"];


interface AiTip {
  title: string;
  description: string;
}

export default function InvestmentCalculatorPage() {
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [aiTips, setAiTips] = useState<AiTip[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [formInputsForAI, setFormInputsForAI] = useState<InvestmentFormData | null>(null);
  const [chartDisplayData, setChartDisplayData] = useState<ChartDisplayDataItem[]>([]);
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('futureValue');

  const { toast } = useToast();

  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormSchema),
    defaultValues: {
      initialInvestment: 1000,
      monthlyContribution: 100,
      interestRate: 7,
      investmentDuration: 10,
      targetFutureValue: 1000000,
      calculationMode: 'futureValue',
    },
  });

  const calculateFullProjection = (
    initialInvestment: number,
    monthlyContribution: number,
    interestRate: number, // As percentage, e.g., 7 for 7%
    investmentDuration: number // In years
  ): { yearlyData: YearlyData[], futureValue: number, totalInterest: number, totalContributions: number } => {
    const annualInterestRateDecimal = interestRate / 100;
    const monthlyInterestRate = annualInterestRateDecimal / 12;

    let currentBalance = initialInvestment;
    const newYearlyData: YearlyData[] = [];
    let totalContributionsOverall = initialInvestment; // Initial investment is part of contributions

    for (let year = 1; year <= investmentDuration; year++) {
      const startingBalanceForYear = currentBalance;
      let totalInterestThisYear = 0;
      let totalContributionsThisYear = 0; // Contributions for this specific year (excluding initial)

      for (let month = 1; month <= 12; month++) {
        const interestThisMonth = currentBalance * monthlyInterestRate;
        currentBalance += interestThisMonth;
        totalInterestThisYear += interestThisMonth;
        
        // Monthly contributions are added after interest calculation for the month
        if (monthlyContribution > 0) {
            currentBalance += monthlyContribution;
            totalContributionsThisYear += monthlyContribution;
            totalContributionsOverall += monthlyContribution; // Accumulate overall contributions
        }
      }
      newYearlyData.push({
        year,
        startingBalance: startingBalanceForYear, // Not used in table display anymore
        interestEarned: totalInterestThisYear,
        contributions: totalContributionsThisYear,
        endingBalance: currentBalance,
      });
    }
    const futureValue = currentBalance;
    // Total interest is the final value minus all money put in (initial + all monthly)
    const totalInterestEarned = futureValue - totalContributionsOverall;
    
    return {
        yearlyData: newYearlyData,
        futureValue,
        totalInterest: totalInterestEarned,
        totalContributions: totalContributionsOverall,
    };
  };


  const onSubmit: SubmitHandler<InvestmentFormData> = (data) => {
    let { initialInvestment, monthlyContribution, interestRate, investmentDuration, targetFutureValue } = data;
    let calculatedMonthlyContribution: number | undefined = undefined;
    let calculatedInterestRate: number | undefined = undefined;
    let calculatedInvestmentDuration: number | undefined = undefined;
    let finalFutureValue: number | undefined = undefined; // To store the target if it's an input
    let originalTargetFutureValueForDisplay: number | undefined = undefined;


    // Get the current calculation mode from the form state itself
    const mode = form.getValues('calculationMode');

    try {
      // Validate that all necessary fields for the *selected mode* are present.
      // Zod schema handles general validation, this is mode-specific logic.
      if (mode === 'calculateMonthlyContribution') {
        if (initialInvestment === undefined || interestRate === undefined || investmentDuration === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Interest Rate, Duration, and Target Future Value.", variant: "destructive" });
          return;
        }
        originalTargetFutureValueForDisplay = targetFutureValue;
        const i = (interestRate / 100) / 12; // monthly interest rate
        const N = investmentDuration * 12; // total number of periods
        if (i === 0) { // Handle 0% interest rate separately
            calculatedMonthlyContribution = (targetFutureValue - initialInvestment) / N;
        } else {
            const futureValueOfInitial = initialInvestment * Math.pow(1 + i, N);
            calculatedMonthlyContribution = (targetFutureValue - futureValueOfInitial) * i / (Math.pow(1 + i, N) - 1);
        }

        if (calculatedMonthlyContribution < 0) {
          toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions. Consider adjusting parameters.", variant: "destructive"});
          calculatedMonthlyContribution = 0; // Or handle as error, set to 0 for projection
        }
        form.setValue('monthlyContribution', parseFloat(calculatedMonthlyContribution.toFixed(2)));
        monthlyContribution = calculatedMonthlyContribution; // Update the variable for projection
        finalFutureValue = targetFutureValue;
      } else if (mode === 'calculateInvestmentDuration') {
        if (initialInvestment === undefined || monthlyContribution === undefined || interestRate === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Monthly Contribution, Interest Rate, and Target Future Value.", variant: "destructive" });
          return;
        }
        originalTargetFutureValueForDisplay = targetFutureValue;
        const i = (interestRate / 100) / 12; // monthly interest rate
        // FV = P(1+i)^N + M [((1+i)^N - 1)/i]
        // For N: N = ln((FV*i + M) / (P*i + M)) / ln(1+i)
        if (targetFutureValue <= initialInvestment && monthlyContribution <=0) {
            toast({ title: "Calculation Error", description: "Target value must be greater than initial investment if contributions are zero or negative.", variant: "destructive" });
            return;
        }
        if (i === 0) { // 0% interest
            if (monthlyContribution <=0 && targetFutureValue > initialInvestment) {
                 toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no positive contributions.", variant: "destructive" }); return;
            }
            calculatedInvestmentDuration = (targetFutureValue - initialInvestment) / (monthlyContribution * 12);
        } else { // Interest rate is not 0
            if ((initialInvestment * i + monthlyContribution) <= 0 && (targetFutureValue * i + monthlyContribution) > 0) {
                 toast({ title: "Calculation Error", description: "Cannot reach target with these parameters (denominator would be non-positive).", variant: "destructive" }); return;
            }
             if (monthlyContribution === 0 && interestRate > 0) { // Only initial investment grows
                if (targetFutureValue <= initialInvestment) {
                     toast({ title: "Calculation Error", description: "Target must be greater than initial investment.", variant: "destructive" }); return;
                }
                calculatedInvestmentDuration = Math.log(targetFutureValue / initialInvestment) / (12 * Math.log(1 + i));
            } else if (initialInvestment * i + monthlyContribution <= 0) { // Denominator check or investment doesn't grow
                toast({ title: "Calculation Error", description: "Investment will not grow to target with these parameters.", variant: "destructive" }); return;
            }
            else {
                const numerator = targetFutureValue * i + monthlyContribution;
                const denominator = initialInvestment * i + monthlyContribution;
                if (numerator <= 0 || denominator <= 0 || numerator/denominator <= 0) {
                    toast({ title: "Calculation Error", description: "Cannot calculate duration due to non-positive logarithm argument.", variant: "destructive" }); return;
                }
                const N_periods = Math.log(numerator / denominator) / Math.log(1 + i);
                calculatedInvestmentDuration = N_periods / 12;
            }
        }

         if (calculatedInvestmentDuration === undefined || calculatedInvestmentDuration < 0 || !isFinite(calculatedInvestmentDuration)) {
            toast({title: "Calculation Alert", description: "Target is likely unachievable or calculation resulted in an invalid duration. Please check parameters.", variant: "destructive"});
            calculatedInvestmentDuration = undefined; // Prevent further calculation
        } else {
            form.setValue('investmentDuration', parseFloat(calculatedInvestmentDuration.toFixed(2)));
            investmentDuration = calculatedInvestmentDuration; // Update for projection
        }
        finalFutureValue = targetFutureValue;
      } else if (mode === 'calculateInterestRate') {
        if (initialInvestment === undefined || monthlyContribution === undefined || investmentDuration === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Monthly Contribution, Duration, and Target Future Value.", variant: "destructive" });
          return;
        }
        originalTargetFutureValueForDisplay = targetFutureValue;
        const N = investmentDuration * 12; // total periods
        // Bisection method to find the monthly interest rate i
        let low_i = 0; // 0%
        let high_i = 0.5; // 50% monthly rate (600% annual) is extremely high, good upper bound
        let mid_i;
        let fv_at_mid_i;
        let iterations = 0;

        if (targetFutureValue < initialInvestment + monthlyContribution * N) {
             toast({ title: "Target Value Alert", description: "Target value is less than total contributions without any interest. Desired rate might be negative or zero.", variant: "default" });
             // still attempt to find a rate, might be 0 or slightly negative if logic supports
        }
        if (targetFutureValue === initialInvestment + monthlyContribution * N) { // Exactly matches contributions, so 0% rate
            calculatedInterestRate = 0;
        } else {
            while (iterations < 100) { // Limit iterations to prevent infinite loops
                mid_i = (low_i + high_i) / 2;
                if (mid_i === 0) { // Avoid division by zero if contributions are present
                     fv_at_mid_i = initialInvestment + monthlyContribution * N;
                } else {
                    fv_at_mid_i = initialInvestment * Math.pow(1 + mid_i, N) + monthlyContribution * (Math.pow(1 + mid_i, N) - 1) / mid_i;
                }

                if (Math.abs(fv_at_mid_i - targetFutureValue) < 0.01) { // Tolerance for convergence
                    break;
                }

                if (fv_at_mid_i < targetFutureValue) {
                    low_i = mid_i;
                } else {
                    high_i = mid_i;
                }
                iterations++;
            }
            calculatedInterestRate = mid_i * 12 * 100; // Annual percentage rate
        }


        if (calculatedInterestRate === undefined || calculatedInterestRate < 0 || calculatedInterestRate > 1000 ) { // Cap at 1000% for sanity
             toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target might be unachievable or parameters are extreme.", variant: "destructive"});
             calculatedInterestRate = undefined; // Prevent projection with this rate
        } else {
            form.setValue('interestRate', parseFloat(calculatedInterestRate.toFixed(2)));
            interestRate = calculatedInterestRate; // Update for projection
        }
        finalFutureValue = targetFutureValue;
      }

      // After any mode-specific calculation, ensure all necessary parameters are defined for the full projection
      if (initialInvestment === undefined || monthlyContribution === undefined || interestRate === undefined || investmentDuration === undefined ) {
        toast({ title: "Projection Error", description: "One or more parameters are still missing for full projection. Please check inputs or calculated values.", variant: "destructive" });
        setResults(null);
        setYearlyData([]);
        return;
      }

      // Perform the full projection with the complete set of parameters
      const projection = calculateFullProjection(initialInvestment, monthlyContribution, interestRate, investmentDuration);
      
      setResults({
        futureValue: mode === 'futureValue' ? projection.futureValue : (finalFutureValue || projection.futureValue), // Use target FV if it was an input
        totalInterest: projection.totalInterest,
        totalContributions: projection.totalContributions,
        calculatedMonthlyContribution: mode === 'calculateMonthlyContribution' ? monthlyContribution : undefined,
        calculatedInterestRate: mode === 'calculateInterestRate' ? interestRate : undefined,
        calculatedInvestmentDuration: mode === 'calculateInvestmentDuration' ? investmentDuration : undefined,
        originalTargetFutureValue: originalTargetFutureValueForDisplay, // Store for display
      });
      setYearlyData(projection.yearlyData);
      setAiTips([]); // Reset AI tips, will be fetched in useEffect
      setFormInputsForAI({ ...data, monthlyContribution, interestRate, investmentDuration }); // Pass the complete, potentially calculated values

    } catch (error) {
      console.error("Calculation Error:", error);
      toast({ title: "Error", description: "An error occurred during calculation. Please check inputs.", variant: "destructive" });
      setResults(null);
      setYearlyData([]);
    }
  };

  useEffect(() => {
    // Watch for changes in the calculationMode field specifically
    const currentMode = form.watch('calculationMode');
    setCalculationMode(currentMode); // Update local state for UI logic
    // Optionally, you can reset other form fields or results here if needed when mode changes
    // form.reset(); // or selectively reset fields
    // setResults(null);
    // setYearlyData([]);
  }, [form.watch('calculationMode'), form]);


 useEffect(() => {
    if (results && formInputsForAI) {
      const currentMode = form.getValues('calculationMode'); // Get current mode to ensure all data is aligned

      // Ensure all essential parameters for AI are present AND valid numbers before fetching
      const allParamsPresentAndValid = 
          formInputsForAI.initialInvestment !== undefined && !isNaN(formInputsForAI.initialInvestment) &&
          formInputsForAI.monthlyContribution !== undefined && !isNaN(formInputsForAI.monthlyContribution) &&
          formInputsForAI.interestRate !== undefined && !isNaN(formInputsForAI.interestRate) &&
          formInputsForAI.investmentDuration !== undefined && !isNaN(formInputsForAI.investmentDuration) &&
          results.futureValue !== undefined && !isNaN(results.futureValue) &&
          results.totalInterest !== undefined && !isNaN(results.totalInterest) &&
          results.totalContributions !== undefined && !isNaN(results.totalContributions);

      if (!allParamsPresentAndValid) {
          // Do not fetch AI tips if not all parameters are available/valid after calculation
          // This can happen if a calculation mode failed to produce a valid number for a parameter
          setIsLoadingTips(false);
          setAiTips([]);
          console.warn("AI Tips fetch skipped: Not all parameters are available or valid.", {formInputsForAI, results});
          return;
      }

      const fetchAITips = async () => {
        setIsLoadingTips(true);
        try {
          const aiInput: InvestmentTipsInput = {
            initialInvestment: formInputsForAI.initialInvestment!, // Should be valid by now
            monthlyContribution: formInputsForAI.monthlyContribution!,
            interestRate: formInputsForAI.interestRate!,
            investmentDuration: formInputsForAI.investmentDuration!,
            futureValue: results.futureValue,
            totalInterest: results.totalInterest,
            totalContributions: results.totalContributions,
          };
          const tipsResult: InvestmentTipsOutput = await generateInvestmentTips(aiInput);

          if (tipsResult.error) {
            console.warn("AI tips generation failed with error message:", tipsResult.error); // Changed from console.error
            toast({
              title: "AI Tips Error",
              description: tipsResult.error,
              variant: "destructive",
            });
            setAiTips([]);
          } else if (tipsResult.tips && tipsResult.tips.length > 0) {
            setAiTips(tipsResult.tips);
          } else {
            setAiTips([]);
             toast({ // Non-destructive toast for no tips
               title: "AI Tips",
               description: "No specific tips were generated for this scenario.",
             });
          }
        } catch (error) { // Catch network or other client-side errors during fetch
          console.error("Network or client-side error fetching AI tips:", error);
          toast({
            title: "Error",
            description: "Could not connect to the AI service. Please check your connection and try again.",
            variant: "destructive",
          });
          setAiTips([]);
        } finally {
          setIsLoadingTips(false);
        }
      };
      fetchAITips();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, formInputsForAI, toast, form]); // Added form to deps for form.getValues

  useEffect(() => {
    if (yearlyData.length > 0 && formInputsForAI && formInputsForAI.initialInvestment !== undefined) {
      // Ensure yearlyData and initialInvestment are valid before processing
      const newChartData = yearlyData.map(data => {
        // Calculate cumulative contributions up to the current year (data.year)
        // This should include initialInvestment + sum of (yearly contributions up to year-1)
        const cumulativeContributionsThisFar = formInputsForAI!.initialInvestment! + 
          yearlyData.slice(0, data.year).reduce((acc, curr) => acc + curr.contributions, 0);
        
        return {
          name: `Year ${data.year}`,
          totalValue: data.endingBalance,
          amountInvested: cumulativeContributionsThisFar,
          interestAccumulated: data.endingBalance - cumulativeContributionsThisFar,
        };
      });
      setChartDisplayData(newChartData);
    } else {
      setChartDisplayData([]); // Reset if no data
    }
  }, [yearlyData, formInputsForAI]); // Depends on yearlyData and formInputsForAI


  // Helper to determine if a field should be disabled based on the current calculation mode
  const isFieldDisabled = (fieldName: keyof InvestmentFormData) => {
    const currentMode = form.getValues('calculationMode'); // Get current mode directly
    if (currentMode === 'futureValue') return false; // All inputs enabled

    if (currentMode === 'calculateMonthlyContribution' && fieldName === 'monthlyContribution') return true;
    if (currentMode === 'calculateInterestRate' && fieldName === 'interestRate') return true;
    if (currentMode === 'calculateInvestmentDuration' && fieldName === 'investmentDuration') return true;
    
    // Target Future Value is an input for all modes except 'futureValue'
    if (currentMode !== 'futureValue' && fieldName === 'targetFutureValue') return false;
    // Target Future Value is disabled (not an input) if mode is 'futureValue'
    if (currentMode === 'futureValue' && fieldName === 'targetFutureValue') return true;

    return false; // Default to enabled
  };

  // Helper to determine if a field is conceptually required for the current calculation mode
  // Note: Actual form validation is handled by Zod and submit handler logic
  const isFieldRequired = (fieldName: keyof InvestmentFormData) => {
    const currentMode = form.getValues('calculationMode');
    if (currentMode === 'futureValue') {
      return ['initialInvestment', 'monthlyContribution', 'interestRate', 'investmentDuration'].includes(fieldName);
    }
    if (currentMode === 'calculateMonthlyContribution') {
      return ['initialInvestment', 'interestRate', 'investmentDuration', 'targetFutureValue'].includes(fieldName);
    }
    if (currentMode === 'calculateInterestRate') {
      return ['initialInvestment', 'monthlyContribution', 'investmentDuration', 'targetFutureValue'].includes(fieldName);
    }
    if (currentMode === 'calculateInvestmentDuration') {
      return ['initialInvestment', 'monthlyContribution', 'interestRate', 'targetFutureValue'].includes(fieldName);
    }
    return false; // Default
  };


  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col items-center">
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-headline font-bold text-primary">NeonVest</h1>
        <p className="text-muted-foreground mt-2 text-lg">Chart your financial future. Brightly.</p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full flex flex-col items-center">
          <div className="w-full max-w-xl mb-12">
            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <HelpCircle className="mr-2 h-7 w-7" /> Calculation Mode
                </CardTitle>
                <CardDescription>Select what you want to calculate.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="calculationMode"
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={(value) => {
                        field.onChange(value as CalculationMode);
                        setCalculationMode(value as CalculationMode); // Keep local state in sync
                        setResults(null); // Reset results when mode changes
                        setYearlyData([]);
                        setAiTips([]);
                        // form.reset(); // Consider if a full form reset is desired on mode change
                      }}
                      defaultValue={field.value}
                      className="grid grid-cols-2 gap-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="futureValue" id="futureValue" />
                        </FormControl>
                        <Label htmlFor="futureValue" className="font-normal text-base">Calculate Future Value</Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="monthlyContribution" id="monthlyContributionMode" />
                        </FormControl>
                        <Label htmlFor="monthlyContributionMode" className="font-normal text-base">Calculate Monthly Contribution</Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="interestRate" id="interestRateMode" />
                        </FormControl>
                        <Label htmlFor="interestRateMode" className="font-normal text-base">Calculate Interest Rate</Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="investmentDuration" id="investmentDurationMode" />
                        </FormControl>
                        <Label htmlFor="investmentDurationMode" className="font-normal text-base">Calculate Investment Duration</Label>
                      </FormItem>
                    </RadioGroup>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="w-full max-w-xl mb-12">
            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Investment Inputs
                </CardTitle>
                <CardDescription>Enter your investment details below.
                    {calculationMode !== 'futureValue' && " The highlighted field will be calculated."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {calculationMode !== 'futureValue' && (
                    <FormField
                      control={form.control}
                      name="targetFutureValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-base"><Target className="mr-2 h-4 w-4 text-primary" />Target Future Value ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="text" // Changed for formatting
                              placeholder="e.g., 1,000,000"
                              value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                              onChange={(e) => field.onChange(parseInput(e.target.value))}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              className="text-base"
                              disabled={isFieldDisabled('targetFutureValue')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="initialInvestment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center text-base"><DollarSign className="mr-2 h-4 w-4 text-primary" />Initial Investment ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="text" // Changed for formatting
                            placeholder="e.g., 1,000"
                            value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                             onChange={(e) => field.onChange(parseInput(e.target.value))}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            className="text-base"
                            disabled={isFieldDisabled('initialInvestment')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="monthlyContribution"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={`flex items-center text-base ${calculationMode === 'calculateMonthlyContribution' ? 'text-primary font-semibold' : ''}`}>
                          <DollarSign className="mr-2 h-4 w-4 text-primary" />
                          {calculationMode === 'calculateMonthlyContribution' ? 'Calculated Monthly Contribution ($)' : 'Monthly Contribution ($)'}
                        </FormLabel>
                        <FormControl>
                           <Input
                            type="text" // Changed for formatting
                            placeholder="e.g., 100"
                            value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                             onChange={(e) => field.onChange(parseInput(e.target.value))}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            className={`text-base ${calculationMode === 'calculateMonthlyContribution' ? 'border-primary ring-primary' : ''}`}
                            disabled={isFieldDisabled('monthlyContribution')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="interestRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={`flex items-center text-base ${calculationMode === 'calculateInterestRate' ? 'text-primary font-semibold' : ''}`}>
                          <Percent className="mr-2 h-4 w-4 text-primary" />
                          {calculationMode === 'calculateInterestRate' ? 'Calculated Annual Interest Rate (%)' : 'Annual Interest Rate (%)'}
                          </FormLabel>
                        <FormControl>
                          <Input type="number" step="any" placeholder="e.g., 7" {...field} 
                            onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} 
                            className={`text-base ${calculationMode === 'calculateInterestRate' ? 'border-primary ring-primary' : ''}`}
                            disabled={isFieldDisabled('interestRate')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="investmentDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={`flex items-center text-base ${calculationMode === 'calculateInvestmentDuration' ? 'text-primary font-semibold' : ''}`}>
                          <CalendarDays className="mr-2 h-4 w-4 text-primary" />
                          {calculationMode === 'calculateInvestmentDuration' ? 'Calculated Investment Duration (Years)' : 'Investment Duration (Years)'}
                          </FormLabel>
                        <FormControl>
                          <Input type="number" step="any" placeholder="e.g., 10" {...field} 
                           onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                           className={`text-base ${calculationMode === 'calculateInvestmentDuration' ? 'border-primary ring-primary' : ''}`}
                           disabled={isFieldDisabled('investmentDuration')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full text-lg py-6 bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all duration-300 ease-in-out transform hover:scale-105">
                    Calculate
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>

      {results && (
        <div className="w-full max-w-5xl space-y-10 mt-12"> {/* Added mt-12 for spacing */}
          {chartDisplayData.length > 0 && (
            <Card className="w-full shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <AreaChart className="mr-2 h-7 w-7" /> Investment Growth Chart
                </CardTitle>
                <CardDescription>Visual representation of your investment growth over time.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ChartContainer config={chartConfig} className="min-h-[300px] w-full aspect-video">
                  <ComposedChart data={chartDisplayData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} padding={{ left: 10, right: 10 }} />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} tickLine={false} axisLine={false} tickMargin={8} width={90} />
                    <RechartsTooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      itemSorter={(item) => tooltipOrder.indexOf(item.dataKey as keyof ChartDisplayDataItem)}
                      content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} labelClassName="font-bold" indicator="dot" />}
                    />
                    <RechartsLegend content={<ChartLegendContent />} />
                    <RechartsLine key="totalValue" dataKey="totalValue" type="monotone" stroke="var(--color-totalValue)" strokeWidth={3} dot={{ r: 4, fillOpacity: 1 }} name={chartConfig.totalValue.label} />
                    <RechartsLine key="amountInvested" dataKey="amountInvested" type="monotone" stroke="var(--color-amountInvested)" strokeWidth={2} dot={false} name={chartConfig.amountInvested.label} />
                    <RechartsLine key="interestAccumulated" dataKey="interestAccumulated" type="monotone" stroke="var(--color-interestAccumulated)" strokeWidth={2} dot={false} name={chartConfig.interestAccumulated.label} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {yearlyData.length > 0 && (
              <Card className="shadow-2xl shadow-primary/20">
                <CardHeader>
                  <CardTitle className="text-2xl font-headline text-primary flex items-center">
                    <CalendarDays className="mr-2 h-7 w-7" /> Yearly Projection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-primary">Year</TableHead>
                        <TableHead className="text-primary">Contributions This Year</TableHead>
                        <TableHead className="text-primary">Interest Earned This Year</TableHead>
                        <TableHead className="text-primary">Ending Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearlyData.map((data) => (
                        <TableRow key={data.year}>
                          <TableCell>{data.year}</TableCell>
                          <TableCell>{formatCurrency(data.contributions)}</TableCell>
                          <TableCell>{formatCurrency(data.interestEarned)}</TableCell>
                          <TableCell className="font-semibold text-primary">{formatCurrency(data.endingBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Results Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {formInputsForAI?.initialInvestment !== undefined && ( // Display initial investment from form inputs
                  <div>
                    <p className="text-muted-foreground">Initial Investment:</p>
                    <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.initialInvestment)}</p>
                  </div>
                )}
                {results.originalTargetFutureValue !== undefined && ( // Display if target was an input
                     <div>
                        <p className="text-muted-foreground">Target Future Value:</p>
                        <p className="text-xl font-semibold">{formatCurrency(results.originalTargetFutureValue)}</p>
                    </div>
                )}
                {results.calculatedMonthlyContribution !== undefined && (
                     <div>
                        <p className="text-muted-foreground">Calculated Monthly Contribution:</p>
                        <p className="text-xl font-semibold text-primary">{formatCurrency(results.calculatedMonthlyContribution)}</p>
                    </div>
                )}
                {results.calculatedInterestRate !== undefined && (
                     <div>
                        <p className="text-muted-foreground">Calculated Annual Interest Rate:</p>
                        <p className="text-xl font-semibold text-primary">{formatPercentage(results.calculatedInterestRate)}</p>
                    </div>
                )}
                {results.calculatedInvestmentDuration !== undefined && (
                     <div>
                        <p className="text-muted-foreground">Calculated Investment Duration:</p>
                        <p className="text-xl font-semibold text-primary">{formatYears(results.calculatedInvestmentDuration)}</p>
                    </div>
                )}

                <div>
                  <p className="text-muted-foreground">Projected Future Value:</p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(results.futureValue)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Contributions (Incl. Initial):</p>
                  <p className="text-xl font-semibold">{formatCurrency(results.totalContributions)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Interest Earned:</p>
                  <p className="text-xl font-semibold">{formatCurrency(results.totalInterest)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {(isLoadingTips || aiTips.length > 0) && (
             <Card className="w-full shadow-2xl shadow-primary/20">
               <CardHeader>
                 <CardTitle className="text-2xl font-headline text-primary flex items-center">
                   <Lightbulb className="mr-2 h-7 w-7" /> AI Investment Tips
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 {isLoadingTips ? (
                   <div className="flex items-center justify-center space-x-2 p-4">
                     <Loader2 className="h-8 w-8 animate-spin text-primary" />
                     <p className="text-muted-foreground">Generating personalized tips...</p>
                   </div>
                 ) : (
                  <>
                   <Accordion type="single" collapsible className="w-full">
                     {aiTips.map((tip, index) => (
                       <AccordionItem value={`item-${index}`} key={index}>
                         <AccordionTrigger className="text-left hover:text-accent transition-colors text-lg">
                           Tip {index + 1}: {tip.title}
                         </AccordionTrigger>
                         <AccordionContent className="text-base">
                           {tip.description}
                         </AccordionContent>
                       </AccordionItem>
                     ))}
                   </Accordion>
                    <p className="text-xs text-muted-foreground mt-6 text-center">
                      Disclaimer: AI-generated tips are for informational purposes only and should not be considered financial advice. Consult with a qualified financial advisor before making investment decisions.
                    </p>
                  </>
                 )}
               </CardContent>
             </Card>
          )}
        </div>
      )}
    </div>
  );
}

