
"use client";

import type { InvestmentFormData, CalculationResults, YearlyData, CalculationMode } from '@/types';
import { InvestmentFormSchema } from '@/types';
import { zodResolver }from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler, type SubmitErrorHandler } from 'react-hook-form';
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
  return Number.isInteger(value) ? `${value} years` : `${Number(value).toFixed(2)} years`;
}

const formatForDisplay = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '';
  }
  const numValue = Number(value);
  return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 20 });
};

const parseNumericInput = (inputValue: string | number | undefined | null): number | undefined => {
    if (inputValue === undefined || inputValue === null) return undefined;
    const stringValue = String(inputValue).trim();
    if (stringValue === "") return undefined;

    const cleaned = stringValue.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '-.') return undefined;
    
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
    color: "hsl(var(--chart-1))", // Neon Green
  },
  amountInvested: {
    label: "Amount Invested",
    color: "hsl(var(--chart-4))", // Green-Cyan (blue-ish)
  },
  interestAccumulated: {
    label: "Interest Accumulated",
    color: "hsl(var(--chart-2))", // Brighter Green
  },
} satisfies ChartConfig;

const tooltipLineOrder: (keyof ChartDisplayDataItem)[] = ["totalValue", "amountInvested", "interestAccumulated"];


interface AiTip {
  title: string;
  description: string;
}

const defaultFormValues: InvestmentFormData = {
  initialInvestment: 1000,
  monthlyContribution: 100,
  interestRate: 7,
  investmentDuration: 10,
  targetFutureValue: 100000, // Default for when it's an input
  calculationMode: 'futureValue',
};

