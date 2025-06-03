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
import { generateInvestmentTips, type InvestmentTipsInput } from '@/ai/flows/generate-investment-tips';
import { DollarSign, Percent, CalendarDays, TrendingUp, Lightbulb, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export default function InvestmentCalculatorPage() {
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [formInputsForAI, setFormInputsForAI] = useState<InvestmentFormData | null>(null);

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
      const startingBalanceForYear = currentBalance;
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
        contributions: totalContributionsThisYear, // This is just monthly * 12 for the year
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
    setAiTips([]); // Clear previous tips
    setFormInputsForAI(data); // Store form inputs for AI
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
          const tipsOutput = await generateInvestmentTips(aiInput);
          setAiTips(tipsOutput.tips);
        } catch (error) {
          console.error("Error generating AI tips:", error);
          toast({
            title: "Error",
            description: "Could not generate AI investment tips. Please try again.",
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
  }, [results, formInputsForAI]); // Trigger AI tips when results and formInputsForAI are set

  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col items-center">
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-headline font-bold text-primary">NeonVest</h1>
        <p className="text-muted-foreground mt-2 text-lg">Chart your financial future. Brightly.</p>
      </header>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
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

        {results && (
          <div className="space-y-8 md:col-start-2">
            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-muted-foreground">Future Value:</p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(results.futureValue)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Contributions:</p>
                  <p className="text-xl font-semibold">{formatCurrency(results.totalContributions)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Interest Earned:</p>
                  <p className="text-xl font-semibold">{formatCurrency(results.totalInterest)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {yearlyData.length > 0 && (
        <Card className="w-full max-w-4xl mt-8 shadow-2xl shadow-primary/20">
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
                  <TableHead className="text-primary">Starting Balance</TableHead>
                  <TableHead className="text-primary">Contributions</TableHead>
                  <TableHead className="text-primary">Interest Earned</TableHead>
                  <TableHead className="text-primary">Ending Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearlyData.map((data) => (
                  <TableRow key={data.year}>
                    <TableCell>{data.year}</TableCell>
                    <TableCell>{formatCurrency(data.startingBalance)}</TableCell>
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

      {(isLoadingTips || aiTips.length > 0) && results && (
         <Card className="w-full max-w-4xl mt-8 shadow-2xl shadow-primary/20">
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
  );
}
