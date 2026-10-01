/**
 * Kelola anggota sekolah (school_memberships) oleh school_admin.
 * Permission Hasura: update hanya `role status is_active`, delete; BUKAN baris milik sendiri
 * (`user_id <> X-Hasura-User-Id`) — UI menyembunyikan aksi untuk baris sendiri.
 * Tambah guru tetap lewat `addTeacher` (api/school.ts, diekspor ulang).
 */
import { gql } from '../graphql';
import { ApiError } from '../errors';

export { addTeacher } from '../school';

export type MemberRole = 'school_admin' | 'teacher' | 'school_member';

export const MEMBER_ROLE_OPTIONS: Array<{ value: MemberRole; label: string }> = [
  { value: 'teacher', label: 'Guru' },
  { value: 'school_admin', label: 'Admin sekolah' },
];

export async function updateMembership(
  membershipId: string,
  set: { role?: MemberRole; status?: string; isActive?: boolean },
  role: string,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (set.role) payload.role = set.role;
  if (set.status) payload.status = set.status;
  if (set.isActive !== undefined) payload.is_active = set.isActive;
  const data = await gql<{ update_school_memberships_by_pk: { id: string } | null }>(
    `mutation UpdateMembership($id: uuid!, $set: school_memberships_set_input!) {
      update_school_memberships_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    { id: membershipId, set: payload },
    { role },
  );
  if (!data.update_school_memberships_by_pk?.id) {
    throw new ApiError('Anggota tidak ditemukan atau tidak dapat diubah (akun sendiri tidak bisa diubah dari sini).');
  }
}

/** Nonaktifkan = status 'inactive' (akses sekolah dicabut, data tetap). Aktifkan = status 'active'. */
export function setMembershipEnabled(membershipId: string, enabled: boolean, role: string): Promise<void> {
  return updateMembership(
    membershipId,
    enabled ? { status: 'active', isActive: true } : { status: 'inactive', isActive: false },
    role,
  );
}

export async function deleteMembership(membershipId: string, role: string): Promise<void> {
  const data = await gql<{ delete_school_memberships_by_pk: { id: string } | null }>(
    `mutation DeleteMembership($id: uuid!) { delete_school_memberships_by_pk(id: $id) { id } }`,
    { id: membershipId },
    { role },
  );
  if (!data.delete_school_memberships_by_pk?.id) {
    throw new ApiError('Anggota tidak ditemukan atau tidak dapat dikeluarkan (akun sendiri tidak bisa dikeluarkan).');
  }
}
