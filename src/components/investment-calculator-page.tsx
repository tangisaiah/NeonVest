
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
import { DollarSign, Percent, CalendarDays, TrendingUp, Lightbulb, Loader2, AreaChart, Target } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  // Ensure we show decimals for years if they exist, otherwise whole number.
  return Number.isInteger(value) ? `${value} years` : `${value.toFixed(2)} years`;
}

const formatForDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '';
  }
  const numValue = Number(value);
  return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 20 });
};


const parseInput = (inputValue: string): number | undefined => {
  const cleaned = inputValue.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return undefined;
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
    color: "hsl(195, 100%, 50%)",
  },
  interestAccumulated: {
    label: "Interest Accumulated",
    color: "hsl(0, 100%, 50%)",
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
    interestRate: number,
    investmentDuration: number
  ): { yearlyData: YearlyData[], futureValue: number, totalInterest: number, totalContributions: number } => {
    const annualInterestRateDecimal = interestRate / 100;
    const monthlyInterestRate = annualInterestRateDecimal / 12;

    let currentBalance = initialInvestment;
    const newYearlyData: YearlyData[] = [];
    let totalContributionsOverall = initialInvestment; 

    const wholeYearsDuration = Math.floor(investmentDuration);
    const remainingMonths = Math.round((investmentDuration - wholeYearsDuration) * 12);


    for (let year = 1; year <= wholeYearsDuration; year++) {
      const startingBalanceForYear = currentBalance;
      let totalInterestThisYear = 0;
      let totalContributionsThisYear = 0; 

      for (let month = 1; month <= 12; month++) {
        const interestThisMonth = currentBalance * monthlyInterestRate;
        currentBalance += interestThisMonth;
        totalInterestThisYear += interestThisMonth;

        if (monthlyContribution > 0) {
            currentBalance += monthlyContribution;
            totalContributionsThisYear += monthlyContribution;
            totalContributionsOverall += monthlyContribution;
        }
      }
      newYearlyData.push({
        year,
        startingBalance: startingBalanceForYear,
        interestEarned: totalInterestThisYear,
        contributions: totalContributionsThisYear,
        endingBalance: currentBalance,
      });
    }

    if (remainingMonths > 0) {
        for (let month = 1; month <= remainingMonths; month++) {
            const interestThisMonth = currentBalance * monthlyInterestRate;
            currentBalance += interestThisMonth;
            if (monthlyContribution > 0) {
                currentBalance += monthlyContribution;
                totalContributionsOverall += monthlyContribution;
            }
        }
    }

    const futureValue = currentBalance;
    const totalInterestEarned = futureValue - totalContributionsOverall;

    return {
        yearlyData: newYearlyData,
        futureValue,
        totalInterest: totalInterestEarned,
        totalContributions: totalContributionsOverall,
    };
  };


  const onSubmit: SubmitHandler<InvestmentFormData> = (data) => {
    const currentCalculationMode = data.calculationMode;

    const formInitialInvestment = typeof data.initialInvestment === 'number' ? data.initialInvestment : undefined;
    const formMonthlyContribution = typeof data.monthlyContribution === 'number' ? data.monthlyContribution : undefined;
    const formInterestRate = typeof data.interestRate === 'number' ? data.interestRate : undefined;
    const formInvestmentDuration = typeof data.investmentDuration === 'number' ? data.investmentDuration : undefined;
    const formTargetFutureValue = typeof data.targetFutureValue === 'number' ? data.targetFutureValue : undefined;
    
    let finalInitialInvestment: number | undefined = formInitialInvestment;
    let finalMonthlyContribution: number | undefined;
    let finalInterestRate: number | undefined;
    let finalInvestmentDuration: number | undefined;
    let originalTargetFutureValueForDisplay: number | undefined = (currentCalculationMode !== 'futureValue' && formTargetFutureValue !== undefined) ? formTargetFutureValue : undefined;

    let resultsCalculatedMonthlyContribution: number | undefined = undefined;
    let resultsCalculatedInterestRate: number | undefined = undefined;
    let resultsCalculatedInvestmentDuration: number | undefined = undefined;

    try {
        if (currentCalculationMode === 'futureValue') {
            finalMonthlyContribution = formMonthlyContribution;
            finalInterestRate = formInterestRate;
            finalInvestmentDuration = formInvestmentDuration;

            if (finalInitialInvestment === undefined || finalMonthlyContribution === undefined || finalInterestRate === undefined || finalInvestmentDuration === undefined) {
                toast({ title: "Input Error", description: "For 'Future Value' calculation, please fill all investment parameters.", variant: "destructive" });
                return;
            }
        } else if (currentCalculationMode === 'calculateMonthlyContribution') {
            const inputInterestRate = formInterestRate;
            const inputInvestmentDuration = formInvestmentDuration;
            const inputTargetFutureValue = formTargetFutureValue;

            if (finalInitialInvestment === undefined || inputInterestRate === undefined || inputInvestmentDuration === undefined || inputTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "Please fill: Initial Investment, Interest Rate, Investment Duration, and Target Future Value.", variant: "destructive" });
                return;
            }

            const i = (inputInterestRate / 100) / 12;
            const N = inputInvestmentDuration * 12;
            let calculatedMC: number;

            if (N === 0) {
                 toast({ title: "Calculation Error", description: "Investment duration is too short or zero for this calculation.", variant: "destructive" }); return;
            }

            if (i === 0) { // No interest
                calculatedMC = (inputTargetFutureValue - finalInitialInvestment) / N;
            } else {
                const futureValueOfInitial = finalInitialInvestment * Math.pow(1 + i, N);
                const denominator = (Math.pow(1 + i, N) - 1);
                if (denominator === 0) { // Avoid division by zero
                    toast({ title: "Calculation Error", description: "Cannot calculate monthly contribution with these parameters (potential division by zero).", variant: "destructive" }); return;
                }
                calculatedMC = (inputTargetFutureValue - futureValueOfInitial) * i / denominator;
            }

            if (calculatedMC < 0 || !isFinite(calculatedMC)) {
                toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions or calculation is invalid. Consider adjusting parameters.", variant: "destructive"});
                calculatedMC = 0; // Or simply return to prevent projection with invalid MC
            }
            finalMonthlyContribution = parseFloat(calculatedMC.toFixed(2));
            resultsCalculatedMonthlyContribution = finalMonthlyContribution;
            form.setValue('monthlyContribution', finalMonthlyContribution, { shouldValidate: true });
            
            finalInterestRate = inputInterestRate;
            finalInvestmentDuration = inputInvestmentDuration;

        } else if (currentCalculationMode === 'calculateInvestmentDuration') {
            const inputMonthlyContribution = formMonthlyContribution;
            const inputInterestRate = formInterestRate;
            const inputTargetFutureValue = formTargetFutureValue;

            if (finalInitialInvestment === undefined || inputMonthlyContribution === undefined || inputInterestRate === undefined || inputTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "Please fill: Initial Investment, Monthly Contribution, Interest Rate, and Target Future Value.", variant: "destructive" });
                return;
            }

            const i = (inputInterestRate / 100) / 12;
            let calculatedID_N_periods: number | undefined; 

            if (inputTargetFutureValue <= finalInitialInvestment && inputMonthlyContribution <= 0) {
                toast({ title: "Calculation Error", description: "Target value must be greater than initial investment if contributions are zero or negative.", variant: "destructive" }); return;
            }

            if (i === 0) { 
                if (inputMonthlyContribution <= 0) {
                    if (inputTargetFutureValue > finalInitialInvestment) {
                        toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no (or negative) contributions.", variant: "destructive" }); return;
                    }
                    calculatedID_N_periods = 0; 
                } else {
                    calculatedID_N_periods = (inputTargetFutureValue - finalInitialInvestment) / inputMonthlyContribution;
                }
            } else { 
                const valForLog = (inputTargetFutureValue * i + inputMonthlyContribution) / (finalInitialInvestment * i + inputMonthlyContribution);
                if (valForLog <= 0 || (finalInitialInvestment * i + inputMonthlyContribution === 0) ) {
                    toast({ title: "Calculation Error", description: "Cannot calculate duration. Investment may not grow to target or parameters lead to invalid math.", variant: "destructive" }); return;
                }
                 if (Math.abs(Math.log(1+i)) < 1e-9) { 
                    toast({ title: "Calculation Error", description: "Interest rate is too close to zero for logarithmic calculation of duration.", variant: "destructive" }); return;
                 }
                calculatedID_N_periods = Math.log(valForLog) / Math.log(1 + i);
            }

            if (calculatedID_N_periods === undefined || calculatedID_N_periods < 0 || !isFinite(calculatedID_N_periods)) {
                toast({title: "Calculation Alert", description: "Target is likely unachievable or calculation resulted in an invalid duration. Please check parameters.", variant: "destructive"});
                return;
            }
            finalInvestmentDuration = parseFloat((calculatedID_N_periods / 12).toFixed(2));
            resultsCalculatedInvestmentDuration = finalInvestmentDuration;
            form.setValue('investmentDuration', finalInvestmentDuration, { shouldValidate: true });
            
            finalMonthlyContribution = inputMonthlyContribution;
            finalInterestRate = inputInterestRate;

        } else if (currentCalculationMode === 'calculateInterestRate') {
            const inputMonthlyContribution = formMonthlyContribution;
            const inputInvestmentDuration = formInvestmentDuration;
            const inputTargetFutureValue = formTargetFutureValue;
            
            if (finalInitialInvestment === undefined || inputMonthlyContribution === undefined || inputInvestmentDuration === undefined || inputTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "Please fill: Initial Investment, Monthly Contribution, Investment Duration, and Target Future Value.", variant: "destructive" });
                return;
            }
            if (inputInvestmentDuration <= 0) {
                toast({title: "Input Error", description: "Investment duration must be positive to calculate interest rate.", variant: "destructive"}); return;
            }

            const N = inputInvestmentDuration * 12; 
            let low_r_annual = 0;    
            let high_r_annual = 1; // Search annual rate from 0% to 100%
            let mid_r_monthly;
            let fv_at_mid_r;
            let iterations = 0;
            const max_iterations = 100;
            const tolerance = 0.01; 
            let calculatedAnnualIR: number | undefined;

            const totalContributionsOnly = finalInitialInvestment + inputMonthlyContribution * N;
            if (inputTargetFutureValue <= totalContributionsOnly) {
                if (Math.abs(inputTargetFutureValue - totalContributionsOnly) < tolerance) {
                     calculatedAnnualIR = 0; 
                } else {
                    toast({ title: "Target Value Alert", description: "Target value is less than or equal to total contributions. A 0% or negative interest rate would be required.", variant: "default" });
                    calculatedAnnualIR = 0;
                }
            } else {
                for (iterations = 0; iterations < max_iterations; iterations++) {
                    mid_r_monthly = (low_r_annual + high_r_annual) / 2 / 12; 

                    if (Math.abs(mid_r_monthly) < 1e-9) { 
                        fv_at_mid_r = finalInitialInvestment + inputMonthlyContribution * N;
                    } else {
                        fv_at_mid_r = finalInitialInvestment * Math.pow(1 + mid_r_monthly, N) +
                                    inputMonthlyContribution * (Math.pow(1 + mid_r_monthly, N) - 1) / mid_r_monthly;
                    }

                    if (Math.abs(fv_at_mid_r - inputTargetFutureValue) < tolerance) {
                        calculatedAnnualIR = mid_r_monthly * 12 * 100;
                        break;
                    }

                    if (fv_at_mid_r < inputTargetFutureValue) {
                        low_r_annual = mid_r_monthly * 12 ; 
                    } else {
                        high_r_annual = mid_r_monthly * 12; 
                    }
                     if (Math.abs(high_r_annual - low_r_annual) < 1e-7) break; 
                }
                 if (calculatedAnnualIR === undefined && iterations === max_iterations) { 
                     mid_r_monthly = (low_r_annual + high_r_annual) / 2 / 12; // Use the best estimate
                     // Check if this estimate is reasonable before assigning
                     fv_at_mid_r = finalInitialInvestment * Math.pow(1 + mid_r_monthly, N) +
                                    inputMonthlyContribution * (Math.pow(1 + mid_r_monthly, N) - 1) / mid_r_monthly;
                     if (Math.abs(fv_at_mid_r - inputTargetFutureValue) < tolerance * 100) { // Looser tolerance for last attempt
                        calculatedAnnualIR = mid_r_monthly * 12 * 100;
                     } else {
                        // Still not converged, indicate error
                     }
                 }
            }

            if (calculatedAnnualIR === undefined || calculatedAnnualIR < 0 || calculatedAnnualIR > 1000  || !isFinite(calculatedAnnualIR)) { 
                 toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target might be unachievable or parameters are extreme.", variant: "destructive"});
                 return;
            }
            finalInterestRate = parseFloat(calculatedAnnualIR.toFixed(2));
            resultsCalculatedInterestRate = finalInterestRate;
            form.setValue('interestRate', finalInterestRate, { shouldValidate: true });
            
            finalMonthlyContribution = inputMonthlyContribution;
            finalInvestmentDuration = inputInvestmentDuration;
        }

        if (finalInitialInvestment === undefined || isNaN(finalInitialInvestment) ||
            finalMonthlyContribution === undefined || isNaN(finalMonthlyContribution) ||
            finalInterestRate === undefined || isNaN(finalInterestRate) ||
            finalInvestmentDuration === undefined || isNaN(finalInvestmentDuration) ) {
          toast({ title: "Projection Error", description: "One or more core parameters are missing or invalid for projection after mode-specific calculations. Cannot project.", variant: "destructive" });
          setResults(null);
          setYearlyData([]);
          return;
        }

        const projection = calculateFullProjection(
            finalInitialInvestment,
            finalMonthlyContribution,
            finalInterestRate,
            finalInvestmentDuration
        );

        setResults({
            futureValue: (currentCalculationMode !== 'futureValue' && originalTargetFutureValueForDisplay !== undefined) ? originalTargetFutureValueForDisplay : projection.futureValue,
            totalInterest: projection.totalInterest,
            totalContributions: projection.totalContributions,
            calculatedMonthlyContribution: resultsCalculatedMonthlyContribution,
            calculatedInterestRate: resultsCalculatedInterestRate,
            calculatedInvestmentDuration: resultsCalculatedInvestmentDuration,
            originalTargetFutureValue: originalTargetFutureValueForDisplay,
        });
        setYearlyData(projection.yearlyData);
        setAiTips([]);
        setFormInputsForAI({
            initialInvestment: finalInitialInvestment,
            monthlyContribution: finalMonthlyContribution,
            interestRate: finalInterestRate,
            investmentDuration: finalInvestmentDuration,
            targetFutureValue: originalTargetFutureValueForDisplay,
            calculationMode: currentCalculationMode
        });

    } catch (error) {
        console.error("Calculation Error:", error);
        let errorMsg = "An error occurred during calculation. Please check inputs.";
        if (error instanceof Error) errorMsg = error.message;
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        setResults(null);
        setYearlyData([]);
    }
  };

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'calculationMode') {
        const newMode = value.calculationMode as CalculationMode;
        setCalculationMode(newMode);
         setResults(null);
         setYearlyData([]);
         setAiTips([]);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);


 useEffect(() => {
    if (results && formInputsForAI) {
      const allParamsPresentAndValid =
          formInputsForAI.initialInvestment !== undefined && !isNaN(formInputsForAI.initialInvestment) &&
          formInputsForAI.monthlyContribution !== undefined && !isNaN(formInputsForAI.monthlyContribution) &&
          formInputsForAI.interestRate !== undefined && !isNaN(formInputsForAI.interestRate) &&
          formInputsForAI.investmentDuration !== undefined && !isNaN(formInputsForAI.investmentDuration) &&
          results.futureValue !== undefined && !isNaN(results.futureValue) &&
          results.totalInterest !== undefined && !isNaN(results.totalInterest) &&
          results.totalContributions !== undefined && !isNaN(results.totalContributions);

      if (!allParamsPresentAndValid) {
          setIsLoadingTips(false);
          setAiTips([]);
          console.warn("AI Tips fetch skipped: Not all parameters are available or valid for AI input.", {formInputsForAI, results});
          return;
      }

      const fetchAITips = async () => {
        setIsLoadingTips(true);
        try {
          const aiInput: InvestmentTipsInput = {
            initialInvestment: formInputsForAI.initialInvestment!,
            monthlyContribution: formInputsForAI.monthlyContribution!,
            interestRate: formInputsForAI.interestRate!,
            investmentDuration: formInputsForAI.investmentDuration!,
            futureValue: results.futureValue,
            totalInterest: results.totalInterest,
            totalContributions: results.totalContributions,
          };
          const tipsResult: InvestmentTipsOutput = await generateInvestmentTips(aiInput);

          if (tipsResult.error) {
            console.warn("AI tips generation failed with error message:", tipsResult.error);
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
             toast({
               title: "AI Tips",
               description: "No specific tips were generated for this scenario.",
               variant: "default"
             });
          }
        } catch (error) {
          console.warn("Network or client-side error fetching AI tips:", error);
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
  }, [results, formInputsForAI]); 

  useEffect(() => {
    if (yearlyData.length > 0 && formInputsForAI && formInputsForAI.initialInvestment !== undefined) {
        const baseContributions = formInputsForAI.initialInvestment;
        
        const newChartData = yearlyData.map(data => {
          const cumulativeContributionsUpToThisYearEnd = baseContributions + yearlyData
            .slice(0, data.year)
            .reduce((acc, curr) => acc + curr.contributions, 0);
          
          const interestAccumulatedUpToThisYearEnd = data.endingBalance - cumulativeContributionsUpToThisYearEnd;

        return {
          name: `Year ${data.year}`,
          totalValue: data.endingBalance,
          amountInvested: cumulativeContributionsUpToThisYearEnd,
          interestAccumulated: interestAccumulatedUpToThisYearEnd,
        };
      });
      setChartDisplayData(newChartData);
    } else {
      setChartDisplayData([]);
    }
  }, [yearlyData, formInputsForAI]);

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
                  <TrendingUp className="mr-2 h-7 w-7" /> Investment Inputs
                </CardTitle>
                <CardDescription>Select a tab to choose what to calculate. Fill in the other fields for that calculation.</CardDescription>
              </CardHeader>
              <CardContent>
                 <Tabs
                    value={calculationMode}
                    onValueChange={(value) => {
                      const newMode = value as CalculationMode;
                      form.setValue('calculationMode', newMode, { shouldValidate: true });
                    }}
                    className="mb-6"
                  >
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                      <TabsTrigger value="futureValue">Future Value</TabsTrigger>
                      <TabsTrigger value="calculateMonthlyContribution">Monthly Contrib.</TabsTrigger>
                      <TabsTrigger value="calculateInterestRate">Interest Rate</TabsTrigger>
                      <TabsTrigger value="calculateInvestmentDuration">Duration</TabsTrigger>
                    </TabsList>
                  </Tabs>

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
                              type="text"
                              placeholder="e.g., 1,000,000"
                              value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                              onChange={(e) => field.onChange(parseInput(e.target.value))}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              className="text-base"
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
                            type="text"
                            placeholder="e.g., 1,000"
                            value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                             onChange={(e) => field.onChange(parseInput(e.target.value))}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            className="text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {calculationMode !== 'calculateMonthlyContribution' && (
                    <FormField
                      control={form.control}
                      name="monthlyContribution"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-base">
                            <DollarSign className="mr-2 h-4 w-4 text-primary" />
                            Monthly Contribution ($)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text" 
                              placeholder="e.g., 100"
                              value={field.value === undefined || field.value === null || field.value === '' ? '' : formatForDisplay(Number(field.value))}
                              onChange={(e) => field.onChange(parseInput(e.target.value))}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {calculationMode !== 'calculateInterestRate' && (
                    <FormField
                      control={form.control}
                      name="interestRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-base">
                            <Percent className="mr-2 h-4 w-4 text-primary" />
                            Annual Interest Rate (%)
                          </FormLabel>
                          <FormControl>
                            <Input type="number" step="any" placeholder="e.g., 7"
                              onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                              value={field.value === undefined ? '' : field.value}
                              className="text-base"
                              name={field.name}
                              ref={field.ref}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {calculationMode !== 'calculateInvestmentDuration' && (
                    <FormField
                      control={form.control}
                      name="investmentDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-base">
                            <CalendarDays className="mr-2 h-4 w-4 text-primary" />
                            Investment Duration (Years)
                          </FormLabel>
                          <FormControl>
                            <Input type="number" step="any" placeholder="e.g., 10"
                            onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            value={field.value === undefined ? '' : field.value}
                            className="text-base"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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
        <div className="w-full max-w-5xl space-y-10 mt-12">
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
                          <TableCell>{Math.floor(data.year)}</TableCell>
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
                 {formInputsForAI?.initialInvestment !== undefined && (
                  <div>
                    <p className="text-muted-foreground">Initial Investment:</p>
                    <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.initialInvestment)}</p>
                  </div>
                )}
                {results.originalTargetFutureValue !== undefined && (
                     <div>
                        <p className="text-muted-foreground">Target Future Value:</p>
                        <p className="text-xl font-semibold">{formatCurrency(results.originalTargetFutureValue)}</p>
                    </div>
                )}
                 {formInputsForAI?.monthlyContribution !== undefined && calculationMode === 'futureValue' && (
                    <div>
                        <p className="text-muted-foreground">Monthly Contribution:</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.monthlyContribution)}</p>
                    </div>
                )}
                 {formInputsForAI?.monthlyContribution !== undefined && calculationMode === 'calculateInvestmentDuration' && (
                    <div>
                        <p className="text-muted-foreground">Monthly Contribution:</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.monthlyContribution)}</p>
                    </div>
                )}
                 {formInputsForAI?.monthlyContribution !== undefined && calculationMode === 'calculateInterestRate' && (
                    <div>
                        <p className="text-muted-foreground">Monthly Contribution:</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.monthlyContribution)}</p>
                    </div>
                )}


                {formInputsForAI?.interestRate !== undefined && calculationMode === 'futureValue' && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate:</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}
                 {formInputsForAI?.interestRate !== undefined && calculationMode === 'calculateMonthlyContribution' && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate:</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}
                 {formInputsForAI?.interestRate !== undefined && calculationMode === 'calculateInvestmentDuration' && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate:</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}


                {formInputsForAI?.investmentDuration !== undefined && calculationMode === 'futureValue' && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration:</p>
                        <p className="text-xl font-semibold">{formatYears(formInputsForAI.investmentDuration)}</p>
                    </div>
                )}
                 {formInputsForAI?.investmentDuration !== undefined && calculationMode === 'calculateMonthlyContribution' && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration:</p>
                        <p className="text-xl font-semibold">{formatYears(formInputsForAI.investmentDuration)}</p>
                    </div>
                )}
                 {formInputsForAI?.investmentDuration !== undefined && calculationMode === 'calculateInterestRate' && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration:</p>
                        <p className="text-xl font-semibold">{formatYears(formInputsForAI.investmentDuration)}</p>
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