export default function InvestmentCalculatorPage() {
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [aiTips, setAiTips] = useState<AiTip[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [formInputsForAI, setFormInputsForAI] = useState<InvestmentFormData | null>(null);
  const [chartDisplayData, setChartDisplayData] = useState<ChartDisplayDataItem[]>([]);
  
  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormSchema),
    defaultValues: defaultFormValues,
  });

  const [calculationMode, setCalculationMode] = useState<CalculationMode>(
    form.getValues('calculationMode') || 'futureValue'
  );

  const { toast } = useToast();

  const handleTabChange = (newMode: CalculationMode) => {
    console.log("[Tabs onValueChange] Tab changed to:", newMode);
    setCalculationMode(newMode);
    form.setValue('calculationMode', newMode, { shouldValidate: false }); // No need to validate here, will do at end
    setResults(null);
    setYearlyData([]);
    setAiTips([]);
    setFormInputsForAI(null);

    const optionalFields: (keyof InvestmentFormData)[] = ['monthlyContribution', 'interestRate', 'investmentDuration', 'targetFutureValue'];
    optionalFields.forEach(field => form.unregister(field));


    if (newMode !== 'futureValue') {
      form.resetField('targetFutureValue', {
        defaultValue: form.getValues('targetFutureValue') ?? defaultFormValues.targetFutureValue,
      });
    } else {
       form.resetField('targetFutureValue', {defaultValue: undefined});
    }

    if (newMode !== 'calculateMonthlyContribution') {
      form.resetField('monthlyContribution', {
        defaultValue: form.getValues('monthlyContribution') ?? defaultFormValues.monthlyContribution,
      });
    } else {
       form.resetField('monthlyContribution', {defaultValue: undefined});
    }
    
    if (newMode !== 'calculateInterestRate') {
      form.resetField('interestRate', {
        defaultValue: form.getValues('interestRate') ?? defaultFormValues.interestRate,
      });
    } else {
       form.resetField('interestRate', {defaultValue: undefined});
    }

    if (newMode !== 'calculateInvestmentDuration') {
       form.resetField('investmentDuration', {
        defaultValue: form.getValues('investmentDuration') ?? defaultFormValues.investmentDuration,
       });
    } else {
        form.resetField('investmentDuration', {defaultValue: undefined});
    }
    form.register('initialInvestment');
    form.trigger(); 
  };


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

    const totalMonths = Math.round(investmentDuration * 12);
    let yearCounterForTable = 1;
    let monthsInCurrentYear = 0;
    let startingBalanceForYear = initialInvestment;
    let totalInterestThisYear = 0;
    let totalContributionsThisYear = 0;


    for (let month = 1; month <= totalMonths; month++) {
        const interestThisMonth = currentBalance * monthlyInterestRate;
        currentBalance += interestThisMonth;
        totalInterestThisYear += interestThisMonth;

        if (monthlyContribution > 0) {
            currentBalance += monthlyContribution;
            totalContributionsThisYear += monthlyContribution;
            totalContributionsOverall += monthlyContribution;
        }
        monthsInCurrentYear++;

        if (monthsInCurrentYear === 12 || month === totalMonths) {
             if (yearCounterForTable <= Math.floor(investmentDuration) || (month === totalMonths && monthsInCurrentYear > 0) ){ 
                newYearlyData.push({
                    year: yearCounterForTable,
                    startingBalance: startingBalanceForYear,
                    interestEarned: totalInterestThisYear,
                    contributions: totalContributionsThisYear, 
                    endingBalance: currentBalance,
                });
             }
            yearCounterForTable++;
            monthsInCurrentYear = 0;
            startingBalanceForYear = currentBalance;
            totalInterestThisYear = 0;
            totalContributionsThisYear = 0;
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

  const onInvalid: SubmitErrorHandler<InvestmentFormData> = (errors) => {
    console.error("FORM VALIDATION ERRORS:", errors);
    toast({
      title: "Input Error",
      description: "Please check the form for errors and ensure all required fields for the selected calculation are filled correctly.",
      variant: "destructive",
    });
  };

 const onSubmit: SubmitHandler<InvestmentFormData> = (data) => {
    const currentCalculationModeFromForm = data.calculationMode || calculationMode; // Use data.calculationMode first
    console.log("FORM SUBMITTED, raw data:", JSON.parse(JSON.stringify(data)), "Mode from data:", currentCalculationModeFromForm);

    let formInitialInvestment = parseNumericInput(data.initialInvestment);
    let formMonthlyContribution = parseNumericInput(data.monthlyContribution);
    let formInterestRate = parseNumericInput(data.interestRate);
    let formInvestmentDuration = parseNumericInput(data.investmentDuration);
    let formTargetFutureValue = parseNumericInput(data.targetFutureValue);

    console.log("[onSubmit] Initial Parsed inputs:", { formInitialInvestment, formMonthlyContribution, formInterestRate, formInvestmentDuration, formTargetFutureValue, currentCalculationModeFromForm });
    
    let projInitialInvestment: number | undefined = formInitialInvestment;
    let projMonthlyContribution: number | undefined;
    let projInterestRate: number | undefined;
    let projInvestmentDuration: number | undefined;
    let projTargetFutureValue: number | undefined = formTargetFutureValue;

    let resultsCalculatedMonthlyContribution: number | undefined = undefined;
    let resultsCalculatedInterestRate: number | undefined = undefined;
    let resultsCalculatedInvestmentDuration: number | undefined = undefined;
    
    let displayFutureValue: number | undefined; 
    let finalTotalInterest: number | undefined;
    let finalTotalContributions: number | undefined;

    try {
        if (currentCalculationModeFromForm === 'futureValue') {
            projMonthlyContribution = formMonthlyContribution;
            projInterestRate = formInterestRate;
            projInvestmentDuration = formInvestmentDuration;
            console.log("[Future Value Mode] Validating inputs:", { projInitialInvestment, projMonthlyContribution, projInterestRate, projInvestmentDuration });
            if (projInitialInvestment === undefined || projMonthlyContribution === undefined || projInterestRate === undefined || projInvestmentDuration === undefined) {
                toast({ title: "Input Error", description: "For 'Future Value' calculation, please fill Initial Investment, Monthly Contribution, Interest Rate, and Investment Duration.", variant: "destructive" });
                return;
            }
        } else if (currentCalculationModeFromForm === 'calculateMonthlyContribution') {
            projInterestRate = formInterestRate;
            projInvestmentDuration = formInvestmentDuration;
            console.log("[Calc MC Mode] Validating inputs from form:", { projInitialInvestment, projInterestRate, projInvestmentDuration, projTargetFutureValue });
            if (projInitialInvestment === undefined || projInterestRate === undefined || projInvestmentDuration === undefined || projTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "To calculate Monthly Contribution, please fill: Initial Investment, Interest Rate, Investment Duration, and Target Future Value.", variant: "destructive" });
                return;
            }
            if (projInvestmentDuration <= 0) {
                toast({title: "Input Error", description: "Investment duration must be positive for MC calculation.", variant: "destructive"}); 
                return;
            }

            const i = (projInterestRate / 100) / 12; 
            const N = projInvestmentDuration * 12; 
            let calculatedMC: number;

            if (N === 0) {
                 toast({ title: "Calculation Error", description: "Investment duration is too short (0 months) for MC calculation.", variant: "destructive" }); 
                 return;
            }
            if (i === 0) { 
                calculatedMC = (projTargetFutureValue - projInitialInvestment) / N;
            } else {
                const futureValueOfInitial = projInitialInvestment * Math.pow(1 + i, N);
                const denominator = (Math.pow(1 + i, N) - 1);
                if (Math.abs(denominator) < 1e-9) {  
                    toast({ title: "Calculation Error", description: "Cannot calculate monthly contribution with these parameters (potential division by zero).", variant: "destructive" }); 
                    return;
                }
                calculatedMC = (projTargetFutureValue - futureValueOfInitial) * i / denominator;
            }

            if (calculatedMC < 0 || !isFinite(calculatedMC)) {
                toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions or calculation is invalid. Calculated contribution set to 0 for projection.", variant: "default"});
                 resultsCalculatedMonthlyContribution = 0;
            } else {
                resultsCalculatedMonthlyContribution = parseFloat(calculatedMC.toFixed(2));
            }
            projMonthlyContribution = resultsCalculatedMonthlyContribution; 
            console.log("[Calc MC Mode] Calculated MC:", resultsCalculatedMonthlyContribution, "Using this for projection:", projMonthlyContribution);
            

        } else if (currentCalculationModeFromForm === 'calculateInvestmentDuration') {
            projMonthlyContribution = formMonthlyContribution;
            projInterestRate = formInterestRate;
            console.log("[Calc Duration Mode] Validating inputs from form:", { projInitialInvestment, projMonthlyContribution, projInterestRate, projTargetFutureValue });
            if (projInitialInvestment === undefined || projMonthlyContribution === undefined || projInterestRate === undefined || projTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "To calculate Investment Duration, please fill: Initial Investment, Monthly Contribution, Interest Rate, and Target Future Value.", variant: "destructive" });
                return;
            }

            const i = (projInterestRate / 100) / 12; 
            let calculatedID_N_periods: number | undefined; 

            if (projTargetFutureValue <= projInitialInvestment && projMonthlyContribution <= 0) {
                toast({ title: "Calculation Info", description: "Target value already met by initial investment with no positive contributions. Duration is 0.", variant: "default" });
                resultsCalculatedInvestmentDuration = 0;
            } else if (i === 0) { 
                if (projMonthlyContribution <= 0 && projTargetFutureValue > projInitialInvestment) {
                     toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no (or negative) contributions if target > initial.", variant: "destructive" }); 
                     return;
                }
                 if (projMonthlyContribution === 0 && projTargetFutureValue > projInitialInvestment) { 
                    toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and 0 monthly contribution if target > initial.", variant: "destructive" });
                    return;
                }
                calculatedID_N_periods = (projTargetFutureValue - projInitialInvestment) / projMonthlyContribution;
            } else { 
                const valForLogNumerator = (projTargetFutureValue * i + projMonthlyContribution);
                const valForLogDenominator = (projInitialInvestment * i + projMonthlyContribution);

                if (Math.abs(valForLogDenominator) < 1e-9) {
                     toast({ title: "Calculation Error", description: "Cannot calculate duration due to division by zero (check parameters).", variant: "destructive" }); 
                     return;
                }
                const valForLog = valForLogNumerator / valForLogDenominator;

                if (valForLog <= 0 ) {
                    toast({ title: "Calculation Error", description: "Cannot calculate duration. Investment may not grow to target or parameters lead to invalid math.", variant: "destructive" }); 
                    return;
                }
                 if (Math.abs(Math.log(1+i)) < 1e-9) { 
                    toast({ title: "Calculation Error", description: "Interest rate is effectively zero for logarithmic calculation of duration.", variant: "destructive" }); 
                    return;
                 }
                calculatedID_N_periods = Math.log(valForLog) / Math.log(1 + i);
            }
            
            if (calculatedID_N_periods === undefined || calculatedID_N_periods < 0 || !isFinite(calculatedID_N_periods)) {
                if (resultsCalculatedInvestmentDuration !== 0) { 
                    toast({title: "Calculation Alert", description: "Target is likely unachievable or calculation resulted in an invalid duration.", variant: "default"});
                    return; 
                }
            }
            resultsCalculatedInvestmentDuration = resultsCalculatedInvestmentDuration === 0 ? 0 : parseFloat(( (calculatedID_N_periods || 0) / 12).toFixed(2));
            projInvestmentDuration = resultsCalculatedInvestmentDuration;
            console.log("[Calc Duration Mode] Calculated Duration (Years):", resultsCalculatedInvestmentDuration);
            

        } else if (currentCalculationModeFromForm === 'calculateInterestRate') {
            projMonthlyContribution = formMonthlyContribution;
            projInvestmentDuration = formInvestmentDuration;
            console.log("[Calc IR Mode] Validating inputs from form:", { projInitialInvestment, projMonthlyContribution, projInvestmentDuration, projTargetFutureValue });
            if (projInitialInvestment === undefined || projMonthlyContribution === undefined || projInvestmentDuration === undefined || projTargetFutureValue === undefined) {
                toast({ title: "Input Error", description: "To calculate Interest Rate, please fill: Initial Investment, Monthly Contribution, Investment Duration, and Target Future Value.", variant: "destructive" });
                return;
            }
            if (projInvestmentDuration <= 0) {
                toast({title: "Input Error", description: "Investment duration must be positive to calculate interest rate.", variant: "destructive"}); 
                return;
            }

            const N = projInvestmentDuration * 12; 
            let low_r_annual_decimal = 0.0;    
            let high_r_annual_decimal = 5.0; 
            let mid_r_monthly_decimal;
            let fv_at_mid_r;
            const max_iterations = 100;
            const tolerance_fv_diff = 0.01; 
            const tolerance_rate_diff = 1e-7; 
            let calculatedAnnualIRDecimal: number | undefined;

            const totalContributionsOnly = projInitialInvestment + projMonthlyContribution * N;
            
            if (projTargetFutureValue < totalContributionsOnly - tolerance_fv_diff) { 
                 toast({ title: "Target Value Alert", description: "Target value is less than total contributions. A negative interest rate would be required, which is not supported. Setting rate to 0%.", variant: "default" });
                 calculatedAnnualIRDecimal = 0; 
            } else if (Math.abs(projTargetFutureValue - totalContributionsOnly) < tolerance_fv_diff) { 
                 calculatedAnnualIRDecimal = 0; 
            } else { 
                for (let iter = 0; iter < max_iterations; iter++) {
                    mid_r_monthly_decimal = (low_r_annual_decimal + high_r_annual_decimal) / 2 / 12; 

                    if (Math.abs(mid_r_monthly_decimal) < 1e-9) { 
                        fv_at_mid_r = projInitialInvestment + projMonthlyContribution * N;
                    } else {
                        fv_at_mid_r = projInitialInvestment * Math.pow(1 + mid_r_monthly_decimal, N) +
                                    projMonthlyContribution * (Math.pow(1 + mid_r_monthly_decimal, N) - 1) / mid_r_monthly_decimal;
                    }

                    if (Math.abs(fv_at_mid_r - projTargetFutureValue) < tolerance_fv_diff) {
                        calculatedAnnualIRDecimal = mid_r_monthly_decimal * 12;
                        break;
                    }

                    if (fv_at_mid_r < projTargetFutureValue) {
                        low_r_annual_decimal = mid_r_monthly_decimal * 12 ; 
                    } else {
                        high_r_annual_decimal = mid_r_monthly_decimal * 12; 
                    }
                     if (Math.abs(high_r_annual_decimal - low_r_annual_decimal) < tolerance_rate_diff) { 
                        calculatedAnnualIRDecimal = (low_r_annual_decimal + high_r_annual_decimal) / 2;
                        break;
                     }
                }
                 if (calculatedAnnualIRDecimal === undefined ) { 
                     mid_r_monthly_decimal = (low_r_annual_decimal + high_r_annual_decimal) / 2 / 12;
                     if (Math.abs(mid_r_monthly_decimal) < 1e-9) { 
                        fv_at_mid_r = projInitialInvestment + projMonthlyContribution * N;
                     } else {
                        fv_at_mid_r = projInitialInvestment * Math.pow(1 + mid_r_monthly_decimal, N) +
                                    projMonthlyContribution * (Math.pow(1 + mid_r_monthly_decimal, N) - 1) / mid_r_monthly_decimal;
                     }

                     if (Math.abs(fv_at_mid_r - projTargetFutureValue) < tolerance_fv_diff * 100) { // Loosen tolerance for final check if not converged
                        calculatedAnnualIRDecimal = mid_r_monthly_decimal * 12;
                     } else {
                        toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target might be unachievable or parameters are extreme.", variant: "destructive"});
                        return;
                     }
                 }
            }
            
            if (calculatedAnnualIRDecimal === undefined || calculatedAnnualIRDecimal < 0 || calculatedAnnualIRDecimal > 5 || !isFinite(calculatedAnnualIRDecimal)) { 
                 toast({title: "Calculation Alert", description: "Calculated interest rate is unreasonable (not 0-500%) or invalid.", variant: "destructive"});
                 return;
            }
            resultsCalculatedInterestRate = parseFloat((calculatedAnnualIRDecimal * 100).toFixed(2));
            projInterestRate = resultsCalculatedInterestRate; 
            console.log("[Calc IR Mode] Calculated IR (%):", resultsCalculatedInterestRate);
        }

        console.log("Parameters for calculateFullProjection (after mode-specific calcs):", {
            initial: projInitialInvestment,
            monthly: projMonthlyContribution,
            rate: projInterestRate,
            duration: projInvestmentDuration,
        });

        if (projInitialInvestment === undefined || isNaN(projInitialInvestment) ||
            projMonthlyContribution === undefined || isNaN(projMonthlyContribution) ||
            projInterestRate === undefined || isNaN(projInterestRate) ||
            projInvestmentDuration === undefined || isNaN(projInvestmentDuration) || projInvestmentDuration < 0 ) {
          toast({ title: "Projection Error", description: "Core parameters for projection are missing or invalid after mode-specific calculations. Cannot project.", variant: "destructive" });
          console.log("Exiting onSubmit: Core parameters missing/invalid for projection", {projInitialInvestment, projMonthlyContribution, projInterestRate, projInvestmentDuration});
          setResults(null);
          setYearlyData([]);
          return;
        }

        const projection = calculateFullProjection(
            projInitialInvestment,
            projMonthlyContribution,
            projInterestRate,
            projInvestmentDuration
        );
        
        console.log("Projection Result (from calculateFullProjection):", projection);

        displayFutureValue = (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== undefined) ? projTargetFutureValue : projection.futureValue;
        finalTotalInterest = projection.totalInterest;
        finalTotalContributions = projection.totalContributions;
        
        // Update form fields for calculated values AFTER all calculations
        // Only set if a value was actually calculated for that field in this mode
        if (currentCalculationModeFromForm === 'calculateMonthlyContribution' && resultsCalculatedMonthlyContribution !== undefined) {
            form.setValue('monthlyContribution', resultsCalculatedMonthlyContribution, { shouldValidate: false });
        }
        if (currentCalculationModeFromForm === 'calculateInterestRate' && resultsCalculatedInterestRate !== undefined) {
            form.setValue('interestRate', resultsCalculatedInterestRate, { shouldValidate: false });
        }
        if (currentCalculationModeFromForm === 'calculateInvestmentDuration' && resultsCalculatedInvestmentDuration !== undefined) {
            form.setValue('investmentDuration', resultsCalculatedInvestmentDuration, { shouldValidate: false });
        }


        const resultsToSet: CalculationResults = {
            futureValue: displayFutureValue,
            totalInterest: finalTotalInterest,
            totalContributions: finalTotalContributions,
            calculatedMonthlyContribution: currentCalculationModeFromForm === 'calculateMonthlyContribution' ? projMonthlyContribution : undefined,
            calculatedInterestRate: currentCalculationModeFromForm === 'calculateInterestRate' ? projInterestRate : undefined,
            calculatedInvestmentDuration: currentCalculationModeFromForm === 'calculateInvestmentDuration' ? projInvestmentDuration : undefined,
            originalTargetFutureValue: (currentCalculationModeFromForm !== 'futureValue') ? projTargetFutureValue : undefined,
        };
        console.log("Setting results state with:", JSON.parse(JSON.stringify(resultsToSet)));
        setResults(resultsToSet);
        
        console.log("Setting yearlyData state with (length):", projection.yearlyData.length);
        setYearlyData(projection.yearlyData);
        
        
        setAiTips([]); 

        const formInputsForAICopy: InvestmentFormData = { 
            initialInvestment: projInitialInvestment,
            monthlyContribution: projMonthlyContribution,
            interestRate: projInterestRate,
            investmentDuration: projInvestmentDuration,
            targetFutureValue: (currentCalculationModeFromForm !== 'futureValue') ? projTargetFutureValue : undefined,
            calculationMode: currentCalculationModeFromForm
        };
        console.log("Setting formInputsForAI state with:", JSON.parse(JSON.stringify(formInputsForAICopy)));
        setFormInputsForAI(formInputsForAICopy);


    } catch (error) {
        console.error("Calculation Error in onSubmit:", error);
        let errorMsg = "An error occurred during calculation. Please check inputs.";
        if (error instanceof Error) errorMsg = error.message;
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        setResults(null);
        setYearlyData([]);
    }
  };

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
            futureValue: results.futureValue!, 
            totalInterest: results.totalInterest!,
            totalContributions: results.totalContributions!,
          };
          console.log("Fetching AI tips with input:", aiInput);
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
               variant: "default",
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
          // Calculate cumulative contributions up to the *beginning* of this year's period for 'amountInvested'
          const contributionsBeforeThisYear = yearlyData
            .slice(0, yearlyData.findIndex(y => y.year === data.year))
            .reduce((acc, curr) => acc + (curr.contributions || 0), 0);
          
          const amountInvestedAtYearStart = baseContributions + contributionsBeforeThisYear;

          // For 'amountInvested' at year end, include this year's contributions
          const amountInvestedAtYearEnd = amountInvestedAtYearStart + (data.contributions || 0);
          
          const interestAccumulatedUpToThisYearEnd = data.endingBalance - amountInvestedAtYearEnd;

        return {
          name: `Year ${Math.floor(data.year)}`, 
          totalValue: data.endingBalance,
          amountInvested: amountInvestedAtYearEnd, // This is cumulative contributions including initial
          interestAccumulated: interestAccumulatedUpToThisYearEnd < 0 ? 0 : interestAccumulatedUpToThisYearEnd, 
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
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="w-full flex flex-col items-center">
          <div className="w-full max-w-xl mb-12">
            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Investment Inputs
                </CardTitle>
                <CardDescription>Select a tab to choose what to calculate. Fill in the other fields to determine the highlighted value.</CardDescription>
              </CardHeader>
              <CardContent>
                 <Tabs
                    value={calculationMode}
                    onValueChange={(value) => handleTabChange(value as CalculationMode)}
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
                              value={formatForDisplay(field.value)}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
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
                            value={formatForDisplay(field.value)}
                             onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
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
                              value={formatForDisplay(field.value)}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
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
                            <Input type="text" placeholder="e.g., 7"
                              onChange={e => field.onChange(parseNumericInput(e.target.value))}
                              value={field.value === undefined || field.value === null ? '' : String(field.value)}
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
                            <Input type="text" placeholder="e.g., 10"
                            onChange={e => field.onChange(parseNumericInput(e.target.value))}
                            value={field.value === undefined || field.value === null ? '' : String(field.value)}
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
           <Card className="w-full shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <AreaChart className="mr-2 h-7 w-7" /> Investment Growth Chart
                </CardTitle>
                <CardDescription>Visual representation of your investment growth over time.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {chartDisplayData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="min-h-[300px] w-full aspect-video">
                    <ComposedChart data={chartDisplayData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} padding={{ left: 10, right: 10 }} />
                        <YAxis tickFormatter={(value) => formatCurrency(value)} tickLine={false} axisLine={false} tickMargin={8} width={90} />
                        <RechartsTooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        itemSorter={(item) => tooltipLineOrder.indexOf(item.dataKey as keyof ChartDisplayDataItem)}
                        content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} labelClassName="font-bold" indicator="dot" />}
                        />
                        <RechartsLegend content={<ChartLegendContent />} />
                        <RechartsLine key="totalValue" dataKey="totalValue" type="monotone" stroke="var(--color-totalValue)" strokeWidth={3} dot={{ r: 4, fillOpacity: 1 }} name={chartConfig.totalValue.label} />
                        <RechartsLine key="amountInvested" dataKey="amountInvested" type="monotone" stroke="var(--color-amountInvested)" strokeWidth={2} dot={false} name={chartConfig.amountInvested.label} />
                        <RechartsLine key="interestAccumulated" dataKey="interestAccumulated" type="monotone" stroke="var(--color-interestAccumulated)" strokeWidth={2} dot={false} name={chartConfig.interestAccumulated.label} />
                    </ComposedChart>
                    </ChartContainer>
                ) : (
                    <p className="text-center text-muted-foreground">No chart data available. Please check your inputs or calculation results.</p>
                )}
              </CardContent>
            </Card>
          

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {yearlyData.length > 0 ? (
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
            ) : (
                 <Card className="shadow-2xl shadow-primary/20">
                    <CardHeader><CardTitle className="text-2xl font-headline text-primary">Yearly Projection</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground">No yearly data to display.</p></CardContent>
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
                
                {formInputsForAI?.calculationMode === 'futureValue' && formInputsForAI?.monthlyContribution !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Monthly Contribution:</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.monthlyContribution)}</p>
                    </div>
                )}
                 {(formInputsForAI?.calculationMode === 'calculateInterestRate' || formInputsForAI?.calculationMode === 'calculateInvestmentDuration') && formInputsForAI?.monthlyContribution !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Monthly Contribution (Input):</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.monthlyContribution)}</p>
                    </div>
                )}


                {(formInputsForAI?.calculationMode === 'futureValue' || formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || formInputsForAI?.calculationMode === 'calculateInvestmentDuration') && formInputsForAI?.interestRate !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate (Input):</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}


                {(formInputsForAI?.calculationMode === 'futureValue' || formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || formInputsForAI?.calculationMode === 'calculateInterestRate') && formInputsForAI?.investmentDuration !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration (Input):</p>
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

