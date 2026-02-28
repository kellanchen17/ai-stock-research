import type { DcfResult } from './types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeRatio(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (Math.abs(value) > 1.5) return value / 100;
  return value;
}

export function buildAdaptiveDcfInputs(params: {
  revenueGrowth?: number;
  epsGrowth?: number;
  roe?: number;
  operatingMargin?: number;
  debtToEquity?: number;
  beta?: number;
}) {
  const revenueGrowth = normalizeRatio(params.revenueGrowth);
  const epsGrowth = normalizeRatio(params.epsGrowth);
  const roe = normalizeRatio(params.roe);
  const operatingMargin = normalizeRatio(params.operatingMargin);
  const debtToEquity = params.debtToEquity ?? 1;
  const beta = params.beta ?? 1;

  const growthSeed = clamp(
    ((revenueGrowth ?? 0.05) * 0.6) + ((epsGrowth ?? 0.05) * 0.4) + ((roe ?? 0.12) * 0.1),
    0.01,
    0.22,
  );

  const terminalGrowth = clamp(0.02 + ((operatingMargin ?? 0.12) - 0.12) * 0.1, 0.0125, 0.035);
  const growthRates = [
    growthSeed,
    clamp(growthSeed - 0.0125, terminalGrowth + 0.005, 0.20),
    clamp(growthSeed - 0.025, terminalGrowth + 0.0025, 0.18),
    clamp(growthSeed - 0.0375, terminalGrowth, 0.15),
    clamp(growthSeed - 0.05, terminalGrowth, 0.12),
  ];

  const leveragePenalty = clamp((debtToEquity - 0.5) * 0.015, -0.01, 0.04);
  const qualityRelief = clamp(((roe ?? 0.12) - 0.12) * 0.06 + ((operatingMargin ?? 0.12) - 0.12) * 0.04, -0.015, 0.02);
  const betaAdj = clamp((beta - 1) * 0.02, -0.02, 0.03);
  const discountRate = clamp(0.095 + leveragePenalty + betaAdj - qualityRelief, 0.075, 0.16);

  return {
    growthRates,
    discountRate,
    terminalGrowth,
  };
}

export function calculateDcf(params: {
  currentPrice: number;
  baseFcf: number;
  sharesOutstanding: number;
  growthRates?: number[];
  discountRate?: number;
  terminalGrowth?: number;
}): DcfResult {
  const currentPrice = params.currentPrice || 0;
  const baseFcf = Math.max(params.baseFcf || 0, 1);
  const sharesOutstanding = Math.max(params.sharesOutstanding || 1, 1);
  const growthRates = params.growthRates ?? [0.08, 0.07, 0.06, 0.05, 0.04];
  const discountRate = clamp(params.discountRate ?? 0.1, 0.06, 0.18);
  const terminalGrowth = clamp(params.terminalGrowth ?? 0.025, 0.0, 0.04);

  let fcf = baseFcf;
  let pvSum = 0;

  growthRates.forEach((growth, i) => {
    fcf *= 1 + growth;
    const year = i + 1;
    pvSum += fcf / Math.pow(1 + discountRate, year);
  });

  const lastFcf = fcf;
  const terminalValue = (lastFcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  const terminalPv = terminalValue / Math.pow(1 + discountRate, growthRates.length);

  const fairValue = pvSum + terminalPv;
  const valuePerShare = fairValue / sharesOutstanding;
  const upsidePct = currentPrice > 0 ? ((valuePerShare - currentPrice) / currentPrice) * 100 : 0;

  return {
    fairValue,
    valuePerShare,
    currentPrice,
    upsidePct,
    assumptions: {
      baseFcf,
      discountRate,
      terminalGrowth,
      forecastYears: growthRates.length,
      growthRates,
      sharesOutstanding,
    },
  };
}
