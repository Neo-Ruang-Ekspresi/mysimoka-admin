/**
 * Statistik uji alat (validasi perangkat) terhadap nilai acuan bersertifikat.
 *
 * Modul murni (tanpa import) agar bisa diuji langsung dengan Node:
 *   node scripts/agreementStats.selfcheck.mjs
 * Hanya memakai sintaks TypeScript yang bisa di-"strip" (tanpa enum/namespace).
 *
 * Rujukan:
 *  - Bland JM, Altman DG (1986, 1999): bias, limits of agreement (LoA), CI bias & LoA
 *    (SE_bias = SD/√n, SE_LoA ≈ SD·√(3/n), kuantil t dengan n−1 df).
 *  - Shrout PE, Fleiss JL (1979); McGraw KO, Wong SP (1996): ICC(2,1) absolute agreement,
 *    two-way random, single measure, beserta CI berbasis F (aproksimasi Satterthwaite).
 *  - Repeatability coefficient = 1,96·√2·Sw ≈ 2,77·Sw (BSI 5497 / Bland & Altman 1999).
 */

// ---------------------------------------------------------------------------
// Distribusi: ln Γ, beta tak lengkap teregularisasi, CDF & kuantil t dan F.
// ---------------------------------------------------------------------------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Pecahan berlanjut untuk beta tak lengkap (Numerical Recipes `betacf`, metode Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

/** I_x(a, b): fungsi beta tak lengkap teregularisasi. */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** P(T ≤ t) untuk Student t dengan `df` derajat bebas (df boleh pecahan). */
export function tCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** P(F ≤ f) untuk distribusi F(d1, d2). */
export function fCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0;
  if (!Number.isFinite(f)) return 1;
  return regularizedBeta((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2);
}

/** Invers monoton via bisection (cukup presisi untuk laporan; ~1e-12). */
function invertMonotone(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  let low = lo;
  let high = hi;
  // Perlebar batas atas bila perlu.
  for (let i = 0; i < 200 && cdf(high) < p; i += 1) {
    low = high;
    high *= 2;
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (cdf(mid) < p) low = mid;
    else high = mid;
    if (high - low <= 1e-12 * Math.max(1, Math.abs(mid))) break;
  }
  return (low + high) / 2;
}

/** Kuantil t: nilai t sehingga P(T ≤ t) = p. */
export function tInv(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return Number.NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInv(1 - p, df);
  return invertMonotone(t => tCdf(t, df), p, 0, 16);
}

/** Kuantil F: nilai f sehingga P(F ≤ f) = p. */
export function fInv(p: number, d1: number, d2: number): number {
  if (!(p > 0 && p < 1) || !(d1 > 0) || !(d2 > 0)) return Number.NaN;
  return invertMonotone(f => fCdf(f, d1, d2), p, 0, 16);
}

// ---------------------------------------------------------------------------
// Statistik dasar
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** SD sampel (penyebut n−1). */
export function sampleSd(values: number[]): number {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  let ss = 0;
  for (const value of values) ss += (value - m) ** 2;
  return Math.sqrt(ss / (values.length - 1));
}

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

/** Satu bacaan alat dipasangkan dengan nilai acuannya. */
export type Pair = { reference: number; reading: number };

/** Bacaan berulang pada satu titik acuan (urut waktu). */
export type ReferenceGroup = { reference: number; readings: number[] };

