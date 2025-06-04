
"use client";

import type { InvestmentFormData, CalculationResults, YearlyData, CalculationMode, CompoundingFrequency, ContributionFrequency } from '@/types';
import { InvestmentFormSchema, CompoundingFrequencySchema, ContributionFrequencySchema } from '@/types';
import { zodResolver }from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler, type SubmitErrorHandler } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadcnFormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { generateInvestmentTips, type InvestmentTipsInput, type InvestmentTipsOutput } from '@/ai/flows/generate-investment-tips';
import { DollarSign, Percent, CalendarDays, TrendingUp, Lightbulb, Loader2, AreaChart, Target, Repeat } from 'lucide-react';
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


const formatCurrency = (value: number | undefined | null) => {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatPercentage = (value: number | undefined | null) => {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

const formatYears = (value: number | undefined | null) => {
  if (value === undefined || value === null || isNaN(value)) return "N/A";
  return Number.isInteger(value) ? `${value} years` : `${Number(value).toFixed(2)} years`;
}

const formatForDisplay = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '';
  }
  const numValue = Number(value);
  if (numValue === 0) return '0';
  return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 20 });
};


const parseNumericInput = (inputValue: string | number | undefined | null): number | null => {
    if (inputValue === undefined || inputValue === null) return null;
    const stringValue = String(inputValue).trim();
    if (stringValue === "") return null;

    const cleaned = stringValue.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '-.') return null;
    
    if ((cleaned.match(/\./g) || []).length > 1) return null;
    if ((cleaned.match(/-/g) || []).length > 1 || (cleaned.indexOf('-') > 0)) return null;

    const numberValue = parseFloat(cleaned);
    return isNaN(numberValue) ? null : numberValue;
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
    color: "hsl(var(--chart-2))",
  },
  interestAccumulated: {
    label: "Interest Accumulated",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;


const tooltipLineOrder: (keyof ChartDisplayDataItem)[] = ["totalValue", "amountInvested", "interestAccumulated"];


interface AiTip {
  title: string;
  description: string;
}

const defaultFormValues: InvestmentFormData = {
  initialInvestment: 1000,
  contributionAmount: 100,
  contributionFrequency: 'monthly',
  interestRate: 7,
  investmentDuration: 10,
  targetFutureValue: 100000,
  calculationMode: 'futureValue',
  compoundingFrequency: 'annually', // Changed default
};

const getNumberOfPeriodsPerYear = (frequency: CompoundingFrequency | undefined | null): number => {
  if (!frequency) return 1; // Default to annually if not specified
  switch (frequency) {
    case 'annually': return 1;
    case 'semiannually': return 2;
    case 'quarterly': return 4;
    case 'monthly': return 12;
    case 'semimonthly': return 24;
    case 'biweekly': return 26;
    case 'weekly': return 52;
    case 'daily': return 365;
    case 'continuously': return Infinity;
    default: return 1; // Default to annually for unknown values
  }
};

const getEffectiveContributionPerCompoundingPeriod = (
  userInputContributionAmount: number,
  userInputContributionFrequency: ContributionFrequency,
  compoundingPeriodsPerYear: number
): number => {
  if (compoundingPeriodsPerYear === Infinity || compoundingPeriodsPerYear === 0) {
    return 0; 
  }
  const annualUserInputContribution = (userInputContributionFrequency === 'yearly')
    ? userInputContributionAmount
    : userInputContributionAmount * 12;
  
  return annualUserInputContribution / compoundingPeriodsPerYear;
};


export default function InvestmentCalculatorPage() {
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  const [aiTips, setAiTips] = useState<AiTip[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [formInputsForAI, setFormInputsForAI] = useState<InvestmentFormData | null>(null);
  const [chartDisplayData, setChartDisplayData] = useState<ChartDisplayDataItem[]>([]);
  const [calculationMode, setCalculationMode] = useState<CalculationMode>(defaultFormValues.calculationMode);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormSchema),
    defaultValues: defaultFormValues,
    mode: "onSubmit", 
    reValidateMode: "onBlur", 
  });

  const { toast } = useToast();

 const handleTabChange = (newMode: CalculationMode) => {
    setCalculationMode(newMode);
    form.reset(defaultFormValues); 
    form.setValue('calculationMode', newMode, { shouldValidate: false });
    
    let outputFieldToNullifyKey: keyof InvestmentFormData | undefined = undefined;

    if (newMode === 'calculateMonthlyContribution') { 
        outputFieldToNullifyKey = 'contributionAmount';
    } else if (newMode === 'calculateInterestRate') {
        outputFieldToNullifyKey = 'interestRate';
    } else if (newMode === 'calculateInvestmentDuration') {
        outputFieldToNullifyKey = 'investmentDuration';
    }
    
    if (outputFieldToNullifyKey) {
        form.setValue(outputFieldToNullifyKey, null, { shouldValidate: false });
        if (outputFieldToNullifyKey === 'contributionAmount') {
             form.setValue('contributionFrequency', defaultFormValues.contributionFrequency, {shouldValidate: false});
        }
    }


    if (newMode === 'futureValue') {
        form.setValue('targetFutureValue', null, { shouldValidate: false });
    } else {
         if (form.getValues('targetFutureValue') === null && ['calculateMonthlyContribution', 'calculateInterestRate', 'calculateInvestmentDuration'].includes(newMode)) {
            form.setValue('targetFutureValue', defaultFormValues.targetFutureValue, { shouldValidate: false });
        }
    }
    
    setResults(null);
    setYearlyData([]);
    setAiTips([]);
    setFormInputsForAI(null);
    setChartDisplayData([]);

    setTimeout(() => form.trigger(), 0);
  };


  const calculateFullProjection = (
    initialInvestment: number,
    userInputContributionAmount: number,
    userInputContributionFrequency: ContributionFrequency,
    interestRate: number,
    investmentDuration: number,
    compoundingFrequency: CompoundingFrequency
  ): { yearlyData: YearlyData[], futureValue: number, totalInterest: number, totalContributions: number, actualContributionAmountPerCompoundingPeriod: number } => {
    
    const compoundingPeriodsPerYear = getNumberOfPeriodsPerYear(compoundingFrequency);
    let actualContributionAmountPerCompoundingPeriod = 0;

    if (compoundingFrequency === 'continuously') {
      if (userInputContributionAmount > 0) {
        toast({
          title: "Continuous Compounding Note",
          description: "Periodic contributions are not factored into future value for continuous compounding in this calculator version. Calculation proceeds with initial investment only.",
          variant: "default"
        });
      }
      const annualInterestRateDecimal = interestRate / 100;
      const futureValue = initialInvestment * Math.exp(annualInterestRateDecimal * investmentDuration);
      const totalContributions = initialInvestment; 
      const totalInterest = futureValue - totalContributions;
      
      const yearlyDataContinuous: YearlyData[] = [];
       for (let year = 1; year <= investmentDuration; year++) {
          const endOfYearBalance = initialInvestment * Math.exp(annualInterestRateDecimal * year);
          const startOfYearBalance = year === 1 ? initialInvestment : initialInvestment * Math.exp(annualInterestRateDecimal * (year -1));
          yearlyDataContinuous.push({
            year: year,
            startingBalance: startOfYearBalance,
            contributions: 0, 
            interestEarned: endOfYearBalance - startOfYearBalance,
            endingBalance: endOfYearBalance,
          });
       }

      return {
        yearlyData: yearlyDataContinuous,
        futureValue,
        totalInterest,
        totalContributions,
        actualContributionAmountPerCompoundingPeriod: 0,
      };
    }

    actualContributionAmountPerCompoundingPeriod = getEffectiveContributionPerCompoundingPeriod(
        userInputContributionAmount,
        userInputContributionFrequency,
        compoundingPeriodsPerYear
    );

    const annualInterestRateDecimal = interestRate / 100;
    const ratePerPeriod = annualInterestRateDecimal / compoundingPeriodsPerYear;
    const totalPeriods = Math.round(investmentDuration * compoundingPeriodsPerYear); 

    let currentBalance = initialInvestment;
    const newYearlyData: YearlyData[] = [];
    let totalContributionsOverall = initialInvestment; 

    let yearCounterForTable = 1;
    let periodsInCurrentYear = 0;
    let startingBalanceForYear = initialInvestment;
    let totalInterestThisYear = 0;
    let totalContributionsThisYear = 0; 

    for (let period = 1; period <= totalPeriods; period++) {
        const interestThisPeriod = currentBalance * ratePerPeriod;
        currentBalance += interestThisPeriod;
        totalInterestThisYear += interestThisPeriod;

        if (actualContributionAmountPerCompoundingPeriod > 0) { 
            currentBalance += actualContributionAmountPerCompoundingPeriod;
            totalContributionsThisYear += actualContributionAmountPerCompoundingPeriod;
            totalContributionsOverall += actualContributionAmountPerCompoundingPeriod;
        }
        periodsInCurrentYear++;

        if (periodsInCurrentYear === compoundingPeriodsPerYear || period === totalPeriods) {
            if (yearCounterForTable <= Math.ceil(investmentDuration) || (period === totalPeriods && periodsInCurrentYear > 0)) {
                newYearlyData.push({
                    year: yearCounterForTable,
                    startingBalance: startingBalanceForYear,
                    interestEarned: totalInterestThisYear,
                    contributions: totalContributionsThisYear, 
                    endingBalance: currentBalance,
                });
            }
            yearCounterForTable++;
            periodsInCurrentYear = 0;
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
        actualContributionAmountPerCompoundingPeriod,
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
    const currentCalculationModeFromForm = data.calculationMode || calculationMode; 
    console.log("FORM SUBMITTED, raw data:", data, "Mode:", currentCalculationModeFromForm);
    
    let parsedInitialInvestment = parseNumericInput(data.initialInvestment);
    let parsedContributionAmount = parseNumericInput(data.contributionAmount); 
    let parsedInterestRate = parseNumericInput(data.interestRate);
    let parsedInvestmentDuration = parseNumericInput(data.investmentDuration);
    let parsedTargetFutureValue = parseNumericInput(data.targetFutureValue);
    const selectedCompoundingFrequency = data.compoundingFrequency || 'annually'; 
    const selectedContributionFrequency = data.contributionFrequency || 'monthly';

    if (parsedInitialInvestment === null) {
        toast({ title: "Input Error", description: "Initial Investment is required and cannot be empty.", variant: "destructive" });
        form.setError("initialInvestment", { type: "manual", message: "Initial Investment is required." });
        return;
    }
    
    let projInitialInvestment: number = parsedInitialInvestment; 
    let projContributionAmount: number | null = null; 
    let projInterestRate: number | null = null;
    let projInvestmentDuration: number | null = null;
    let projTargetFutureValue: number | null = parsedTargetFutureValue; 

    let resultsCalculatedUserContributionAmount: number | undefined = undefined; 
    let resultsCalculatedInterestRate: number | undefined = undefined;
    let resultsCalculatedInvestmentDuration: number | undefined = undefined;
    
    let displayFutureValue: number | undefined;
    let finalTotalInterest: number | undefined;
    let finalTotalContributions: number | undefined;
    let finalActualContributionAmountPerCompoundingPeriod: number | undefined;


    const compoundingPeriodsPerYear = getNumberOfPeriodsPerYear(selectedCompoundingFrequency);

    if (selectedCompoundingFrequency === 'continuously' && currentCalculationModeFromForm !== 'futureValue') {
        const contributionIsActuallyZeroOrNull = (currentCalculationModeFromForm === 'calculateInterestRate' || currentCalculationModeFromForm === 'calculateInvestmentDuration') 
                                              ? (parsedContributionAmount === null || parsedContributionAmount === 0)
                                              : false; 

        if (!contributionIsActuallyZeroOrNull) {
             toast({title:"Limitation with Continuous Compounding", description: "Goal seeking (calculating Contribution, Rate, or Duration) with periodic contributions is not fully supported for continuous compounding in this version. Try with 0 contribution amount or a discrete compounding frequency.", variant: "default"});
             return; 
        }
    }


    try {
        if (currentCalculationModeFromForm === 'futureValue') {
            if (parsedContributionAmount === null) { form.setError("contributionAmount", {type: "manual", message: "Contribution Amount is required."}); }
            if (parsedInterestRate === null) { form.setError("interestRate", {type: "manual", message: "Interest Rate is required."}); }
            if (parsedInvestmentDuration === null) { form.setError("investmentDuration", {type: "manual", message: "Investment Duration is required."}); }
            if (parsedContributionAmount === null || parsedInterestRate === null || parsedInvestmentDuration === null) {
                toast({ title: "Input Error", description: "For 'Future Value' calculation, please fill Contribution Amount, Interest Rate, and Investment Duration.", variant: "destructive" });
                return;
            }
            projContributionAmount = parsedContributionAmount;
            projInterestRate = parsedInterestRate;
            projInvestmentDuration = parsedInvestmentDuration;

        } else if (currentCalculationModeFromForm === 'calculateMonthlyContribution') { 
            if (parsedInterestRate === null) { form.setError("interestRate", {type: "manual", message: "Interest Rate is required."}); }
            if (parsedInvestmentDuration === null) { form.setError("investmentDuration", {type: "manual", message: "Investment Duration is required."}); }
            if (projTargetFutureValue === null) { form.setError("targetFutureValue", {type: "manual", message: "Target Future Value is required."}); }
            if (parsedInterestRate === null || parsedInvestmentDuration === null || projTargetFutureValue === null) {
                toast({ title: "Input Error", description: "To calculate Contribution Amount, please fill: Interest Rate, Investment Duration, and Target Future Value.", variant: "destructive" });
                return;
            }
            if (parsedInvestmentDuration <= 0) {
                toast({title: "Input Error", description: "Investment duration must be positive.", variant: "destructive"}); form.setError("investmentDuration", {type: "manual", message: "Must be positive."}); return;
            }
            projInterestRate = parsedInterestRate;
            projInvestmentDuration = parsedInvestmentDuration;

            const ratePerPeriod = (projInterestRate / 100) / compoundingPeriodsPerYear;
            const totalPeriods = projInvestmentDuration * compoundingPeriodsPerYear;
            let pmtPerCompoundingPeriod: number;

            if (totalPeriods === 0) {
                 toast({ title: "Calculation Error", description: "Investment duration results in zero periods for contribution.", variant: "destructive" }); return;
            }
            if (ratePerPeriod === 0) { 
                pmtPerCompoundingPeriod = (projTargetFutureValue - projInitialInvestment) / totalPeriods;
            } else {
                const futureValueOfInitial = projInitialInvestment * Math.pow(1 + ratePerPeriod, totalPeriods);
                const denominator = (Math.pow(1 + ratePerPeriod, totalPeriods) - 1);
                if (Math.abs(denominator) < 1e-9) { 
                    toast({ title: "Calculation Error", description: "Cannot calculate contribution (potential division by zero or unstable formula). Try adjusting interest rate or duration.", variant: "destructive" }); return;
                }
                pmtPerCompoundingPeriod = (projTargetFutureValue - futureValueOfInitial) * ratePerPeriod / denominator;
            }
            
            let calculatedUserAmountForFormField: number;
            const requiredAnnualContribution = pmtPerCompoundingPeriod * compoundingPeriodsPerYear;

            if (selectedContributionFrequency === 'yearly') {
                calculatedUserAmountForFormField = requiredAnnualContribution;
            } else { 
                calculatedUserAmountForFormField = requiredAnnualContribution / 12;
            }

            if (calculatedUserAmountForFormField < 0 || !isFinite(calculatedUserAmountForFormField)) {
                toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions, or calculation is invalid. Calculated contribution set to 0 for projection. Your target might be too low or already met.", variant: "default"});
                resultsCalculatedUserContributionAmount = 0;
            } else {
                resultsCalculatedUserContributionAmount = parseFloat(calculatedUserAmountForFormField.toFixed(2)); 
            }
            projContributionAmount = resultsCalculatedUserContributionAmount; 
            
        } else if (currentCalculationModeFromForm === 'calculateInvestmentDuration') {
            if (parsedContributionAmount === null) { form.setError("contributionAmount", {type: "manual", message: "Contribution Amount is required."}); }
            if (parsedInterestRate === null) { form.setError("interestRate", {type: "manual", message: "Interest Rate is required."}); }
            if (projTargetFutureValue === null) { form.setError("targetFutureValue", {type: "manual", message: "Target Future Value is required."}); }
            if (parsedContributionAmount === null || parsedInterestRate === null || projTargetFutureValue === null) {
                toast({ title: "Input Error", description: "To calculate Investment Duration, please fill: Contribution Amount, Interest Rate, and Target Future Value.", variant: "destructive" }); return;
            }
            projContributionAmount = parsedContributionAmount; 
            projInterestRate = parsedInterestRate;

            const effectiveContributionPerPeriod = getEffectiveContributionPerCompoundingPeriod(projContributionAmount, selectedContributionFrequency, compoundingPeriodsPerYear);
            const ratePerPeriod = (projInterestRate / 100) / compoundingPeriodsPerYear;
            let calculatedTotalPeriods: number | undefined;

            if (projTargetFutureValue <= projInitialInvestment && effectiveContributionPerPeriod <= 0) {
                toast({ title: "Calculation Info", description: "Target value already met or cannot be reached with non-positive contributions. Duration is effectively 0.", variant: "default" });
                resultsCalculatedInvestmentDuration = 0;
            } else if (ratePerPeriod === 0) { 
                if (effectiveContributionPerPeriod <= 0 && projTargetFutureValue > projInitialInvestment) {
                     toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no (or negative) contributions.", variant: "destructive" }); return;
                }
                calculatedTotalPeriods = (projTargetFutureValue - projInitialInvestment) / effectiveContributionPerPeriod;
            } else {
                const valForLogNumerator = (projTargetFutureValue * ratePerPeriod + effectiveContributionPerPeriod);
                const valForLogDenominator = (projInitialInvestment * ratePerPeriod + effectiveContributionPerPeriod);

                if (valForLogDenominator === 0 || valForLogNumerator / valForLogDenominator <= 0) { 
                     toast({ title: "Calculation Error", description: "Cannot calculate duration (invalid logarithm due to parameters). Target may be unachievable or parameters lead to an impossible scenario.", variant: "destructive" }); return;
                }
                calculatedTotalPeriods = Math.log(valForLogNumerator / valForLogDenominator) / Math.log(1 + ratePerPeriod);
            }
            
            if (calculatedTotalPeriods === undefined || calculatedTotalPeriods < 0 || !isFinite(calculatedTotalPeriods)) {
                 if (resultsCalculatedInvestmentDuration !== 0) { 
                    toast({title: "Calculation Alert", description: "Target is likely unachievable or calculation resulted in an invalid duration. Check your inputs.", variant: "default"}); return;
                 }
            }
            resultsCalculatedInvestmentDuration = resultsCalculatedInvestmentDuration === 0 ? 0 : parseFloat(((calculatedTotalPeriods || 0) / compoundingPeriodsPerYear).toFixed(2));
            projInvestmentDuration = resultsCalculatedInvestmentDuration; 
            
        } else if (currentCalculationModeFromForm === 'calculateInterestRate') {
            if (parsedContributionAmount === null) { form.setError("contributionAmount", {type: "manual", message: "Contribution Amount is required."}); }
            if (parsedInvestmentDuration === null) { form.setError("investmentDuration", {type: "manual", message: "Investment Duration is required."}); }
            if (projTargetFutureValue === null) { form.setError("targetFutureValue", {type: "manual", message: "Target Future Value is required."}); }

            if (parsedContributionAmount === null || parsedInvestmentDuration === null || projTargetFutureValue === null) {
                toast({ title: "Input Error", description: "To calculate Interest Rate, please fill: Contribution Amount, Investment Duration, and Target Future Value.", variant: "destructive" }); return;
            }
            if (parsedInvestmentDuration <= 0) {
                toast({title: "Input Error", description: "Investment duration must be positive.", variant: "destructive"}); form.setError("investmentDuration", {type: "manual", message: "Must be positive."}); return;
            }
            projContributionAmount = parsedContributionAmount; 
            projInvestmentDuration = parsedInvestmentDuration;
            
            const effectiveContributionPerPeriod = getEffectiveContributionPerCompoundingPeriod(projContributionAmount, selectedContributionFrequency, compoundingPeriodsPerYear);
            const totalPeriods = projInvestmentDuration * compoundingPeriodsPerYear;
            let lowAnnualRate = 0.0;    
            let highAnnualRate = 5.0;    
            let midAnnualRate;
            let fvAtMidRate;
            const maxIterations = 100;
            const toleranceFvDiff = 0.01; 
            const toleranceRateDiff = 1e-7; 
            let calculatedAnnualRateDecimal: number | undefined;

            const totalContributionsOnlyPlain = projInitialInvestment + effectiveContributionPerPeriod * totalPeriods;
            
            if (projTargetFutureValue < totalContributionsOnlyPlain - toleranceFvDiff && effectiveContributionPerPeriod >=0) { 
                 toast({ title: "Target Value Alert", description: "Target value is less than total contributions (even with 0% interest). A negative interest rate would be required, which is not supported. Setting rate to 0%.", variant: "default" });
                 calculatedAnnualRateDecimal = 0.0; 
            } else if (Math.abs(projTargetFutureValue - totalContributionsOnlyPlain) < toleranceFvDiff) { 
                 calculatedAnnualRateDecimal = 0.0; 
            } else {
                for (let iter = 0; iter < maxIterations; iter++) {
                    midAnnualRate = (lowAnnualRate + highAnnualRate) / 2;
                    const ratePerPeriodGuess = midAnnualRate / compoundingPeriodsPerYear;

                    if (Math.abs(ratePerPeriodGuess) < 1e-9) { 
                        fvAtMidRate = projInitialInvestment + effectiveContributionPerPeriod * totalPeriods;
                    } else {
                        fvAtMidRate = projInitialInvestment * Math.pow(1 + ratePerPeriodGuess, totalPeriods) +
                                    effectiveContributionPerPeriod * (Math.pow(1 + ratePerPeriodGuess, totalPeriods) - 1) / ratePerPeriodGuess;
                    }

                    if (Math.abs(fvAtMidRate - projTargetFutureValue) < toleranceFvDiff) {
                        calculatedAnnualRateDecimal = midAnnualRate; 
                        break;
                    }

                    if (fvAtMidRate < projTargetFutureValue) {
                        lowAnnualRate = midAnnualRate;
                    } else {
                        highAnnualRate = midAnnualRate;
                    }

                     if (Math.abs(highAnnualRate - lowAnnualRate) < toleranceRateDiff) {
                        calculatedAnnualRateDecimal = ((lowAnnualRate + highAnnualRate) / 2); 
                        break;
                     }
                }
                 if (calculatedAnnualRateDecimal === undefined ) {
                     midAnnualRate = (lowAnnualRate + highAnnualRate) / 2;
                     const ratePerPeriodGuess = midAnnualRate / compoundingPeriodsPerYear;
                     if (Math.abs(ratePerPeriodGuess) < 1e-9) {
                        fvAtMidRate = projInitialInvestment + effectiveContributionPerPeriod * totalPeriods;
                     } else {
                        fvAtMidRate = projInitialInvestment * Math.pow(1 + ratePerPeriodGuess, totalPeriods) +
                                    effectiveContributionPerPeriod * (Math.pow(1 + ratePerPeriodGuess, totalPeriods) - 1) / ratePerPeriodGuess;
                     }
                     if (Math.abs(fvAtMidRate - projTargetFutureValue) < toleranceFvDiff * 100 ) { 
                        calculatedAnnualRateDecimal = midAnnualRate;
                     } else {
                        toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target may be too high or too low for the given parameters, or parameters are inconsistent.", variant: "destructive"}); return;
                     }
                 }
            }
            
            if (calculatedAnnualRateDecimal === undefined || calculatedAnnualRateDecimal < 0 || calculatedAnnualRateDecimal > 5 || !isFinite(calculatedAnnualRateDecimal)) { 
                 toast({title: "Calculation Alert", description: "Calculated interest rate is unreasonable or invalid. Please check input parameters.", variant: "destructive"}); return;
            }
            resultsCalculatedInterestRate = parseFloat((calculatedAnnualRateDecimal * 100).toFixed(2)); 
            projInterestRate = resultsCalculatedInterestRate; 
        }


        if (projInitialInvestment === null || projContributionAmount === null || projInterestRate === null || projInvestmentDuration === null ||
            isNaN(projInitialInvestment) || isNaN(projContributionAmount) || isNaN(projInterestRate) || isNaN(projInvestmentDuration) || projInvestmentDuration < 0) {
          toast({ title: "Projection Error", description: "Core parameters for projection are missing or invalid after mode-specific calculations. Please review inputs.", variant: "destructive" });
          setResults(null);
          setYearlyData([]);
          return;
        }
        
        const projection = calculateFullProjection(
            projInitialInvestment,
            projContributionAmount, 
            selectedContributionFrequency, 
            projInterestRate,
            projInvestmentDuration,
            selectedCompoundingFrequency
        );
        
        displayFutureValue = (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== null) ? projTargetFutureValue : projection.futureValue;
        finalTotalInterest = projection.totalInterest;
        finalTotalContributions = projection.totalContributions;
        finalActualContributionAmountPerCompoundingPeriod = projection.actualContributionAmountPerCompoundingPeriod;
        
        if (currentCalculationModeFromForm === 'calculateMonthlyContribution' && resultsCalculatedUserContributionAmount !== undefined) { 
            form.setValue('contributionAmount', resultsCalculatedUserContributionAmount, { shouldValidate: false });
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
            calculatedContributionAmount: currentCalculationModeFromForm === 'calculateMonthlyContribution' ? projContributionAmount : undefined, 
            calculatedInterestRate: currentCalculationModeFromForm === 'calculateInterestRate' ? projInterestRate : undefined,
            calculatedInvestmentDuration: currentCalculationModeFromForm === 'calculateInvestmentDuration' ? projInvestmentDuration : undefined,
            originalTargetFutureValue: (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== null) ? projTargetFutureValue : undefined,
            actualContributionAmountPerCompoundingPeriod: finalActualContributionAmountPerCompoundingPeriod,
        };
        setResults(resultsToSet);
        setYearlyData(projection.yearlyData);
        setAiTips([]); 

        const formInputsForAICopy: InvestmentFormData = { 
            initialInvestment: projInitialInvestment,
            contributionAmount: projContributionAmount, 
            contributionFrequency: selectedContributionFrequency, 
            interestRate: projInterestRate,
            investmentDuration: projInvestmentDuration,
            targetFutureValue: (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== null) ? projTargetFutureValue : null,
            calculationMode: currentCalculationModeFromForm,
            compoundingFrequency: selectedCompoundingFrequency,
        };
        setFormInputsForAI(formInputsForAICopy);

    } catch (error) {
        console.error("Calculation Error in onSubmit:", error);
        let errorMsg = "An error occurred during calculation. Please check your inputs or try different values.";
        if (error instanceof Error) errorMsg = error.message; 
        toast({ title: "Calculation Error", description: errorMsg, variant: "destructive" });
        setResults(null);
        setYearlyData([]);
    }
  };

 useEffect(() => {
    if (results && formInputsForAI) {
      const { 
        initialInvestment, 
        contributionAmount, 
        contributionFrequency,
        interestRate,       
        investmentDuration, 
        compoundingFrequency 
      } = formInputsForAI; 
      
      const { 
        futureValue,        
        totalInterest, 
        totalContributions 
      } = results;

      const allParamsPresentAndValidForAI =
          initialInvestment !== null && !isNaN(initialInvestment) &&
          contributionAmount !== null && !isNaN(contributionAmount) &&
          contributionFrequency !== null &&
          interestRate !== null && !isNaN(interestRate) &&
          investmentDuration !== null && !isNaN(investmentDuration) &&
          compoundingFrequency !== null && 
          futureValue !== undefined && futureValue !== null && !isNaN(futureValue) &&
          totalInterest !== undefined && totalInterest !== null && !isNaN(totalInterest) &&
          totalContributions !== undefined && totalContributions !== null && !isNaN(totalContributions);

      if (!allParamsPresentAndValidForAI) {
          setIsLoadingTips(false);
          setAiTips([]);
          console.warn("AI Tips fetch skipped: Not all parameters for AI input are available, valid numbers, or non-null.", {formInputsForAI, results});
          return;
      }

      const fetchAITips = async () => {
        setIsLoadingTips(true);
        try {
          const aiInput: InvestmentTipsInput = {
            initialInvestment: initialInvestment!, 
            contributionAmount: contributionAmount!, 
            contributionFrequency: contributionFrequency!,
            interestRate: interestRate!, 
            investmentDuration: investmentDuration!, 
            compoundingFrequency: compoundingFrequency!, 
            futureValue: futureValue!, 
            totalInterest: totalInterest!,
            totalContributions: totalContributions!,
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
               description: "No specific tips were generated for this scenario, or the AI service is temporarily unavailable.", 
               variant: "default",
             });
          }
        } catch (error) { 
          console.warn("Network or client-side error fetching AI tips:", error);
          let clientErrorMsg = "Could not connect to the AI service. Please check your connection and try again.";
          if (error instanceof Error && error.message) {
             if (error.message.toLowerCase().includes('failed to fetch')) {
                clientErrorMsg = "Network error: Failed to fetch AI tips. Please check your internet connection.";
             } else {
                clientErrorMsg = "An unexpected error occurred while trying to get AI tips."
             }
          }
          toast({
            title: "AI Service Error",
            description: clientErrorMsg,
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
    if (yearlyData.length > 0 && formInputsForAI && formInputsForAI.initialInvestment !== null) {
        const baseContributions = formInputsForAI.initialInvestment; 
        
        let cumulativeContributions = baseContributions;
        const newChartData = yearlyData.map(data => {
          cumulativeContributions += (data.contributions || 0); 
          const amountInvestedAtYearEnd = cumulativeContributions;
          const interestAccumulatedUpToThisYearEnd = data.endingBalance - amountInvestedAtYearEnd;

        return {
          name: `Year ${Math.floor(data.year)}`, 
          totalValue: data.endingBalance,
          amountInvested: amountInvestedAtYearEnd,
          interestAccumulated: interestAccumulatedUpToThisYearEnd < 0 ? 0 : interestAccumulatedUpToThisYearEnd,
        };
      });
      setChartDisplayData(newChartData);
    } else {
      setChartDisplayData([]); 
    }
  }, [yearlyData, formInputsForAI]); 


  const compoundingFrequencyOptions = Object.values(CompoundingFrequencySchema.Values).map(value => ({
    value: value,
    label: value.charAt(0).toUpperCase() + value.slice(1)
  }));


  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col items-center">
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-headline font-bold text-primary">
         Compounding💲📈💰
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">Compound your financial future. Brightly.</p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="w-full flex flex-col items-center">
          <div className="w-full max-w-xl mb-12">
            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Investment Inputs
                </CardTitle>
                <CardDescription>Select a tab to choose what to calculate.</CardDescription>
              </CardHeader>
              <CardContent>
                 <Tabs
                    value={calculationMode}
                    onValueChange={(value) => handleTabChange(value as CalculationMode)}
                    className="mb-6"
                  >
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                      <TabsTrigger value="futureValue">Future Value</TabsTrigger>
                      <TabsTrigger value="calculateMonthlyContribution">Contrib. Amount</TabsTrigger> 
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
                              {...field} 
                              value={field.value === null ? '' : formatForDisplay(field.value)}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))} 
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
                            {...field}
                            value={field.value === null ? '' : formatForDisplay(field.value)}
                            onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
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
                      name="contributionAmount" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-base">
                            <DollarSign className="mr-2 h-4 w-4 text-primary" />
                            Contribution Amount ($)
                          </FormLabel>
                           <ShadcnFormDescription className="text-xs mb-2">
                            Amount contributed per frequency selected below.
                          </ShadcnFormDescription>
                          <FormControl>
                            <Input
                              type="text" 
                              placeholder="e.g., 100"
                              {...field}
                              value={field.value === null ? '' : formatForDisplay(field.value)}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {(calculationMode === 'futureValue' || calculationMode === 'calculateInterestRate' || calculationMode === 'calculateInvestmentDuration') && (
                     <FormField
                      control={form.control}
                      name="contributionFrequency"
                      render={({ field }) => (
                        <FormItem className="pt-1"> {/* Optimized: Reduced top padding, no separate label */}
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex items-center space-x-4" 
                            >
                              <FormItem className="flex items-center space-x-1.5">
                                <FormControl>
                                  <RadioGroupItem value="monthly" id="monthly-contrib-freq" />
                                </FormControl>
                                <FormLabel htmlFor="monthly-contrib-freq" className="font-normal text-sm">
                                  Monthly
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-1.5">
                                <FormControl>
                                  <RadioGroupItem value="yearly" id="yearly-contrib-freq" />
                                </FormControl>
                                <FormLabel htmlFor="yearly-contrib-freq" className="font-normal text-sm">
                                  Yearly
                                </FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {calculationMode === 'calculateMonthlyContribution' && (
                     <FormField
                      control={form.control}
                      name="contributionFrequency" 
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-base">Calculate As (Contribution Frequency)</FormLabel>
                           <ShadcnFormDescription className="text-xs">
                             The calculated contribution amount will be for this frequency.
                          </ShadcnFormDescription>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex items-center space-x-4 pt-1"
                            >
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <RadioGroupItem value="monthly" id="calc-monthly-contrib-freq" />
                                </FormControl>
                                <FormLabel htmlFor="calc-monthly-contrib-freq" className="font-normal text-base">
                                  Monthly
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <RadioGroupItem value="yearly" id="calc-yearly-contrib-freq" />
                                </FormControl>
                                <FormLabel htmlFor="calc-yearly-contrib-freq" className="font-normal text-base">
                                  Yearly
                                </FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}


                  <FormField
                    control={form.control}
                    name="compoundingFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center text-base"><Repeat className="mr-2 h-4 w-4 text-primary" />Compounding Frequency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="text-base">
                              <SelectValue placeholder="Select compounding frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {compoundingFrequencyOptions.map(option => (
                              <SelectItem key={option.value} value={option.value} className="text-base">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                              {...field}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                              value={field.value === null ? '' : formatForDisplay(field.value)}
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
                            <Input type="text" placeholder="e.g., 10"
                            {...field}
                            onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                            value={field.value === null ? '' : formatForDisplay(field.value)}
                            className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <Button 
                    type="submit" 
                    className="w-full text-lg py-6 bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all duration-300 ease-in-out transform hover:scale-105"
                    disabled={form.formState.isSubmitting || isLoadingTips}
                  >
                    {form.formState.isSubmitting || isLoadingTips ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : null}
                    Calculate
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>

      {isClient && results && (
        <div className="w-full max-w-5xl space-y-10 mt-12">
           <Card className="w-full shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <AreaChart className="mr-2 h-7 w-7" /> Investment Growth Chart
                </CardTitle>
                <CardDescription>Visual representation of your investment growth over time.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto"> 
                  {chartDisplayData.length > 0 ? (
                      <ChartContainer config={chartConfig} className="min-h-[300px] w-full min-w-[600px] aspect-video"> 
                      <ComposedChart data={chartDisplayData} margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
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
                </div>
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
                    <CardContent><p className="text-muted-foreground">No yearly data to display. Please ensure all inputs are valid and calculate.</p></CardContent>
                 </Card>
            )}

            <Card className="shadow-2xl shadow-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <TrendingUp className="mr-2 h-7 w-7" /> Results Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 {formInputsForAI?.initialInvestment !== null && formInputsForAI?.initialInvestment !== undefined && (
                  <div>
                    <p className="text-muted-foreground">Initial Investment (Input):</p>
                    <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.initialInvestment)}</p>
                  </div>
                )}
                {results.originalTargetFutureValue !== undefined && results.originalTargetFutureValue !== null && (
                     <div>
                        <p className="text-muted-foreground">Target Future Value (Input):</p>
                        <p className="text-xl font-semibold">{formatCurrency(results.originalTargetFutureValue)}</p>
                    </div>
                )}
                
                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateInterestRate' || 
                  formInputsForAI?.calculationMode === 'calculateInvestmentDuration') 
                  && formInputsForAI?.contributionAmount !== null && formInputsForAI?.contributionAmount !== undefined && ( 
                    <div>
                        <p className="text-muted-foreground">Contribution Amount (Input - {formInputsForAI.contributionFrequency || 'N/A'}):</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.contributionAmount)}</p>
                    </div>
                )}
                 {formInputsForAI?.contributionFrequency && (
                    (formInputsForAI.calculationMode === 'futureValue' ||
                     formInputsForAI.calculationMode === 'calculateInterestRate' ||
                     formInputsForAI.calculationMode === 'calculateInvestmentDuration'
                    ) && (
                    <div>
                        <p className="text-muted-foreground">Contribution Frequency (Input):</p>
                        <p className="text-xl font-semibold">{formInputsForAI.contributionFrequency.charAt(0).toUpperCase() + formInputsForAI.contributionFrequency.slice(1)}</p>
                    </div>
                    )
                )}
                 {results.actualContributionAmountPerCompoundingPeriod !== undefined && 
                  results.actualContributionAmountPerCompoundingPeriod !== null &&
                  formInputsForAI?.compoundingFrequency !== 'continuously' &&
                  formInputsForAI?.contributionAmount !== 0 && (
                   <div>
                     <p className="text-muted-foreground">Effective Contribution per Compounding Period:</p>
                     <p className="text-xl font-semibold">{formatCurrency(results.actualContributionAmountPerCompoundingPeriod)}</p>
                   </div>
                 )}


                {formInputsForAI?.compoundingFrequency && (
                     <div>
                        <p className="text-muted-foreground">Compounding Frequency (Input):</p>
                        <p className="text-xl font-semibold">{formInputsForAI.compoundingFrequency.charAt(0).toUpperCase() + formInputsForAI.compoundingFrequency.slice(1)}</p>
                    </div>
                )}

                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || 
                  formInputsForAI?.calculationMode === 'calculateInvestmentDuration') 
                  && formInputsForAI?.interestRate !== null && formInputsForAI?.interestRate !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate (Input):</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}

                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || 
                  formInputsForAI?.calculationMode === 'calculateInterestRate') 
                  && formInputsForAI?.investmentDuration !== null && formInputsForAI?.investmentDuration !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration (Input):</p>
                        <p className="text-xl font-semibold">{formatYears(formInputsForAI.investmentDuration)}</p>
                    </div>
                )}

                {results.calculatedContributionAmount !== undefined && results.calculatedContributionAmount !== null &&( 
                     <div>
                        <p className="text-muted-foreground">Calculated Contribution Amount ({formInputsForAI?.contributionFrequency || 'N/A'}):</p>
                        <p className="text-xl font-semibold text-primary">{formatCurrency(results.calculatedContributionAmount)}</p>
                    </div>
                )}
                {results.calculatedInterestRate !== undefined && results.calculatedInterestRate !== null && (
                     <div>
                        <p className="text-muted-foreground">Calculated Annual Interest Rate:</p>
                        <p className="text-xl font-semibold text-primary">{formatPercentage(results.calculatedInterestRate)}</p>
                    </div>
                )}
                {results.calculatedInvestmentDuration !== undefined && results.calculatedInvestmentDuration !== null &&(
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
