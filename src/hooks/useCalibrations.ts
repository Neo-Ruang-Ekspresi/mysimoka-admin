import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  fetchCalibrationExtras,
  fetchCalibrationSettings,
  fetchCalibrations,
  type CalibrationRow,
  type CalibrationsResult,
} from '@/api/crud/calibrations';
import type { DeviceRow } from '@/api/crud/devices';

/** Baris log milik perangkat: cocok via devices.id, device_key, atau ble_id. */
export function calibrationsForDevice(rows: CalibrationRow[], device: DeviceRow): CalibrationRow[] {
  return rows.filter(
    row =>
      (row.device_id !== null && row.device_id === device.id) ||
      (row.device_id === null &&
        ((row.device_key !== null && row.device_key === device.device_key) ||
          (row.ble_id !== null && row.ble_id === device.ble_id))),
  );
}

export type CheckSummary = {
  measure: 'weight' | 'height';
  latest: CalibrationRow;
  /** Cek sebelumnya untuk ukuran & titik acuan yang sama (tren). */
  previous: CalibrationRow | null;
};

/** Cek akurasi terbaru per ukuran (berat/tinggi). `rows` terbaru dulu. */
export function latestChecks(rows: CalibrationRow[]): CheckSummary[] {
  const result: CheckSummary[] = [];
  for (const measure of ['weight', 'height'] as const) {
    const checks = rows.filter(row => row.kind === 'check' && row.measure === measure);
    const latest = checks[0];
    if (!latest) continue;
    const previous =
      checks.slice(1).find(row => row.reference_value === latest.reference_value) ?? null;
    result.push({ measure, latest, previous });
  }
  return result;
}

export function useCalibrations() {
  const { schoolId, role } = useSchoolScope();
  const history = useQuery({
    queryKey: ['school', schoolId, role, 'device-calibrations'],
    queryFn: (): Promise<CalibrationsResult> => fetchCalibrations(schoolId, role),
  });
  const settings = useQuery({
    queryKey: ['school', schoolId, role, 'calibration-settings'],
    queryFn: () => fetchCalibrationSettings(schoolId, role),
  });
  const rows = useMemo(() => (history.data?.status === 'ok' ? history.data.rows : []), [history.data]);
  return {
    rows,
    history: history.data ?? null,
    settings: settings.data ?? null,
    isLoading: history.isLoading || settings.isLoading,
    error: history.error ?? settings.error,
  };
}

/**
 * Interval cek ulang + status PIN teknisi (kolom tambahan; aman bila belum di-deploy).
 * Dipakai kartu toleransi dan badge Akurasi; react-query membagi satu request.
 */
export function useCalibrationExtras() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({
    queryKey: ['school', schoolId, role, 'calibration-extras'],
    queryFn: () => fetchCalibrationExtras(schoolId, role),
  });
}
