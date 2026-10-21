import { useState } from 'react';
import { Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatDecimal } from '@/lib/format';
import {
  BMI_STATUS_COLORS,
  BMI_STATUS_LABEL,
  BMI_STATUS_RANGE,
  HEIGHT_STATUS_COLORS,
  HEIGHT_STATUS_LABEL,
  HEIGHT_STATUS_RANGE,
  referenceLms,
  valueAtZ,
  WEIGHT_STATUS_COLORS,
  WEIGHT_STATUS_LABEL,
  WEIGHT_STATUS_RANGE,
  type GrowthIndicator,
  type Sex,
} from '@/lib/growth';

type Row = { key: string; label: string; color: string; range: string; zLow: number | null; zHigh: number | null };

const INDICATORS: Record<GrowthIndicator, { title: string; short: string; unit: string; ages: string; rows: Row[]; note?: string }> = {
  bmi: {
    title: 'Acuan status gizi (IMT/U)',
    short: 'IMT/U',
    unit: 'kg/m²',
    ages: '5–18 tahun',
    rows: [
      { key: 'gizi_buruk', label: BMI_STATUS_LABEL.gizi_buruk, color: BMI_STATUS_COLORS.gizi_buruk, range: BMI_STATUS_RANGE.gizi_buruk, zLow: null, zHigh: -3 },
      { key: 'gizi_kurang', label: BMI_STATUS_LABEL.gizi_kurang, color: BMI_STATUS_COLORS.gizi_kurang, range: BMI_STATUS_RANGE.gizi_kurang, zLow: -3, zHigh: -2 },
      { key: 'gizi_baik', label: BMI_STATUS_LABEL.gizi_baik, color: BMI_STATUS_COLORS.gizi_baik, range: BMI_STATUS_RANGE.gizi_baik, zLow: -2, zHigh: 1 },
      { key: 'gizi_lebih', label: BMI_STATUS_LABEL.gizi_lebih, color: BMI_STATUS_COLORS.gizi_lebih, range: BMI_STATUS_RANGE.gizi_lebih, zLow: 1, zHigh: 2 },
      { key: 'obesitas', label: BMI_STATUS_LABEL.obesitas, color: BMI_STATUS_COLORS.obesitas, range: BMI_STATUS_RANGE.obesitas, zLow: 2, zHigh: null },
    ],
    note: 'IMT = berat (kg) / tinggi (m)². Indikator utama status gizi anak usia sekolah.',
  },
  height: {
    title: 'Acuan tinggi badan menurut umur (TB/U)',
    short: 'TB/U',
    unit: 'cm',
    ages: '5–18 tahun',
    rows: [
      { key: 'sangat_pendek', label: HEIGHT_STATUS_LABEL.sangat_pendek, color: HEIGHT_STATUS_COLORS.sangat_pendek, range: HEIGHT_STATUS_RANGE.sangat_pendek, zLow: null, zHigh: -3 },
      { key: 'pendek', label: HEIGHT_STATUS_LABEL.pendek, color: HEIGHT_STATUS_COLORS.pendek, range: HEIGHT_STATUS_RANGE.pendek, zLow: -3, zHigh: -2 },
      { key: 'normal', label: HEIGHT_STATUS_LABEL.normal, color: HEIGHT_STATUS_COLORS.normal, range: HEIGHT_STATUS_RANGE.normal, zLow: -2, zHigh: 3 },
      { key: 'tinggi', label: HEIGHT_STATUS_LABEL.tinggi, color: HEIGHT_STATUS_COLORS.tinggi, range: HEIGHT_STATUS_RANGE.tinggi, zLow: 3, zHigh: null },
    ],
    note: 'Pendek + sangat pendek = stunting.',
  },
  weight: {
    title: 'Acuan berat badan menurut umur (BB/U)',
    short: 'BB/U',
    unit: 'kg',
    ages: '5–10 tahun (WHO 2007 tidak punya BB/U di atas 10 tahun)',
    rows: [
      { key: 'sangat_kurang', label: WEIGHT_STATUS_LABEL.sangat_kurang, color: WEIGHT_STATUS_COLORS.sangat_kurang, range: WEIGHT_STATUS_RANGE.sangat_kurang, zLow: null, zHigh: -3 },
      { key: 'kurang', label: WEIGHT_STATUS_LABEL.kurang, color: WEIGHT_STATUS_COLORS.kurang, range: WEIGHT_STATUS_RANGE.kurang, zLow: -3, zHigh: -2 },
      { key: 'normal', label: WEIGHT_STATUS_LABEL.normal, color: WEIGHT_STATUS_COLORS.normal, range: WEIGHT_STATUS_RANGE.normal, zLow: -2, zHigh: 1 },
      { key: 'risiko_lebih', label: WEIGHT_STATUS_LABEL.risiko_lebih, color: WEIGHT_STATUS_COLORS.risiko_lebih, range: WEIGHT_STATUS_RANGE.risiko_lebih, zLow: 1, zHigh: null },
    ],
    note: 'Informasi tambahan. Untuk anak usia sekolah status gizi tetap ditentukan IMT/U (BB/U tidak membedakan anak pendek dan kurus).',
  },
};

