import { Link } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';

/** Tautan ke Laporan Uji Alat untuk satu perangkat (hanya bila peran boleh melihat). */
export function DeviceValidationLink({ deviceId }: { deviceId: string | null | undefined }) {
  const { basePath, can } = useSchoolScope();
  if (!can.viewDeviceValidation || !deviceId) return null;
  return (
    <Link
      to={`${basePath}/perangkat/laporan-uji?perangkat=${encodeURIComponent(deviceId)}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-xs font-medium text-fg hover:bg-card-muted"
    >
      <ClipboardCheck className="size-3.5" />
      Laporan uji alat
    </Link>
  );
}
