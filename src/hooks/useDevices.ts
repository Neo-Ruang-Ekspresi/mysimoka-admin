import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useMeasurementSessions, useSchoolMembers } from '@/hooks/useSchoolData';
import {
  DEVICE_USAGE_LIMIT,
  fetchDeviceUsage,
  fetchDevices,
  type DeviceKind,
  type DeviceRow,
  type DevicesResult,
} from '@/api/crud/devices';

export type DeviceUsage = {
  count: number;
  lastMeasuredAt: string | null;
  /** user_id guru yang pernah mengukur dengan perangkat ini. */
  teacherIds: string[];
};

/** Baris gabungan registri + pemakaian. `device` null = belum terdaftar (hanya dari data pengukuran). */
export type DeviceView = {
  key: string;
  device: DeviceRow | null;
  registered: boolean;
  displayName: string;
  kind: DeviceKind | string | null;
  bleId: string | null;
  isActive: boolean | null;
  lastSeenAt: string | null;
  lastSeenByName: string | null;
  usage: DeviceUsage | null;
};

const DAY_MS = 86_400_000;

export function deviceDisplayName(device: DeviceRow): string {
  return device.label?.trim() || device.name?.trim() || device.serial?.trim() || device.device_key?.trim() || 'Perangkat';
}

/** Waktu aktivitas terakhir: dilihat app (registri) atau dipakai mengukur, mana yang lebih baru. */
export function lastActivity(row: DeviceView): string | null {
  const a = row.lastSeenAt;
  const b = row.usage?.lastMeasuredAt ?? null;
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function isSeenWithin(row: DeviceView, days: number, now = Date.now()): boolean {
  const at = lastActivity(row);
  return Boolean(at && now - new Date(at).getTime() <= days * DAY_MS);
}

/**
 * Perangkat sekolah: registri `devices` + pemakaian dari record pengukuran BLE.
 * Registri gagal karena backend belum siap → `registry.status === 'unavailable'`, daftar tetap
 * diturunkan dari data pemakaian.
 */
export function useDevices() {
  const { schoolId, role } = useSchoolScope();
  const sessions = useMeasurementSessions();
  const members = useSchoolMembers();
  const sessionIds = useMemo(() => (sessions.data ?? []).map(item => item.id), [sessions.data]);

  const registry = useQuery({
    queryKey: ['school', schoolId, role, 'devices'],
    queryFn: (): Promise<DevicesResult> => fetchDevices(schoolId, role),
  });
  const usage = useQuery({
    queryKey: ['school', schoolId, role, 'device-usage', sessionIds.join(',')],
    queryFn: () => fetchDeviceUsage(sessionIds, role),
    enabled: sessions.isSuccess,
  });

  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      const name = member.user?.full_name ?? member.user?.email;
      if (name) map.set(member.user_id, name);
    }
    return map;
  }, [members.data]);

  const rows = useMemo<DeviceView[]>(() => {
    // Kelompokkan pemakaian per device_id (fallback nama bila id kosong).
    const groups = new Map<string, { count: number; last: string | null; teachers: Set<string>; name: string | null; bleId: string | null }>();
    for (const record of usage.data ?? []) {
      const id = record.device_id?.trim() || null;
      const name = record.device_name?.trim() || null;
      const key = id ? `id:${id}` : name ? `name:${name}` : 'unknown';
      const group = groups.get(key) ?? { count: 0, last: null, teachers: new Set<string>(), name, bleId: id };
      group.count += 1;
      if (!group.last || record.measured_at > group.last) group.last = record.measured_at;
      if (record.recorded_by) group.teachers.add(record.recorded_by);
      group.name ??= name;
      groups.set(key, group);
    }
    const toUsage = (group: { count: number; last: string | null; teachers: Set<string> }): DeviceUsage => ({
      count: group.count,
      lastMeasuredAt: group.last,
      teacherIds: [...group.teachers],
    });

    const devices = registry.data?.status === 'ok' ? registry.data.devices : [];
    const used = new Set<string>();
    const result: DeviceView[] = devices.map(device => {
      const bleId = device.ble_id?.trim() || null;
      const key = bleId ? `id:${bleId}` : null;
      const group = key ? groups.get(key) : undefined;
      if (key && group) used.add(key);
      return {
        key: device.id,
        device,
        registered: true,
        displayName: deviceDisplayName(device),
        kind: device.kind,
        bleId,
        isActive: device.is_active,
        lastSeenAt: device.last_seen_at,
        lastSeenByName:
          device.last_seen_user?.full_name ??
          device.last_seen_user?.email ??
          (device.last_seen_by ? nameByUser.get(device.last_seen_by) ?? null : null),
        usage: group ? toUsage(group) : null,
      };
    });
    // Perangkat yang hanya muncul di data pengukuran (app versi lama, belum terdaftar).
    for (const [key, group] of groups) {
      if (used.has(key)) continue;
      // Nama sama dengan perangkat terdaftar tanpa ble_id → anggap perangkat itu.
      if (key.startsWith('name:')) {
        const match = result.find(row => row.registered && !row.bleId && row.device?.name?.trim() === group.name);
        if (match) {
          match.usage = toUsage(group);
          continue;
        }
      }
      result.push({
        key: `usage:${key}`,
        device: null,
        registered: false,
        displayName: group.name ?? group.bleId ?? 'Perangkat tanpa nama',
        kind: null,
        bleId: group.bleId,
        isActive: null,
        lastSeenAt: null,
        lastSeenByName: null,
        usage: toUsage(group),
      });
    }
    return result;
  }, [registry.data, usage.data, nameByUser]);

  return {
    rows,
    registry: registry.data ?? null,
    /** Jumlah record pemakaian mencapai batas → angka pemakaian adalah batas bawah. */
    usageTruncated: (usage.data?.length ?? 0) >= DEVICE_USAGE_LIMIT,
    usageCount: usage.data?.length ?? 0,
    nameByUser,
    isLoading: registry.isLoading || sessions.isLoading || usage.isLoading,
    error: registry.error ?? sessions.error ?? usage.error,
    refetch: () => {
      void registry.refetch();
      void (sessions.error ? sessions.refetch() : usage.refetch());
    },
  };
}
