
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
  return `${value.toFixed(2)} years`;
}

const formatForDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '';
  }
  const numValue = Number(value);
  if (numValue % 1 === 0) {
    return numValue.toLocaleString('en-US');
  }
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

    for (let year = 1; year <= investmentDuration; year++) {
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
    let { initialInvestment, monthlyContribution, interestRate, investmentDuration, targetFutureValue } = data;
    let calculatedMonthlyContribution: number | undefined = monthlyContribution; 
    let calculatedInterestRate: number | undefined = interestRate;
    let calculatedInvestmentDuration: number | undefined = investmentDuration;
    let finalFutureValue: number | undefined = undefined; 
    let originalTargetFutureValueForDisplay: number | undefined = targetFutureValue;

    const currentCalculationMode = form.getValues('calculationMode');

    try {
      if (currentCalculationMode === 'calculateMonthlyContribution') {
        if (initialInvestment === undefined || interestRate === undefined || investmentDuration === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Interest Rate, Duration, and Target Future Value.", variant: "destructive" });
          return;
        }
        const i = (interestRate / 100) / 12; 
        const N = investmentDuration * 12; 
        if (i === 0) { 
            calculatedMonthlyContribution = (targetFutureValue - initialInvestment) / N;
        } else {
            const futureValueOfInitial = initialInvestment * Math.pow(1 + i, N);
            calculatedMonthlyContribution = (targetFutureValue - futureValueOfInitial) * i / (Math.pow(1 + i, N) - 1);
        }

        if (calculatedMonthlyContribution < 0) {
          toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions. Consider adjusting parameters.", variant: "destructive"});
          calculatedMonthlyContribution = 0; 
        }
        form.setValue('monthlyContribution', parseFloat(calculatedMonthlyContribution.toFixed(2)));
        monthlyContribution = calculatedMonthlyContribution; 
        finalFutureValue = targetFutureValue;
      } else if (currentCalculationMode === 'calculateInvestmentDuration') {
        if (initialInvestment === undefined || monthlyContribution === undefined || interestRate === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Monthly Contribution, Interest Rate, and Target Future Value.", variant: "destructive" });
          return;
        }
        const i = (interestRate / 100) / 12; 
        if (targetFutureValue <= initialInvestment && monthlyContribution <=0) {
            toast({ title: "Calculation Error", description: "Target value must be greater than initial investment if contributions are zero or negative.", variant: "destructive" });
            return;
        }
        if (i === 0) { 
            if (monthlyContribution <=0 && targetFutureValue > initialInvestment) {
                 toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no positive contributions.", variant: "destructive" }); return;
            }
            calculatedInvestmentDuration = (targetFutureValue - initialInvestment) / (monthlyContribution * 12);
        } else { 
            if ((initialInvestment * i + monthlyContribution) <= 0 && (targetFutureValue * i + monthlyContribution) > 0) {
                 toast({ title: "Calculation Error", description: "Cannot reach target with these parameters (denominator would be non-positive).", variant: "destructive" }); return;
            }
             if (monthlyContribution === 0 && interestRate > 0) { 
                if (targetFutureValue <= initialInvestment) {
                     toast({ title: "Calculation Error", description: "Target must be greater than initial investment.", variant: "destructive" }); return;
                }
                calculatedInvestmentDuration = Math.log(targetFutureValue / initialInvestment) / (12 * Math.log(1 + i));
            } else if (initialInvestment * i + monthlyContribution <= 0) { 
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
            calculatedInvestmentDuration = undefined; 
        } else {
            form.setValue('investmentDuration', parseFloat(calculatedInvestmentDuration.toFixed(2)));
            investmentDuration = calculatedInvestmentDuration; 
        }
        finalFutureValue = targetFutureValue;
      } else if (currentCalculationMode === 'calculateInterestRate') {
        if (initialInvestment === undefined || monthlyContribution === undefined || investmentDuration === undefined || targetFutureValue === undefined) {
          toast({ title: "Input Error", description: "Please fill Initial Investment, Monthly Contribution, Duration, and Target Future Value.", variant: "destructive" });
          return;
        }
        const N = investmentDuration * 12; 
        let low_i = 0; 
        let high_i = 0.5; 
        let mid_i;
        let fv_at_mid_i;
        let iterations = 0;

        if (targetFutureValue < initialInvestment + monthlyContribution * N) {
             toast({ title: "Target Value Alert", description: "Target value is less than total contributions without any interest. Desired rate might be negative or zero.", variant: "default" });
        }
        if (Math.abs(targetFutureValue - (initialInvestment + monthlyContribution * N)) < 0.01) { 
            calculatedInterestRate = 0;
        } else {
            while (iterations < 100) { 
                mid_i = (low_i + high_i) / 2; 
                if (mid_i < 1e-9) { 
                     fv_at_mid_i = initialInvestment + monthlyContribution * N;
                } else {
                    fv_at_mid_i = initialInvestment * Math.pow(1 + mid_i, N) + monthlyContribution * (Math.pow(1 + mid_i, N) - 1) / mid_i;
                }

                if (Math.abs(fv_at_mid_i - targetFutureValue) < 0.01) { 
                    break;
                }

                if (fv_at_mid_i < targetFutureValue) {
                    low_i = mid_i;
                } else {
                    high_i = mid_i;
                }
                iterations++;
            }
             calculatedInterestRate = mid_i! * 12 * 100; 
        }


        if (calculatedInterestRate === undefined || calculatedInterestRate < 0 || calculatedInterestRate > 1000 ) { 
             toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target might be unachievable or parameters are extreme.", variant: "destructive"});
             calculatedInterestRate = undefined; 
        } else {
            form.setValue('interestRate', parseFloat(calculatedInterestRate.toFixed(2)));
            interestRate = calculatedInterestRate; 
        }
        finalFutureValue = targetFutureValue;
      }


      if (initialInvestment === undefined || calculatedMonthlyContribution === undefined || calculatedInterestRate === undefined || calculatedInvestmentDuration === undefined ) {
        toast({ title: "Projection Error", description: "One or more parameters are still missing for full projection. Please check inputs or calculated values.", variant: "destructive" });
        setResults(null);
        setYearlyData([]);
        return;
      }
      
      const projInitial = Number(initialInvestment);
      const projMonthly = Number(calculatedMonthlyContribution);
      const projRate = Number(calculatedInterestRate);
      const projDuration = Number(calculatedInvestmentDuration);

      if (isNaN(projInitial) || isNaN(projMonthly) || isNaN(projRate) || isNaN(projDuration)) {
        toast({ title: "Projection Error", description: "Invalid parameters for full projection after calculation attempt.", variant: "destructive" });
        return;
      }


      const projection = calculateFullProjection(projInitial, projMonthly, projRate, projDuration);
      
      setResults({
        futureValue: currentCalculationMode === 'futureValue' ? projection.futureValue : (finalFutureValue ?? projection.futureValue), 
        totalInterest: projection.totalInterest,
        totalContributions: projection.totalContributions,
        calculatedMonthlyContribution: currentCalculationMode === 'calculateMonthlyContribution' ? projMonthly : undefined,
        calculatedInterestRate: currentCalculationMode === 'calculateInterestRate' ? projRate : undefined,
        calculatedInvestmentDuration: currentCalculationMode === 'calculateInvestmentDuration' ? projDuration : undefined,
        originalTargetFutureValue: currentCalculationMode !== 'futureValue' ? originalTargetFutureValueForDisplay : undefined, 
      });
      setYearlyData(projection.yearlyData);
      setAiTips([]); 
      setFormInputsForAI({ 
          initialInvestment: projInitial, 
          monthlyContribution: projMonthly, 
          interestRate: projRate, 
          investmentDuration: projDuration,
          targetFutureValue: currentCalculationMode !== 'futureValue' ? targetFutureValue : undefined,
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
          console.warn("AI Tips fetch skipped: Not all parameters are available or valid.", {formInputsForAI, results});
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
  }, [results, formInputsForAI, toast]); 

  useEffect(() => {
    if (yearlyData.length > 0 && formInputsForAI && formInputsForAI.initialInvestment !== undefined) {
      const newChartData = yearlyData.map(data => {
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
                <CardDescription>Select a tab to choose what to calculate. Fill in the other fields.</CardDescription>
              </CardHeader>
              <CardContent>
                 <Tabs
                    defaultValue="futureValue"
                    onValueChange={(value) => {
                      const newMode = value as CalculationMode;
                      form.setValue('calculationMode', newMode);
                      setCalculationMode(newMode);
                      setResults(null);
                      setYearlyData([]);
                      setAiTips([]);
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
                            <Input type="number" step="any" placeholder="e.g., 7" {...field} 
                              onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} 
                              value={field.value === undefined ? '' : field.value}
                              className="text-base"
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
                            <Input type="number" step="any" placeholder="e.g., 10" {...field} 
                            onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            value={field.value === undefined ? '' : field.value}
                            className="text-base"
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