/** Kelompokkan pasangan per nilai acuan (urut acuan naik, urutan bacaan dipertahankan). */
export function groupByReference(pairs: Pair[]): ReferenceGroup[] {
  const map = new Map<number, number[]>();
  for (const pair of pairs) {
    const list = map.get(pair.reference) ?? [];
    list.push(pair.reading);
    map.set(pair.reference, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([reference, readings]) => ({ reference, readings }));
}

// ---------------------------------------------------------------------------
// Galat (MAE, MAPE, maks)
// ---------------------------------------------------------------------------

export type ErrorSummary = { n: number; mae: number; mape: number | null; maxAbsError: number };

export function errorSummary(pairs: Pair[]): ErrorSummary {
  const abs = pairs.map(p => Math.abs(p.reading - p.reference));
  const pct = pairs.filter(p => p.reference !== 0).map(p => (Math.abs(p.reading - p.reference) / Math.abs(p.reference)) * 100);
  return {
    n: pairs.length,
    mae: mean(abs),
    mape: pct.length ? mean(pct) : null,
    maxAbsError: abs.length ? Math.max(...abs) : Number.NaN,
  };
}

// ---------------------------------------------------------------------------
// Bland–Altman
// ---------------------------------------------------------------------------

export type Interval = { lower: number; upper: number };

export type BlandAltman = {
  n: number;
  bias: number;
  sdDiff: number;
  loaLower: number;
  loaUpper: number;
  /** CI 95% (Bland & Altman 1999); dengan n kecil (df n−1) interval sangat lebar. */
  biasCi: Interval;
  loaLowerCi: Interval;
  loaUpperCi: Interval;
  tQuantile: number;
};

/** Bland–Altman terhadap acuan: d = bacaan − acuan. Butuh n ≥ 2. */
export function blandAltman(pairs: Pair[], confidence = 0.95): BlandAltman | null {
  const n = pairs.length;
  if (n < 2) return null;
  const diffs = pairs.map(p => p.reading - p.reference);
  const bias = mean(diffs);
  const sdDiff = sampleSd(diffs);
  const loaLower = bias - 1.96 * sdDiff;
  const loaUpper = bias + 1.96 * sdDiff;
  const t = tInv(1 - (1 - confidence) / 2, n - 1);
  const seBias = sdDiff / Math.sqrt(n);
  const seLoa = sdDiff * Math.sqrt(3 / n);
  return {
    n,
    bias,
    sdDiff,
    loaLower,
    loaUpper,
    biasCi: { lower: bias - t * seBias, upper: bias + t * seBias },
    loaLowerCi: { lower: loaLower - t * seLoa, upper: loaLower + t * seLoa },
    loaUpperCi: { lower: loaUpper - t * seLoa, upper: loaUpper + t * seLoa },
    tQuantile: t,
  };
}

// ---------------------------------------------------------------------------
// Bias proporsional: regresi linier selisih terhadap acuan
// ---------------------------------------------------------------------------

export type ProportionalBias = {
  n: number;
  slope: number;
  intercept: number;
  slopeSe: number;
  slopeCi: Interval;
  pValue: number;
  significant: boolean;
  /** Perubahan bias yang diprediksi dari acuan terkecil ke terbesar (slope × rentang). */
  biasChangeOverRange: number;
};

/** OLS d = a + b·acuan. Butuh ≥ 3 pasangan dan ≥ 2 nilai acuan berbeda. */
export function proportionalBias(pairs: Pair[], alpha = 0.05): ProportionalBias | null {
  const n = pairs.length;
  if (n < 3) return null;
  const xs = pairs.map(p => p.reference);
  const ys = pairs.map(p => p.reading - p.reference);
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const df = n - 2;
  const slopeSe = Math.sqrt(sse / df / sxx);
  const tq = tInv(1 - alpha / 2, df);
  let pValue: number;
  if (slopeSe === 0) pValue = Math.abs(slope) < 1e-12 ? 1 : 0;
  else pValue = 2 * (1 - tCdf(Math.abs(slope / slopeSe), df));
  pValue = Math.min(1, Math.max(0, pValue));
  return {
    n,
    slope,
    intercept,
    slopeSe,
    slopeCi: { lower: slope - tq * slopeSe, upper: slope + tq * slopeSe },
    pValue,
    significant: pValue < alpha,
    biasChangeOverRange: slope * (Math.max(...xs) - Math.min(...xs)),
  };
}

// ---------------------------------------------------------------------------
// ICC(2,1) absolute agreement, two-way random, single measure
// ---------------------------------------------------------------------------

export type IccResult = {
  icc: number;
  ci: Interval | null;
  /** Subjek (titik acuan) dan jumlah bacaan per subjek yang dipakai. */
  subjects: number;
  k: number;
  /** true bila sebagian titik punya bacaan lebih banyak dari k (dipotong ke k pertama). */
  truncated: boolean;
  msr: number;
  msc: number;
  mse: number;
};

/**
 * ICC(2,1) dari matriks n subjek × k pengukuran (Shrout & Fleiss 1979, ICC(2,1);
 * McGraw & Wong 1996, ICC(A,1)). CI 95% berbasis F dengan df Satterthwaite (seperti irr::icc).
 */
export function icc21(matrix: number[][], alpha = 0.05): Omit<IccResult, 'truncated'> | null {
  const n = matrix.length;
  if (n < 2) return null;
  const k = matrix[0].length;
  if (k < 2 || matrix.some(row => row.length !== k)) return null;
  let grand = 0;
  for (const row of matrix) for (const value of row) grand += value;
  grand /= n * k;
  let ssr = 0;
  for (const row of matrix) ssr += k * (mean(row) - grand) ** 2;
  let ssc = 0;
  for (let j = 0; j < k; j += 1) ssc += n * (mean(matrix.map(row => row[j])) - grand) ** 2;
  let sst = 0;
  for (const row of matrix) for (const value of row) sst += (value - grand) ** 2;
  const sse = Math.max(0, sst - ssr - ssc);
  const msr = ssr / (n - 1);
  const msc = ssc / (k - 1);
  const mse = sse / ((n - 1) * (k - 1));
  const denom = msr + (k - 1) * mse + (k * (msc - mse)) / n;
  if (!(denom > 0)) return null;
  const icc = (msr - mse) / denom;

  let ci: Interval | null = null;
  if (icc < 1 && mse > 0) {
    const a = (k * icc) / (n * (1 - icc));
    const b = 1 + (k * icc * (n - 1)) / (n * (1 - icc));
    const v = (a * msc + b * mse) ** 2 / ((a * msc) ** 2 / (k - 1) + (b * mse) ** 2 / ((n - 1) * (k - 1)));
    if (Number.isFinite(v) && v > 0) {
      const fl = fInv(1 - alpha / 2, n - 1, v);
      const fu = fInv(1 - alpha / 2, v, n - 1);
      const lower = (n * (msr - fl * mse)) / (fl * (k * msc + (k * n - k - n) * mse) + n * msr);
      const upper = (n * (fu * msr - mse)) / (k * msc + (k * n - k - n) * mse + n * fu * msr);
      ci = { lower, upper: Math.min(1, upper) };
    }
  } else if (icc >= 1) {
    ci = { lower: 1, upper: 1 };
  }
  return { icc, ci, subjects: n, k, msr, msc, mse };
}

export const ICC_MIN_SUBJECTS = 2;
export const ICC_MIN_READINGS = 2;

/** ICC dari kelompok titik acuan; bacaan dipotong ke k = jumlah bacaan minimum bersama. */
export function iccFromGroups(groups: ReferenceGroup[]): IccResult | null {
  const usable = groups.filter(g => g.readings.length >= ICC_MIN_READINGS);
  if (usable.length < ICC_MIN_SUBJECTS) return null;
  const k = Math.min(...usable.map(g => g.readings.length));
  const truncated = usable.some(g => g.readings.length > k) || usable.length < groups.length;
  const result = icc21(usable.map(g => g.readings.slice(0, k)));
  return result ? { ...result, truncated } : null;
}

// ---------------------------------------------------------------------------
// Repeatability
// ---------------------------------------------------------------------------

export type Repeatability = { sw: number; rc: number; df: number };

/** Sw = SD dalam-titik gabungan (pooled) dari semua bacaan; RC = 2,77·Sw. */
export function repeatability(groups: ReferenceGroup[]): Repeatability | null {
  let ss = 0;
  let df = 0;
  for (const group of groups) {
    if (group.readings.length < 2) continue;
    const m = mean(group.readings);
    for (const value of group.readings) ss += (value - m) ** 2;
    df += group.readings.length - 1;
  }
  if (df === 0) return null;
  const sw = Math.sqrt(ss / df);
  return { sw, rc: 2.77 * sw, df };
}

// ---------------------------------------------------------------------------
// Laporan lengkap + verdict
// ---------------------------------------------------------------------------

/** Proportional bias must change the bias by more than this share of the tolerance to fail. */
export const PROPORTIONAL_BIAS_TOLERANCE_FRACTION = 0.5;

export type Verdict = { status: 'layak' | 'perlu_kalibrasi' | 'tidak_cukup_data'; reasons: string[] };

export type AgreementReport = {
  pairs: Pair[];
  groups: ReferenceGroup[];
  errors: ErrorSummary;
  bland: BlandAltman | null;
  proportional: ProportionalBias | null;
  icc: IccResult | null;
  repeat: Repeatability | null;
  tolerance: number | null;
  verdict: Verdict;
};

function fmt(value: number, digits: number): string {
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function buildAgreementReport(
  pairs: Pair[],
  tolerance: number | null,
  options: { unit?: string; digits?: number } = {},
): AgreementReport {
  const unit = options.unit ?? '';
  const digits = options.digits ?? 2;
  const groups = groupByReference(pairs);
  const errors = errorSummary(pairs);
  const bland = blandAltman(pairs);
  const proportional = groups.length >= 2 ? proportionalBias(pairs) : null;
  const icc = iccFromGroups(groups);
  const repeat = repeatability(groups);

  const reasons: string[] = [];
  let status: Verdict['status'];
  if (!bland) {
    status = 'tidak_cukup_data';
    reasons.push('Minimal 2 bacaan dibutuhkan untuk menghitung batas kesesuaian.');
  } else if (tolerance === null || !(tolerance > 0)) {
    status = 'tidak_cukup_data';
    reasons.push('Batas toleransi tidak diketahui.');
  } else {
    if (bland.loaLower < -tolerance)
      reasons.push(
        `Batas bawah kesesuaian ${fmt(bland.loaLower, digits)} ${unit} melewati −${fmt(tolerance, digits)} ${unit}.`,
      );
    if (bland.loaUpper > tolerance)
      reasons.push(
        `Batas atas kesesuaian ${fmt(bland.loaUpper, digits)} ${unit} melewati +${fmt(tolerance, digits)} ${unit}.`,
      );
    // Proportional bias fails the device only when it is both statistically
    // significant and practically large: the bias changes by more than half
    // the tolerance across the reference range. With many repeated readings a
    // tiny, irrelevant slope is otherwise "significant".
    const proportionalLimit = tolerance * PROPORTIONAL_BIAS_TOLERANCE_FRACTION;
    const proportionalFails =
      !!proportional?.significant && Math.abs(proportional.biasChangeOverRange) > proportionalLimit;
    if (proportional && proportionalFails)
      reasons.push(
        `Ada bias proporsional bermakna (p = ${fmt(proportional.pValue, 3)}): selisih berubah ${fmt(
          proportional.biasChangeOverRange,
          digits,
        )} ${unit} dari acuan terkecil ke terbesar, melebihi batas ${fmt(proportionalLimit, digits)} ${unit} (separuh toleransi).`,
      );
    status = reasons.length === 0 ? 'layak' : 'perlu_kalibrasi';
    if (status === 'layak') {
      reasons.push(`Kedua batas kesesuaian berada di dalam ±${fmt(tolerance, digits)} ${unit}.`);
      if (proportional?.significant)
        reasons.push(
          `Bias proporsional bermakna secara statistik (p = ${fmt(proportional.pValue, 3)}), tetapi perubahannya ${fmt(
            proportional.biasChangeOverRange,
            digits,
          )} ${unit} masih di bawah ${fmt(proportionalLimit, digits)} ${unit} (separuh toleransi), jadi tidak berarti secara praktis.`,
        );
      else if (proportional) reasons.push('Tidak ada bias proporsional bermakna.');
    }
  }
  return { pairs, groups, errors, bland, proportional, icc, repeat, tolerance, verdict: { status, reasons } };
}
