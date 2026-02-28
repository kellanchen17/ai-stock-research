export type MorningstarStarRating = {
  symbol: string;
  stars: number;
  source: string;
  asOf: string;
};

export type DcfResult = {
  fairValue: number;
  valuePerShare: number;
  currentPrice: number;
  upsidePct: number;
  assumptions: {
    baseFcf: number;
    discountRate: number;
    terminalGrowth: number;
    forecastYears: number;
    growthRates: number[];
    sharesOutstanding: number;
  };
};

export type StockSnapshot = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  marketCap?: number;
  peTtm?: number;
  roeTtm?: number;
  operatingMarginTtm?: number;
  debtToEquity?: number;
  dcf: DcfResult;
  valueScore: number;
  qualityScore: number;
  moatProxyScore: number;
  growthScore: number;
  financialStrengthScore: number;
  momentumScore: number;
  compositeScore: number;
  caratRating: number;
  clarityScore: number;
  clarityLabel: string;
};

export type StockDetail = {
  snapshot: StockSnapshot;
  profile: Record<string, unknown>;
  metrics: Record<string, unknown>;
  candles: { t: number[]; c: number[] };
};

export type ScreenFilters = {
  sector?: string;
  minDiscountPct?: number;
  minCarat?: number;
  minQualityScore?: number;
  maxPeTtm?: number;
  limit?: number;
  sortBy?: 'discount' | 'quality' | 'value';
};
