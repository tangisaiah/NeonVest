
"use client";

import type { InvestmentFormData, CalculationResults, YearlyData, CalculationMode, CompoundingFrequency } from '@/types';
import { InvestmentFormSchema, CompoundingFrequencySchema } from '@/types';
import { zodResolver }from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler, type SubmitErrorHandler } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadcnFormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
  // For '0' or 0, display '0'. Otherwise, convert to string.
  // This handles cases like 0.0 becoming '0' and not an empty string.
  if (numValue === 0) return '0';
  return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 20 });
};


const parseNumericInput = (inputValue: string | number | undefined | null): number | null => {
    if (inputValue === undefined || inputValue === null) return null;
    const stringValue = String(inputValue).trim();
    if (stringValue === "") return null;

    // Allow only digits, a single decimal point, and a leading minus sign
    const cleaned = stringValue.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '-.') return null;
    
    // Check for multiple decimal points or misplaced minus signs
    if ((cleaned.match(/\./g) || []).length > 1) return null;
    if ((cleaned.match(/-/g) || []).length > 1 || (cleaned.indexOf('-') > 0)) return null;


    const numberValue = parseFloat(cleaned);
    // Check if parseFloat resulted in NaN (e.g. for "--1", "1.2.3")
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
  interestRate: 7,
  investmentDuration: 10,
  targetFutureValue: 100000,
  calculationMode: 'futureValue',
  compoundingFrequency: 'monthly',
};

