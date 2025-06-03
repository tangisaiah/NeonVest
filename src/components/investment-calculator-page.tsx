
"use client";

import type { InvestmentFormData, CalculationResults, YearlyData } from '@/types';
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
import { DollarSign, Percent, CalendarDays, TrendingUp, Lightbulb, Loader2, AreaChart } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Line as RechartsLine, Legend as RechartsLegend, Tooltip as RechartsTooltip } from 'recharts';


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

interface ChartDisplayDataItem {
  name: string; // e.g., "Year 1"
  totalValue: number;
  amountInvested: number;
  interestAccumulated: number;
}

const chartConfig = {
  totalValue: {
    label: "Total Value",
    color: "hsl(var(--chart-1))", // Neon Green (Primary theme color)
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


export default function InvestmentCalculatorPage() {
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [formInputsForAI, setFormInputsForAI] = useState<InvestmentFormData | null>(null);
  const [chartDisplayData, setChartDisplayData] = useState<ChartDisplayDataItem[]>([]);

  const { toast } = useToast();

  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormSchema),
    defaultValues: {
      initialInvestment: 1000,
      monthlyContribution: 100,
      interestRate: 7,
      investmentDuration: 10,
    },
  });

  const onSubmit: SubmitHandler<InvestmentFormData> = (data) => {
    const { initialInvestment, monthlyContribution, interestRate, investmentDuration } = data;
    const annualInterestRateDecimal = interestRate / 100;
    const monthlyInterestRate = annualInterestRateDecimal / 12;

    let currentBalance = initialInvestment;
    const newYearlyData: YearlyData[] = [];
    let totalContributionsOverall = initialInvestment;

    for (let year = 1; year <= investmentDuration; year++) {
      const startingBalanceForYear = currentBalance; // Retained for data integrity, removed from display
      let totalInterestThisYear = 0;
      let totalContributionsThisYear = 0;

      for (let month = 1; month <= 12; month++) {
        const interestThisMonth = currentBalance * monthlyInterestRate;
        currentBalance += interestThisMonth;
        totalInterestThisYear += interestThisMonth;
        
        currentBalance += monthlyContribution;
        totalContributionsThisYear += monthlyContribution;
        totalContributionsOverall += monthlyContribution;
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
    
    setResults({
      futureValue,
      totalInterest: totalInterestEarned,
      totalContributions: totalContributionsOverall,
    });
    setYearlyData(newYearlyData);
    setAiTips([]); 
    setFormInputsForAI(data); 
  };

  useEffect(() => {
    if (results && formInputsForAI) {
      const fetchAITips = async () => {
        setIsLoadingTips(true);
        try {
          const aiInput: InvestmentTipsInput = {
            initialInvestment: formInputsForAI.initialInvestment,
            monthlyContribution: formInputsForAI.monthlyContribution,
            interestRate: formInputsForAI.interestRate,
            investmentDuration: formInputsForAI.investmentDuration,
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
  }, [results, formInputsForAI, toast]);

  useEffect(() => {
    if (yearlyData.length > 0 && formInputsForAI) {
      let cumulativeAmountInvested = formInputsForAI.initialInvestment;

      const newChartData = yearlyData.map(data => {
        cumulativeAmountInvested += data.contributions; 

        return {
          name: `Year ${data.year}`,
          totalValue: data.endingBalance,
          amountInvested: cumulativeAmountInvested,
          interestAccumulated: data.endingBalance - cumulativeAmountInvested,
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

      {/* Investment Input Section */}
      <div className="w-full max-w-xl mb-12">
        <Card className="shadow-2xl shadow-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center">
              <TrendingUp className="mr-2 h-7 w-7" /> Investment Inputs
            </CardTitle>
            <CardDescription>Enter your investment details below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="initialInvestment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center text-base"><DollarSign className="mr-2 h-4 w-4 text-primary" />Initial Investment ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="e.g., 1000" {...field} className="text-base"/>
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
                      <FormLabel className="flex items-center text-base"><DollarSign className="mr-2 h-4 w-4 text-primary" />Monthly Contribution ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="e.g., 100" {...field} className="text-base"/>
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
                      <FormLabel className="flex items-center text-base"><Percent className="mr-2 h-4 w-4 text-primary" />Annual Interest Rate (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="e.g., 7" {...field} className="text-base"/>
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
                      <FormLabel className="flex items-center text-base"><CalendarDays className="mr-2 h-4 w-4 text-primary" />Investment Duration (Years)</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" placeholder="e.g., 10" {...field} className="text-base"/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full text-lg py-6 bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all duration-300 ease-in-out transform hover:scale-105">
                  Calculate
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      {/* Results Section - Conditionally visible */}
      {results && (
        <div className="w-full max-w-5xl space-y-10">
          {/* Graph Card */}
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
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis
                      tickFormatter={(value) => formatCurrency(value)}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      width={90}
                    />
                    <RechartsTooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={<ChartTooltipContent
                        formatter={(value) => formatCurrency(value as number)}
                        labelClassName="font-bold"
                        indicator="dot"
                       />}
                    />
                    <RechartsLegend content={<ChartLegendContent />} />
                    <RechartsLine
                      dataKey="amountInvested"
                      type="monotone"
                      stroke="var(--color-amountInvested)"
                      strokeWidth={2}
                      dot={false}
                      name={chartConfig.amountInvested.label}
                    />
                    <RechartsLine
                      dataKey="interestAccumulated"
                      type="monotone"
                      stroke="var(--color-interestAccumulated)"
                      strokeWidth={2}
                      dot={false}
                      name={chartConfig.interestAccumulated.label}
                    />
                    <RechartsLine
                      dataKey="totalValue"
                      type="monotone"
                      stroke="var(--color-totalValue)"
                      strokeWidth={3}
                      dot={{ r: 4, fillOpacity: 1 }}
                      name={chartConfig.totalValue.label}
                    />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Table and Results Card Side-by-Side */}
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
                        <TableHead className="text-primary">Contributions</TableHead>
                        <TableHead className="text-primary">Interest Earned</TableHead>
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
                {formInputsForAI && (
                  <div>
                    <p className="text-muted-foreground">Initial Investment:</p>
                    <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.initialInvestment)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Future Value:</p>
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

          {/* AI Tips Card */}
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
                   <Accordion type="single" collapsible className="w-full">
                     {aiTips.map((tip, index) => (
                       <AccordionItem value={`item-${index}`} key={index}>
                         <AccordionTrigger className="text-left hover:text-accent transition-colors">Tip {index + 1}</AccordionTrigger>
                         <AccordionContent className="text-base">
                           {tip}
                         </AccordionContent>
                       </AccordionItem>
                     ))}
                   </Accordion>
                 )}
               </CardContent>
             </Card>
          )}
        </div>
      )}
    </div>
  );
}

