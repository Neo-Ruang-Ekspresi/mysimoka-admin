const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const numberFormatter = new Intl.NumberFormat('id-ID');

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Tanggal murni (YYYY-MM-DD) diperlakukan sebagai tanggal lokal.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '-';
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '-';
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '-' : numberFormatter.format(value);
}

export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toLocaleString('id-ID', { maximumFractionDigits: digits })}%`;
}

export function monthKey(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : null;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(
    new Date(year, (month || 1) - 1, 1),
  );
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ageInYears(dateOfBirth: string | null | undefined, at: Date = new Date()): number | null {
  const dob = parseDate(dateOfBirth);
  if (!dob) return null;
  let age = at.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    at.getMonth() < dob.getMonth() || (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function genderLabel(value: string | null | undefined): string {
  if (value === 'male' || value === 'L') return 'Laki-laki';
  if (value === 'female' || value === 'P') return 'Perempuan';
  return '-';
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}