const getNumberOfPeriodsPerYear = (frequency: CompoundingFrequency | undefined | null): number => {
  if (!frequency) return 12; // Default to monthly if undefined
  switch (frequency) {
    case 'annually': return 1;
    case 'semiannually': return 2;
    case 'quarterly': return 4;
    case 'monthly': return 12;
    case 'semimonthly': return 24;
    case 'biweekly': return 26;
    case 'weekly': return 52;
    case 'daily': return 365;
    case 'continuously': return Infinity; // Special case
    default: return 12;
  }
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
    mode: "onSubmit", // Validate on submit
    reValidateMode: "onBlur", // Re-validate on blur after the first submit attempt
  });

  const { toast } = useToast();

 const handleTabChange = (newMode: CalculationMode) => {
    setCalculationMode(newMode);
    form.reset(defaultFormValues); // Reset to defaults first
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
    }

    if (newMode === 'futureValue') {
        // When calculating future value, targetFutureValue is not an input, so clear it.
        form.setValue('targetFutureValue', null, { shouldValidate: false });
    }
    // No need to explicitly set targetFutureValue to default for other modes, as form.reset() handled it.
    
    setResults(null);
    setYearlyData([]);
    setAiTips([]);
    setFormInputsForAI(null);
    setChartDisplayData([]);

    // Delay trigger to allow state to settle and avoid premature validation errors if possible.
    // Or consider only triggering validation on submit for tab changes.
    // For now, let's keep the trigger to ensure the form is validated for the new mode's requirements.
    // If it causes issues, we can make it form.trigger(undefined, { shouldFocus: false });
    // or remove it and rely on onSubmit validation.
    setTimeout(() => form.trigger(), 0);
  };


  const calculateFullProjection = (
    initialInvestment: number,
    contributionAmount: number, 
    interestRate: number,
    investmentDuration: number,
    compoundingFrequency: CompoundingFrequency
  ): { yearlyData: YearlyData[], futureValue: number, totalInterest: number, totalContributions: number } => {
    
    if (compoundingFrequency === 'continuously') {
      if (contributionAmount > 0) {
        toast({
          title: "Continuous Compounding Note",
          description: "Periodic contributions are not factored into future value for continuous compounding in this calculator version. Calculation proceeds with initial investment only.",
          variant: "default"
        });
      }
      const annualInterestRateDecimal = interestRate / 100;
      const futureValue = initialInvestment * Math.exp(annualInterestRateDecimal * investmentDuration);
      const totalContributions = initialInvestment; // Only initial for continuous if contributions are ignored
      const totalInterest = futureValue - totalContributions;
      
      const yearlyDataContinuous: YearlyData[] = [];
      // let currentBalanceContinuous = initialInvestment; // Not strictly needed here
       for (let year = 1; year <= investmentDuration; year++) {
          const endOfYearBalance = initialInvestment * Math.exp(annualInterestRateDecimal * year);
          const startOfYearBalance = year === 1 ? initialInvestment : initialInvestment * Math.exp(annualInterestRateDecimal * (year -1));
          yearlyDataContinuous.push({
            year: year,
            startingBalance: startOfYearBalance,
            contributions: 0, // Contributions are ignored for FV in this continuous model
            interestEarned: endOfYearBalance - startOfYearBalance,
            endingBalance: endOfYearBalance,
          });
          // currentBalanceContinuous = endOfYearBalance; // Not strictly needed here
       }

      return {
        yearlyData: yearlyDataContinuous,
        futureValue,
        totalInterest,
        totalContributions,
      };
    }

    const periodsPerYear = getNumberOfPeriodsPerYear(compoundingFrequency);
    const annualInterestRateDecimal = interestRate / 100;
    const ratePerPeriod = annualInterestRateDecimal / periodsPerYear;
    const totalPeriods = Math.round(investmentDuration * periodsPerYear); // Round to handle potential floating point issues with duration

    let currentBalance = initialInvestment;
    const newYearlyData: YearlyData[] = [];
    let totalContributionsOverall = initialInvestment; // Start with initial investment

    let yearCounterForTable = 1;
    let periodsInCurrentYear = 0;
    let startingBalanceForYear = initialInvestment;
    let totalInterestThisYear = 0;
    let totalContributionsThisYear = 0; 

    for (let period = 1; period <= totalPeriods; period++) {
        const interestThisPeriod = currentBalance * ratePerPeriod;
        currentBalance += interestThisPeriod;
        totalInterestThisYear += interestThisPeriod;

        // Add contribution at the end of the period (common convention)
        // If it's not the very first period (initial investment is already in currentBalance)
        // OR if it is the first period, this contribution is in addition to initial.
        // However, our totalContributionsOverall already started with initial.
        // So contributions here are only the periodic ones.
        if (contributionAmount > 0) { 
            currentBalance += contributionAmount;
            totalContributionsThisYear += contributionAmount;
            totalContributionsOverall += contributionAmount;
        }
        periodsInCurrentYear++;

        // If it's the end of a year OR the very last period of the investment
        if (periodsInCurrentYear === periodsPerYear || period === totalPeriods) {
            
            // Ensure we don't create more years in the table than the actual duration,
            // unless it's the final period which might complete a partial year.
            if (yearCounterForTable <= Math.ceil(investmentDuration) || (period === totalPeriods && periodsInCurrentYear > 0)) {
                newYearlyData.push({
                    year: yearCounterForTable,
                    startingBalance: startingBalanceForYear,
                    interestEarned: totalInterestThisYear,
                    contributions: totalContributionsThisYear, // periodic contributions for this year
                    endingBalance: currentBalance,
                });
            }
            yearCounterForTable++;
            periodsInCurrentYear = 0;
            startingBalanceForYear = currentBalance;
            totalInterestThisYear = 0;
            totalContributionsThisYear = 0; // Reset for next year's periodic contributions
        }
    }
    
    const futureValue = currentBalance;
    // totalInterestEarned should be FV - (Initial + All Periodic Contributions)
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
    const currentCalculationModeFromForm = data.calculationMode || calculationMode; // Ensure we have the mode
    console.log("FORM SUBMITTED, raw data:", data, "Mode:", currentCalculationModeFromForm);
    
    let parsedInitialInvestment = parseNumericInput(data.initialInvestment);
    let parsedContributionAmount = parseNumericInput(data.contributionAmount); 
    let parsedInterestRate = parseNumericInput(data.interestRate);
    let parsedInvestmentDuration = parseNumericInput(data.investmentDuration);
    let parsedTargetFutureValue = parseNumericInput(data.targetFutureValue);
    const selectedCompoundingFrequency = data.compoundingFrequency || 'monthly'; // Default if somehow missing

    // Universal check: Initial Investment is always required.
    if (parsedInitialInvestment === null) {
        toast({ title: "Input Error", description: "Initial Investment is required and cannot be empty.", variant: "destructive" });
        form.setError("initialInvestment", { type: "manual", message: "Initial Investment is required." });
        return;
    }
    
    let projInitialInvestment: number = parsedInitialInvestment; // Now definitely a number
    let projContributionAmount: number | null = null; 
    let projInterestRate: number | null = null;
    let projInvestmentDuration: number | null = null;
    let projTargetFutureValue: number | null = parsedTargetFutureValue; // Can be null if not relevant

    let resultsCalculatedContributionAmount: number | undefined = undefined; 
    let resultsCalculatedInterestRate: number | undefined = undefined;
    let resultsCalculatedInvestmentDuration: number | undefined = undefined;
    
    let displayFutureValue: number | undefined;
    let finalTotalInterest: number | undefined;
    let finalTotalContributions: number | undefined;

    const periodsPerYear = getNumberOfPeriodsPerYear(selectedCompoundingFrequency);

    // Specific handling for continuous compounding and goal-seeking modes with contributions
    if (selectedCompoundingFrequency === 'continuously' && currentCalculationModeFromForm !== 'futureValue') {
        // If we are trying to calculate contribution, rate, or duration with continuous compounding
        // AND the user *provided* a non-zero contribution (for rate/duration modes)
        // OR if calculating contribution itself (where it would become non-zero)
        const contributionIsActuallyZeroOrNull = (currentCalculationModeFromForm === 'calculateInterestRate' || currentCalculationModeFromForm === 'calculateInvestmentDuration') 
                                              ? (parsedContributionAmount === null || parsedContributionAmount === 0)
                                              : false; // For calculateMonthlyContribution, we assume it *will* be non-zero if solvable

        if (!contributionIsActuallyZeroOrNull) {
             toast({title:"Limitation with Continuous Compounding", description: "Goal seeking (calculating Contribution, Rate, or Duration) with periodic contributions is not fully supported for continuous compounding in this version. Try with 0 contribution amount or a discrete compounding frequency.", variant: "default"});
             return; // Stop processing for these complex continuous goal-seeking cases for now
        }
    }


    try {
        if (currentCalculationModeFromForm === 'futureValue') {
            // Inputs: contribution, rate, duration
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

        } else if (currentCalculationModeFromForm === 'calculateMonthlyContribution') { // Calculate Contribution Amount
            // Inputs: rate, duration, target FV
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

            const ratePerPeriod = (projInterestRate / 100) / periodsPerYear;
            const totalPeriods = projInvestmentDuration * periodsPerYear;
            let calculatedContribution: number;

            if (totalPeriods === 0) {
                 toast({ title: "Calculation Error", description: "Investment duration results in zero periods for contribution.", variant: "destructive" }); return;
            }
            if (ratePerPeriod === 0) { // Simple interest case or no interest
                calculatedContribution = (projTargetFutureValue - projInitialInvestment) / totalPeriods;
            } else {
                const futureValueOfInitial = projInitialInvestment * Math.pow(1 + ratePerPeriod, totalPeriods);
                // FV_annuity = C * [((1+r)^n - 1) / r]
                // C = (TargetFV - FV_initial) * r / ((1+r)^n - 1)
                const denominator = (Math.pow(1 + ratePerPeriod, totalPeriods) - 1);
                if (Math.abs(denominator) < 1e-9) { 
                    toast({ title: "Calculation Error", description: "Cannot calculate contribution (potential division by zero or unstable formula). Try adjusting interest rate or duration.", variant: "destructive" }); return;
                }
                calculatedContribution = (projTargetFutureValue - futureValueOfInitial) * ratePerPeriod / denominator;
            }

            if (calculatedContribution < 0 || !isFinite(calculatedContribution)) {
                toast({title: "Calculation Alert", description: "Target is unachievable with positive contributions, or calculation is invalid. Calculated contribution set to 0 for projection. Your target might be too low or already met.", variant: "default"});
                 resultsCalculatedContributionAmount = 0;
            } else {
                resultsCalculatedContributionAmount = parseFloat(calculatedContribution.toFixed(2)); // Keep 2 decimal places
            }
            projContributionAmount = resultsCalculatedContributionAmount; // This is what will be used in projection
            
        } else if (currentCalculationModeFromForm === 'calculateInvestmentDuration') {
            // Inputs: contribution, rate, target FV
            if (parsedContributionAmount === null) { form.setError("contributionAmount", {type: "manual", message: "Contribution Amount is required."}); }
            if (parsedInterestRate === null) { form.setError("interestRate", {type: "manual", message: "Interest Rate is required."}); }
            if (projTargetFutureValue === null) { form.setError("targetFutureValue", {type: "manual", message: "Target Future Value is required."}); }
            if (parsedContributionAmount === null || parsedInterestRate === null || projTargetFutureValue === null) {
                toast({ title: "Input Error", description: "To calculate Investment Duration, please fill: Contribution Amount, Interest Rate, and Target Future Value.", variant: "destructive" }); return;
            }
            projContributionAmount = parsedContributionAmount;
            projInterestRate = parsedInterestRate;

            const ratePerPeriod = (projInterestRate / 100) / periodsPerYear;
            let calculatedTotalPeriods: number | undefined;

            if (projTargetFutureValue <= projInitialInvestment && projContributionAmount <= 0) {
                toast({ title: "Calculation Info", description: "Target value already met or cannot be reached with non-positive contributions. Duration is effectively 0.", variant: "default" });
                resultsCalculatedInvestmentDuration = 0;
            } else if (ratePerPeriod === 0) { // No interest
                if (projContributionAmount <= 0 && projTargetFutureValue > projInitialInvestment) {
                     toast({ title: "Calculation Error", description: "Cannot reach target with 0% interest and no (or negative) contributions.", variant: "destructive" }); return;
                }
                 // TargetFV = Initial + Contribution * N_periods => N_periods = (TargetFV - Initial) / Contribution
                calculatedTotalPeriods = (projTargetFutureValue - projInitialInvestment) / projContributionAmount;
            } else {
                // FV = P(1+r)^n + C * [((1+r)^n - 1)/r]
                // FV*r = P*r*(1+r)^n + C*(1+r)^n - C
                // FV*r + C = (P*r + C) * (1+r)^n
                // (FV*r + C) / (P*r + C) = (1+r)^n
                // n = log((FV*r + C) / (P*r + C)) / log(1+r)
                const valForLogNumerator = (projTargetFutureValue * ratePerPeriod + projContributionAmount);
                const valForLogDenominator = (projInitialInvestment * ratePerPeriod + projContributionAmount);

                if (valForLogDenominator === 0 || valForLogNumerator / valForLogDenominator <= 0) { // Avoid log of non-positive
                     toast({ title: "Calculation Error", description: "Cannot calculate duration (invalid logarithm due to parameters). Target may be unachievable or parameters lead to an impossible scenario.", variant: "destructive" }); return;
                }
                calculatedTotalPeriods = Math.log(valForLogNumerator / valForLogDenominator) / Math.log(1 + ratePerPeriod);
            }
            
            if (calculatedTotalPeriods === undefined || calculatedTotalPeriods < 0 || !isFinite(calculatedTotalPeriods)) {
                 if (resultsCalculatedInvestmentDuration !== 0) { // Avoid overwriting if already set to 0 by earlier condition
                    toast({title: "Calculation Alert", description: "Target is likely unachievable or calculation resulted in an invalid duration. Check your inputs.", variant: "default"}); return;
                 }
            }
            // If resultsCalculatedInvestmentDuration was already set to 0, use that. Otherwise, calculate from total periods.
            resultsCalculatedInvestmentDuration = resultsCalculatedInvestmentDuration === 0 ? 0 : parseFloat(((calculatedTotalPeriods || 0) / periodsPerYear).toFixed(2));
            projInvestmentDuration = resultsCalculatedInvestmentDuration; // This is what will be used in projection
            
        } else if (currentCalculationModeFromForm === 'calculateInterestRate') {
            // Inputs: contribution, duration, target FV
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

            const totalPeriods = projInvestmentDuration * periodsPerYear;
            let lowAnnualRate = 0.0;    // 0%
            let highAnnualRate = 5.0;   // 500% (as decimal) - a very high upper bound
            let midAnnualRate;
            let fvAtMidRate;
            const maxIterations = 100;
            const toleranceFvDiff = 0.01; // Target $0.01 difference in Future Value
            const toleranceRateDiff = 1e-7; // Target 0.00001% difference in rate (as decimal)
            let calculatedAnnualRateDecimal: number | undefined;

            const totalContributionsOnlyPlain = projInitialInvestment + projContributionAmount * totalPeriods;
            
            if (projTargetFutureValue < totalContributionsOnlyPlain - toleranceFvDiff && projContributionAmount >=0) { 
                 toast({ title: "Target Value Alert", description: "Target value is less than total contributions (even with 0% interest). A negative interest rate would be required, which is not supported. Setting rate to 0%.", variant: "default" });
                 calculatedAnnualRateDecimal = 0.0; // as decimal
            } else if (Math.abs(projTargetFutureValue - totalContributionsOnlyPlain) < toleranceFvDiff) { // Target equals total plain contributions
                 calculatedAnnualRateDecimal = 0.0; // as decimal
            } else {
                // Iterative search for the rate (Newton-Raphson or bisection method)
                // Bisection method is simpler to implement robustly here
                for (let iter = 0; iter < maxIterations; iter++) {
                    midAnnualRate = (lowAnnualRate + highAnnualRate) / 2;
                    const ratePerPeriodGuess = midAnnualRate / periodsPerYear;

                    if (Math.abs(ratePerPeriodGuess) < 1e-9) { // if rate is effectively zero
                        fvAtMidRate = projInitialInvestment + projContributionAmount * totalPeriods;
                    } else {
                        fvAtMidRate = projInitialInvestment * Math.pow(1 + ratePerPeriodGuess, totalPeriods) +
                                    projContributionAmount * (Math.pow(1 + ratePerPeriodGuess, totalPeriods) - 1) / ratePerPeriodGuess;
                    }

                    if (Math.abs(fvAtMidRate - projTargetFutureValue) < toleranceFvDiff) {
                        calculatedAnnualRateDecimal = midAnnualRate; // store as decimal
                        break;
                    }

                    if (fvAtMidRate < projTargetFutureValue) {
                        lowAnnualRate = midAnnualRate;
                    } else {
                        highAnnualRate = midAnnualRate;
                    }

                     if (Math.abs(highAnnualRate - lowAnnualRate) < toleranceRateDiff) {
                        calculatedAnnualRateDecimal = ((lowAnnualRate + highAnnualRate) / 2); // store as decimal
                        break;
                     }
                }
                 if (calculatedAnnualRateDecimal === undefined ) {
                     // If not converged, check the last mid-point with a slightly looser tolerance
                     midAnnualRate = (lowAnnualRate + highAnnualRate) / 2;
                     const ratePerPeriodGuess = midAnnualRate / periodsPerYear;
                     if (Math.abs(ratePerPeriodGuess) < 1e-9) {
                        fvAtMidRate = projInitialInvestment + projContributionAmount * totalPeriods;
                     } else {
                        fvAtMidRate = projInitialInvestment * Math.pow(1 + ratePerPeriodGuess, totalPeriods) +
                                    projContributionAmount * (Math.pow(1 + ratePerPeriodGuess, totalPeriods) - 1) / ratePerPeriodGuess;
                     }
                     // Use a more tolerant check if iterations maxed out
                     if (Math.abs(fvAtMidRate - projTargetFutureValue) < toleranceFvDiff * 100 ) { 
                        calculatedAnnualRateDecimal = midAnnualRate;
                     } else {
                        toast({title: "Calculation Alert", description: "Could not determine a reasonable interest rate. Target may be too high or too low for the given parameters, or parameters are inconsistent.", variant: "destructive"}); return;
                     }
                 }
            }
            
            if (calculatedAnnualRateDecimal === undefined || calculatedAnnualRateDecimal < 0 || calculatedAnnualRateDecimal > 5 || !isFinite(calculatedAnnualRateDecimal)) { // Max 500% (decimal 5)
                 toast({title: "Calculation Alert", description: "Calculated interest rate is unreasonable or invalid. Please check input parameters.", variant: "destructive"}); return;
            }
            resultsCalculatedInterestRate = parseFloat((calculatedAnnualRateDecimal * 100).toFixed(2)); // Convert to percentage
            projInterestRate = resultsCalculatedInterestRate; // This is what will be used in projection
        }


        // At this point, projInitialInvestment, projContributionAmount, projInterestRate, projInvestmentDuration should be set
        // either from user input (for FV mode) or from calculation (for other modes).
        // Perform a final check that all these projection inputs are valid numbers.
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
            projInterestRate,
            projInvestmentDuration,
            selectedCompoundingFrequency
        );
        
        // Use the target future value for display if we were calculating for it, otherwise use projected.
        displayFutureValue = (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== null) ? projTargetFutureValue : projection.futureValue;
        finalTotalInterest = projection.totalInterest;
        finalTotalContributions = projection.totalContributions;
        
        // Update form fields with calculated values if they were calculated
        if (currentCalculationModeFromForm === 'calculateMonthlyContribution' && resultsCalculatedContributionAmount !== undefined) { 
            form.setValue('contributionAmount', resultsCalculatedContributionAmount, { shouldValidate: false });
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
            // Store the *actually used* or *calculated* values for display in summary
            calculatedContributionAmount: currentCalculationModeFromForm === 'calculateMonthlyContribution' ? projContributionAmount : undefined, 
            calculatedInterestRate: currentCalculationModeFromForm === 'calculateInterestRate' ? projInterestRate : undefined,
            calculatedInvestmentDuration: currentCalculationModeFromForm === 'calculateInvestmentDuration' ? projInvestmentDuration : undefined,
            originalTargetFutureValue: (currentCalculationModeFromForm !== 'futureValue' && projTargetFutureValue !== null) ? projTargetFutureValue : undefined,
        };
        setResults(resultsToSet);
        setYearlyData(projection.yearlyData);
        setAiTips([]); // Clear old tips, new ones will be fetched in useEffect

        // Prepare inputs for AI, using the final parameters that led to the projection
        const formInputsForAICopy: InvestmentFormData = { 
            initialInvestment: projInitialInvestment,
            contributionAmount: projContributionAmount, 
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
        if (error instanceof Error) errorMsg = error.message; // Can provide more specific error if needed
        toast({ title: "Calculation Error", description: errorMsg, variant: "destructive" });
        setResults(null);
        setYearlyData([]);
    }
  };

 useEffect(() => {
    if (results && formInputsForAI) {
      // Destructure all necessary parameters from formInputsForAI and results
      const { 
        initialInvestment, 
        contributionAmount, // This is the one used/calculated for the projection
        interestRate,       // This is the one used/calculated for the projection
        investmentDuration, // This is the one used/calculated for the projection
        compoundingFrequency 
      } = formInputsForAI; 
      
      const { 
        futureValue,        // This is the one displayed (either projected or target)
        totalInterest, 
        totalContributions 
      } = results;

      // Validate that all parameters needed for AI are actual numbers and not null/undefined
      const allParamsPresentAndValidForAI =
          initialInvestment !== null && !isNaN(initialInvestment) &&
          contributionAmount !== null && !isNaN(contributionAmount) && 
          interestRate !== null && !isNaN(interestRate) &&
          investmentDuration !== null && !isNaN(investmentDuration) &&
          compoundingFrequency !== null && // Already a string enum, should be fine
          futureValue !== undefined && futureValue !== null && !isNaN(futureValue) &&
          totalInterest !== undefined && totalInterest !== null && !isNaN(totalInterest) &&
          totalContributions !== undefined && totalContributions !== null && !isNaN(totalContributions);

      if (!allParamsPresentAndValidForAI) {
          setIsLoadingTips(false);
          setAiTips([]);
          console.warn("AI Tips fetch skipped: Not all parameters for AI input are available, valid numbers, or non-null.", {formInputsForAI, results});
          // Optionally, provide a soft toast to the user if this state is unexpected.
          // toast({ title: "AI Tips Unavailable", description: "Could not generate AI tips due to incomplete calculation data.", variant: "default"});
          return;
      }

      const fetchAITips = async () => {
        setIsLoadingTips(true);
        try {
          const aiInput: InvestmentTipsInput = {
            initialInvestment: initialInvestment!, // Assertion: already checked for null/NaN
            contributionAmount: contributionAmount!, 
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
              description: tipsResult.error, // Display the error from the AI flow
              variant: "destructive",
            });
            setAiTips([]);
          } else if (tipsResult.tips && tipsResult.tips.length > 0) {
            setAiTips(tipsResult.tips);
          } else {
            setAiTips([]); // No tips returned, but no error
             toast({
               title: "AI Tips",
               description: "No specific tips were generated for this scenario, or the AI service is temporarily unavailable.", // Slightly more informative
               variant: "default",
             });
          }
        } catch (error) { // Catch network/client-side errors during the fetch itself
          console.warn("Network or client-side error fetching AI tips:", error);
          let clientErrorMsg = "Could not connect to the AI service. Please check your connection and try again.";
          if (error instanceof Error && error.message) {
             // Avoid showing generic "fetch failed" by being more specific if possible, but keep it user-friendly
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
  }, [results, formInputsForAI]); // formInputsForAI is crucial here

  useEffect(() => {
    if (yearlyData.length > 0 && formInputsForAI && formInputsForAI.initialInvestment !== null) {
        const baseContributions = formInputsForAI.initialInvestment; // Should be a number here
        
        const newChartData = yearlyData.map(data => {
          // Calculate total periodic contributions up to the beginning of the current year's data row
          const periodicContributionsBeforeThisYearEntry = yearlyData
            .slice(0, yearlyData.findIndex(y => y.year === data.year)) // Get all rows *before* current
            .reduce((acc, curr) => acc + (curr.contributions || 0), 0); // Sum their 'contributions' field
          
          // Amount invested at year end = Initial + All Periodic Contributions UP TO AND INCLUDING this year's periodic contributions
          const amountInvestedAtYearEnd = baseContributions + periodicContributionsBeforeThisYearEntry + (data.contributions || 0);
          
          // Interest accumulated = Ending Balance - Amount Invested At Year End
          const interestAccumulatedUpToThisYearEnd = data.endingBalance - amountInvestedAtYearEnd;

        return {
          name: `Year ${Math.floor(data.year)}`, // Ensure integer display for year
          totalValue: data.endingBalance,
          amountInvested: amountInvestedAtYearEnd,
          // Ensure interest accumulated isn't negative due to floating point math, though less likely with this logic
          interestAccumulated: interestAccumulatedUpToThisYearEnd < 0 ? 0 : interestAccumulatedUpToThisYearEnd,
        };
      });
      setChartDisplayData(newChartData);
    } else {
      setChartDisplayData([]); // Clear chart if no data
    }
  }, [yearlyData, formInputsForAI]); // Recalculate chart data if yearlyData or the core inputs change


  const compoundingFrequencyOptions = Object.values(CompoundingFrequencySchema.Values).map(value => ({
    value: value,
    label: value.charAt(0).toUpperCase() + value.slice(1)
  }));


  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col items-center">
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-headline font-bold text-primary">
          Compounding<span className="text-accent text-[1.1em] relative top-[-0.05em]">$</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">Compounding your financial future. Brightly.</p>
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
                  {/* Target Future Value - Input for goal-seeking modes */}
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
                              {...field} // Spread field props
                              value={formatForDisplay(field.value)} // Format value for display
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))} // Parse on change
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Initial Investment - Always an input */}
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
                            value={formatForDisplay(field.value)}
                            onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                            className="text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Contribution Amount - Input unless being calculated */}
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
                           <ShadcnFormDescription className="text-xs">
                            This amount is contributed each compounding period.
                          </ShadcnFormDescription>
                          <FormControl>
                            <Input
                              type="text" 
                              placeholder="e.g., 100"
                              {...field}
                              value={formatForDisplay(field.value)}
                              onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Compounding Frequency - Always an input */}
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

                  {/* Annual Interest Rate - Input unless being calculated */}
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
                              value={formatForDisplay(field.value)}
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {/* Investment Duration - Input unless being calculated */}
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
                            value={formatForDisplay(field.value)}
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
                <div className="overflow-x-auto"> {/* Makes chart scrollable on small screens */}
                  {chartDisplayData.length > 0 ? (
                      <ChartContainer config={chartConfig} className="min-h-[300px] w-full min-w-[600px] aspect-video"> {/* min-w ensures chart doesn't shrink too much */}
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
                {/* Display input values from formInputsForAI, and calculated values from results */}
                 {formInputsForAI?.initialInvestment !== null && formInputsForAI?.initialInvestment !== undefined && (
                  <div>
                    <p className="text-muted-foreground">Initial Investment (Input):</p>
                    <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.initialInvestment)}</p>
                  </div>
                )}
                {/* Display Target Future Value if it was an input for the calculation */}
                {results.originalTargetFutureValue !== undefined && results.originalTargetFutureValue !== null && (
                     <div>
                        <p className="text-muted-foreground">Target Future Value (Input):</p>
                        <p className="text-xl font-semibold">{formatCurrency(results.originalTargetFutureValue)}</p>
                    </div>
                )}
                
                {/* Display Contribution Amount if it was an input */}
                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateInterestRate' || 
                  formInputsForAI?.calculationMode === 'calculateInvestmentDuration') 
                  && formInputsForAI?.contributionAmount !== null && formInputsForAI?.contributionAmount !== undefined && ( 
                    <div>
                        <p className="text-muted-foreground">Contribution Amount (Input):</p>
                        <p className="text-xl font-semibold">{formatCurrency(formInputsForAI.contributionAmount)}</p>
                    </div>
                )}

                {formInputsForAI?.compoundingFrequency && (
                     <div>
                        <p className="text-muted-foreground">Compounding Frequency (Input):</p>
                        <p className="text-xl font-semibold">{formInputsForAI.compoundingFrequency.charAt(0).toUpperCase() + formInputsForAI.compoundingFrequency.slice(1)}</p>
                    </div>
                )}

                {/* Display Annual Interest Rate if it was an input */}
                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || 
                  formInputsForAI?.calculationMode === 'calculateInvestmentDuration') 
                  && formInputsForAI?.interestRate !== null && formInputsForAI?.interestRate !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Annual Interest Rate (Input):</p>
                        <p className="text-xl font-semibold">{formatPercentage(formInputsForAI.interestRate)}</p>
                    </div>
                )}

                {/* Display Investment Duration if it was an input */}
                {(formInputsForAI?.calculationMode === 'futureValue' || 
                  formInputsForAI?.calculationMode === 'calculateMonthlyContribution' || 
                  formInputsForAI?.calculationMode === 'calculateInterestRate') 
                  && formInputsForAI?.investmentDuration !== null && formInputsForAI?.investmentDuration !== undefined && (
                    <div>
                        <p className="text-muted-foreground">Investment Duration (Input):</p>
                        <p className="text-xl font-semibold">{formatYears(formInputsForAI.investmentDuration)}</p>
                    </div>
                )}

                {/* Display Calculated values if they exist in results */}
                {results.calculatedContributionAmount !== undefined && results.calculatedContributionAmount !== null &&( 
                     <div>
                        <p className="text-muted-foreground">Calculated Contribution Amount:</p>
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

                {/* Overall Projection Results */}
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

