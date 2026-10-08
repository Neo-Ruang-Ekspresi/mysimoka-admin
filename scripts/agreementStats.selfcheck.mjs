// Self-check src/lib/agreementStats.ts terhadap contoh hitung tangan & nilai rujukan.
// Jalankan: node scripts/agreementStats.selfcheck.mjs   (Node ≥ 22.18 / 23.6: type stripping bawaan)
import {
  blandAltman,
  buildAgreementReport,
  errorSummary,
  fInv,
  groupByReference,
  icc21,
  iccFromGroups,
  proportionalBias,
  repeatability,
  tCdf,
  tInv,
} from '../src/lib/agreementStats.ts';

let failed = 0;
let passed = 0;
function close(name, actual, expected, tol = 1e-6) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${actual} (harap ${expected} ±${tol})`);
}
function check(name, cond) {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
}

// --- Distribusi (nilai tabel standar) ---
close('tInv(0.975, 1)', tInv(0.975, 1), 12.706205, 1e-5);
close('tInv(0.975, 5)', tInv(0.975, 5), 2.570582, 1e-5);
close('tInv(0.975, 30)', tInv(0.975, 30), 2.042272, 1e-5);
close('tInv(0.975, 1e6) ≈ z', tInv(0.975, 1e6), 1.959966, 1e-4);
close('tInv(0.025, 10) = −tInv(0.975, 10)', tInv(0.025, 10), -2.228139, 1e-5);
close('tCdf(2.228139, 10)', tCdf(2.228139, 10), 0.975, 1e-6);
close('fInv(0.95, 5, 10)', fInv(0.95, 5, 10), 3.325835, 1e-5);
close('fInv(0.95, 2, 10)', fInv(0.95, 2, 10), 4.102821, 1e-5);
// F(1, ν) pada p = (t₀,₉₇₅,ν)²
close('fInv(0.95, 1, 20) = t(0.975, 20)²', fInv(0.95, 1, 20), 2.085963 ** 2, 1e-4);

// --- Contoh hitung tangan: 2 titik acuan × 3 bacaan ---
// acuan 10: 10,1 10,0 10,2 ; acuan 20: 20,1 19,9 20,0
// d = [0,1 0 0,2 0,1 −0,1 0] → bias 0,05; Σ(d−d̄)² = 0,055 → SD = √0,011 = 0,104881
const pairs = [
  [10, 10.1],
  [10, 10.0],
  [10, 10.2],
  [20, 20.1],
  [20, 19.9],
  [20, 20.0],
].map(([reference, reading]) => ({ reference, reading }));

const ba = blandAltman(pairs);
close('BA bias', ba.bias, 0.05, 1e-9);
close('BA SD selisih', ba.sdDiff, Math.sqrt(0.011), 1e-9);
close('BA LoA bawah', ba.loaLower, 0.05 - 1.96 * Math.sqrt(0.011), 1e-9);
close('BA LoA atas', ba.loaUpper, 0.05 + 1.96 * Math.sqrt(0.011), 1e-9);
// CI bias = 0,05 ± 2,570582·0,104881/√6 = 0,05 ± 0,110065
close('BA CI bias bawah', ba.biasCi.lower, 0.05 - 0.110065, 1e-5);
close('BA CI bias atas', ba.biasCi.upper, 0.05 + 0.110065, 1e-5);
// CI LoA = LoA ± 2,570582·0,104881·√(3/6) = ± 0,190636
close('BA CI LoA atas (atas)', ba.loaUpperCi.upper, 0.05 + 1.96 * Math.sqrt(0.011) + 0.190636, 1e-5);
close('BA CI LoA bawah (bawah)', ba.loaLowerCi.lower, 0.05 - 1.96 * Math.sqrt(0.011) - 0.190636, 1e-5);

const err = errorSummary(pairs);
close('MAE', err.mae, 0.5 / 6, 1e-9);
close('MAPE %', err.mape, (0.04 / 6) * 100, 1e-9);
close('Maks |galat|', err.maxAbsError, 0.2, 1e-9);

const groups = groupByReference(pairs);
const rep = repeatability(groups);
// SS dalam = 0,02 + 0,02 = 0,04; df = 4 → Sw = 0,1; RC = 0,277
close('Sw', rep.sw, 0.1, 1e-9);
close('RC', rep.rc, 0.277, 1e-9);

const prop = proportionalBias(pairs);
// Sxx = 150, Sxy = −1,5 → slope = −0,01; intercept = 0,05 + 0,01·15 = 0,2
close('Slope bias proporsional', prop.slope, -0.01, 1e-12);
close('Intercept', prop.intercept, 0.2, 1e-12);
// SSE = 0,055 − Sxy²/Sxx = 0,055 − 0,015 = 0,04; SE_b = √(0,04/4/150) = 0,0081650
close('SE slope', prop.slopeSe, Math.sqrt(0.04 / 4 / 150), 1e-12);
// t = −1,224745, df 4 → p = 0,287864
close('p-value slope', prop.pValue, 0.287864, 1e-5);
check('Bias proporsional tidak bermakna', prop.significant === false);

// --- ICC: Shrout & Fleiss (1979) Tabel 2, 6 target × 4 juri ---
const sf = [
  [9, 2, 5, 8],
  [6, 1, 3, 2],
  [8, 4, 6, 8],
  [7, 1, 2, 6],
  [10, 5, 6, 9],
  [6, 2, 4, 7],
];
const icc = icc21(sf);
close('S&F BMS', icc.msr, 11.24, 0.005);
close('S&F JMS', icc.msc, 32.49, 0.005);
close('S&F EMS', icc.mse, 1.02, 0.005);
close('S&F ICC(2,1) = 0,29', icc.icc, 0.29, 0.005);
// Rujukan R: irr::icc(model="twoway", type="agreement", unit="single") → 0,290 (0,019 – 0,761)
close('S&F ICC(2,1) CI bawah', icc.ci.lower, 0.019, 0.002);
close('S&F ICC(2,1) CI atas', icc.ci.upper, 0.761, 0.002);

// --- Ulangan tak sama: k = minimum bersama ---
const unequal = iccFromGroups([
  { reference: 5, readings: [5.0, 5.1, 5.0, 5.05] },
  { reference: 10, readings: [10.0, 10.1] },
  { reference: 20, readings: [19.95, 20.0, 20.05] },
]);
check('ICC ulangan tak sama: k = 2, ditandai dipotong', unequal.k === 2 && unequal.truncated === true);
check('ICC titik berjauhan ≈ 1', unequal.icc > 0.999);
check('ICC < 2 titik → null', iccFromGroups([{ reference: 5, readings: [5, 5.1] }]) === null);

// --- Verdict ---
const okReport = buildAgreementReport(pairs, 0.5, { unit: 'kg' });
check('Verdict layak (toleransi 0,5)', okReport.verdict.status === 'layak');
const badReport = buildAgreementReport(pairs, 0.1, { unit: 'kg' });
check('Verdict perlu kalibrasi (toleransi 0,1)', badReport.verdict.status === 'perlu_kalibrasi');
check('Verdict alasan menyebut batas atas', badReport.verdict.reasons.some(r => r.includes('Batas atas')));
// Bias proporsional jelas: selisih = 1% dari acuan
const propPairs = [5, 5, 5, 10, 10, 10, 20, 20, 20, 30, 30, 30].map((reference, i) => ({
  reference,
  reading: reference * 1.01 + [0.001, -0.001, 0][i % 3],
}));
// Perubahan bias 5→30 kg = 0,25 kg. Toleransi 0,4 → batas separuh 0,2 → gagal.
const propReport = buildAgreementReport(propPairs, 0.4, { unit: 'kg' });
check('Bias proporsional terdeteksi', propReport.proportional.significant === true);
check('Verdict gagal karena bias proporsional', propReport.verdict.status === 'perlu_kalibrasi');
check('Alasan gagal hanya bias proporsional', propReport.verdict.reasons.length === 1 && propReport.verdict.reasons[0].includes('separuh toleransi'));
// Toleransi 5 → batas 2,5 kg; 0,25 kg tidak berarti secara praktis → layak, dengan catatan.
const propSmall = buildAgreementReport(propPairs, 5, { unit: 'kg' });
check('Bias proporsional kecil tidak menggagalkan', propSmall.verdict.status === 'layak');
check('Catatan bias proporsional kecil ditampilkan', propSmall.verdict.reasons.some(r => r.includes('tidak berarti secara praktis')));
check('Data < 2 bacaan → tidak cukup data', buildAgreementReport(pairs.slice(0, 1), 0.5).verdict.status === 'tidak_cukup_data');

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