function formatAge(months: number): string {
  const whole = Math.floor(months);
  return `${Math.floor(whole / 12)} th ${whole % 12} bln`;
}

/**
 * Tombol ⓘ di samping label IMT/U, TB/U, BB/U: tabel acuan kategori (Permenkes 2/2020) dan,
 * bila jenis kelamin + usia diketahui, batas nilai nyata dari LMS WHO 2007 pada usia itu.
 */
export function ReferenceInfo({ indicator, sex, months }: { indicator: GrowthIndicator; sex?: Sex | null; months?: number | null }) {
  const [open, setOpen] = useState(false);
  const def = INDICATORS[indicator];
  const lms = referenceLms(indicator, sex ?? null, months ?? null);
  const at = (z: number) => (lms ? formatDecimal(valueAtZ(lms, z), 1) : '');
  const valueRange = (row: Row) => {
    if (!lms) return null;
    if (row.zLow === null && row.zHigh !== null) return `< ${at(row.zHigh)}`;
    if (row.zHigh === null && row.zLow !== null) return `> ${at(row.zLow)}`;
    return `${at(row.zLow ?? 0)} – ${at(row.zHigh ?? 0)}`;
  };

  return (
    <>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex shrink-0 rounded-full p-0.5 align-middle text-fg-subtle transition-colors hover:bg-card-muted hover:text-fg"
        aria-label={`Lihat acuan ${def.short}`}
        title={`Acuan ${def.short}`}
      >
        <Info className="size-3.5" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={def.title}
        description="WHO Growth Reference 2007, kategori Permenkes RI No. 2 Tahun 2020"
        size="md"
      >
        <div className="flex flex-col gap-3 text-sm">
          <table className="w-full text-left">
            <thead className="text-xs text-fg-subtle">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 font-medium">Kategori</th>
                <th className="py-1.5 pr-3 font-medium">z-score</th>
                {lms ? <th className="py-1.5 font-medium">{`Nilai (${def.unit})`}</th> : null}
              </tr>
            </thead>
            <tbody>
              {def.rows.map(row => (
                <tr key={row.key} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: row.color }} aria-hidden />
                      {row.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.range}</td>
                  {lms ? <td className="py-1.5 tabular-nums">{valueRange(row)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {lms && sex && months != null ? (
            <p className="text-xs text-fg-subtle">
              {`Nilai untuk ${sex === 'male' ? 'laki-laki' : 'perempuan'} usia ${formatAge(months)} (median ${formatDecimal(lms[1], 1)} ${def.unit}).`}
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-4 text-xs text-fg-subtle">
            <li>{`Berlaku untuk usia ${def.ages}.`}</li>
            {def.note ? <li>{def.note}</li> : null}
            <li>
              z-score = jarak nilai anak dari median anak seusia & sejenis kelamin, dalam satuan simpangan baku: z = ((nilai / M)^L − 1) / (L·S),
              dengan L, M, S dari tabel WHO per bulan usia.
            </li>
          </ul>
        </div>
      </Modal>
    </>
  );
}
