/**
 * Aksi tulis dashboard Superadmin (role Hasura `super_admin`, filter `{}`) + endpoint admin auth
 * service (Bearer, khusus super_admin).
 *
 * Permission & endpoint sedang ditambahkan backend. Bila belum ter-deploy (PermissionError,
 * "field ... not found", HTTP 403/404) → ApiError dengan pesan seragam NOT_ALLOWED agar UI
 * menampilkan toast yang jelas, bukan error mentah.
 */
import { AUTH_BASE_URL } from '@/config/env';
import { readUserIdFromToken } from '@/lib/jwt';
import { asObject, readString } from '@/lib/object';
import { getValidAccessToken } from './auth';
import { ApiError, NetworkError, PermissionError } from './errors';
import { gql } from './graphql';
import { buildJoinCode, regenerateJoinCode, writeMembershipSelected } from './school';
import { getAuthSession } from './session';

export const NOT_ALLOWED = 'Aksi ini belum diizinkan di server.';

/** Jalankan aksi GraphQL; permission/field belum ada → pesan NOT_ALLOWED. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PermissionError) throw new ApiError(NOT_ALLOWED, 'not-allowed');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Sekolah
// ---------------------------------------------------------------------------

export type SchoolInput = { name: string; number: string | null; address: string };

function cleanSchool(input: SchoolInput) {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) throw new ApiError('Nama sekolah wajib diisi.');
  if (!address) throw new ApiError('Alamat sekolah wajib diisi.');
  return { name, address, number: input.number?.trim() ? input.number.trim() : null };
}

export function createSchool(input: SchoolInput, role: string): Promise<string> {
  const values = cleanSchool(input);
  return guarded(async () => {
    // Kode gabung dibuat di klien seperti regenerateJoinCode; retry bila bentrok unique.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const data = await gql<{ insert_schools_one: { id: string } | null }>(
          `mutation CreateSchool($object: schools_insert_input!) { insert_schools_one(object: $object) { id } }`,
          {
            object: {
              ...values,
              join_code: buildJoinCode(),
              created_by: readUserIdFromToken(getAuthSession().accessToken),
            },
          },
          { role },
        );
        if (!data.insert_schools_one?.id) throw new ApiError('Sekolah gagal dibuat.');
        return data.insert_schools_one.id;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (!message.includes('join_code') || attempt === 5) throw error;
      }
    }
    throw new ApiError('Sekolah gagal dibuat.');
  });
}

export function updateSchool(id: string, input: SchoolInput, role: string): Promise<void> {
  const values = cleanSchool(input);
  return guarded(async () => {
    const data = await gql<{ update_schools_by_pk: { id: string } | null }>(
      `mutation UpdateSchool($id: uuid!, $set: schools_set_input!) {
        update_schools_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      { id, set: values },
      { role },
    );
    if (!data.update_schools_by_pk?.id) throw new ApiError('Sekolah tidak ditemukan.');
  });
}

export function deleteSchool(id: string, role: string): Promise<void> {
  return guarded(async () => {
    const data = await gql<{ delete_schools_by_pk: { id: string } | null }>(
      `mutation DeleteSchool($id: uuid!) { delete_schools_by_pk(id: $id) { id } }`,
      { id },
      { role },
    );
    if (!data.delete_schools_by_pk?.id) throw new ApiError('Sekolah tidak ditemukan atau sudah dihapus.');
  });
}

export function regenerateSchoolJoinCode(schoolId: string, role: string): Promise<string> {
  return guarded(async () => {
    return regenerateJoinCode(schoolId, role);
  });
}

// ---------------------------------------------------------------------------
// Pengguna (GraphQL)
// ---------------------------------------------------------------------------

export type UserExtras = { blocked_reason: string | null; blocked_at: string | null; image_url: string | null };

/** Kolom tambahan (bisa belum ada / belum terekspos) → null tanpa error. */
export async function fetchUserExtras(userId: string, role: string): Promise<UserExtras | null> {
  try {
    const data = await gql<{ auth_users_by_pk: UserExtras | null }>(
      `query UserExtras($id: uuid!) { auth_users_by_pk(id: $id) { blocked_reason blocked_at image_url } }`,
      { id: userId },
      { role },
    );
    return data.auth_users_by_pk;
  } catch {
    return null;
  }
}

function updateUser(id: string, set: Record<string, unknown>, role: string): Promise<void> {
  return guarded(async () => {
    const data = await gql<{ update_auth_users_by_pk: { id: string } | null }>(
      `mutation UpdateAuthUser($id: uuid!, $set: auth_users_set_input!) {
        update_auth_users_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      { id, set },
      { role },
    );
    if (!data.update_auth_users_by_pk?.id) throw new ApiError('Pengguna tidak ditemukan.');
  });
}

export function updateUserName(id: string, fullName: string, role: string): Promise<void> {
  const name = fullName.trim();
  if (!name) return Promise.reject(new ApiError('Nama wajib diisi.'));
  return updateUser(id, { full_name: name }, role);
}

export function setEmailVerified(id: string, verified: boolean, role: string): Promise<void> {
  return updateUser(id, { is_email_verified: verified }, role);
}

export type MembershipRoleInput = 'school_admin' | 'teacher';

export function addMembership(input: { userId: string; schoolId: string; role: MembershipRoleInput }, role: string): Promise<void> {
  return guarded(async () => {
    const existing = await gql<{ school_memberships: Array<{ id: string }> }>(
      `query FindMembership($userId: uuid!, $schoolId: uuid!) {
        school_memberships(where: { user_id: { _eq: $userId }, school_id: { _eq: $schoolId } }, limit: 1) { id }
      }`,
      { userId: input.userId, schoolId: input.schoolId },
      { role },
    );
    if (existing.school_memberships[0]) throw new ApiError('Pengguna sudah menjadi anggota sekolah ini. Ubah perannya dari daftar keanggotaan.');
    await writeMembershipSelected(async isActive => {
      await gql(
        `mutation AddMembership($object: school_memberships_insert_input!) { insert_school_memberships_one(object: $object) { id } }`,
        { object: { user_id: input.userId, school_id: input.schoolId, role: input.role, status: 'active', is_active: isActive } },
        { role },
      );
    });
  });
}

export function updateMembershipAsSuper(
  id: string,
  set: { role?: MembershipRoleInput; enabled?: boolean },
  role: string,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (set.role) payload.role = set.role;
  if (set.enabled !== undefined) Object.assign(payload, set.enabled ? { status: 'active', is_active: true } : { status: 'inactive', is_active: false });
  const write = async (set: Record<string, unknown>) => {
    const data = await gql<{ update_school_memberships_by_pk: { id: string } | null }>(
      `mutation SuperUpdateMembership($id: uuid!, $set: school_memberships_set_input!) {
        update_school_memberships_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      { id, set },
      { role },
    );
    if (!data.update_school_memberships_by_pk?.id) throw new ApiError('Keanggotaan tidak ditemukan.');
  };
  return guarded(() =>
    payload.is_active === true ? writeMembershipSelected(isActive => write({ ...payload, is_active: isActive })) : write(payload),
  );
}

export function deleteMembershipAsSuper(id: string, role: string): Promise<void> {
  return guarded(async () => {
    const data = await gql<{ delete_school_memberships_by_pk: { id: string } | null }>(
      `mutation SuperDeleteMembership($id: uuid!) { delete_school_memberships_by_pk(id: $id) { id } }`,
      { id },
      { role },
    );
    if (!data.delete_school_memberships_by_pk?.id) throw new ApiError('Keanggotaan tidak ditemukan.');
  });
}

const SUPER = 'super_admin';

async function superRoleId(role: string): Promise<string> {
  const data = await gql<{ auth_roles: Array<{ id: string }> }>(
    `query SuperRoleId($code: String!) {
      auth_roles(where: { _or: [{ code: { _eq: $code } }, { name: { _eq: $code } }] }, limit: 1) { id }
    }`,
    { code: SUPER },
    { role },
  );
  const id = data.auth_roles[0]?.id;
  if (!id) throw new ApiError('Role super_admin belum ada di auth.roles.');
  return id;
}

export function grantSuperAdmin(userId: string, role: string): Promise<void> {
  return guarded(async () => {
    const roleId = await superRoleId(role);
    await gql(
      `mutation GrantSuperAdmin($userId: uuid!, $roleId: uuid!) {
        insert_auth_user_roles_one(object: { user_id: $userId, role_id: $roleId, is_default: false }) { user_id }
      }`,
      { userId, roleId },
      { role },
    );
  });
}

/** Cabut super_admin. Backend menolak mencabut milik sendiri (UI juga menyembunyikannya). */
export function revokeSuperAdmin(userId: string, role: string): Promise<void> {
  return guarded(async () => {
    const roleId = await superRoleId(role);
    const data = await gql<{ delete_auth_user_roles: { affected_rows: number } | null }>(
      `mutation RevokeSuperAdmin($userId: uuid!, $roleId: uuid!) {
        delete_auth_user_roles(where: { user_id: { _eq: $userId }, role_id: { _eq: $roleId } }) { affected_rows }
      }`,
      { userId, roleId },
      { role },
    );
    if (!data.delete_auth_user_roles?.affected_rows) throw new ApiError('Role super_admin tidak dicabut (tidak ditemukan atau ditolak server).');
  });
}

// ---------------------------------------------------------------------------
// Endpoint admin auth service
// ---------------------------------------------------------------------------

async function adminRequest(path: string, payload: unknown, messages: Partial<Record<number, string>> = {}): Promise<Record<string, unknown> | null> {
  const token = await getValidAccessToken();
  if (!token) throw new ApiError('Sesi berakhir. Silakan login ulang.');
  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new NetworkError();
  }
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text.trim() ? asObject(JSON.parse(text)) : null;
  } catch {
    body = { message: text };
  }
  if (response.ok) return body;
  const serverMessage = readString(body?.message) ?? readString(body?.error);
  if (messages[response.status]) throw new ApiError(messages[response.status]!);
  if (response.status === 401 || response.status === 403 || response.status === 404) throw new ApiError(NOT_ALLOWED, 'not-allowed');
  if (response.status === 429) throw new ApiError('Terlalu banyak percobaan, coba lagi sebentar.');
  throw new ApiError(serverMessage ?? `Permintaan gagal (HTTP ${response.status}).`);
}

export async function createUserAccount(input: {
  email: string;
  password: string;
  fullName: string;
  schoolId?: string | null;
  role?: MembershipRoleInput | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName) throw new ApiError('Nama dan email wajib diisi.');
  if (input.password.length < 8) throw new ApiError('Password minimal 8 karakter.');
  await adminRequest(
    '/admin/users',
    {
      email,
      password: input.password,
      fullName,
      ...(input.schoolId ? { schoolId: input.schoolId, role: input.role ?? 'teacher' } : {}),
    },
    { 409: 'Email sudah terdaftar.' },
  );
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new ApiError('Password minimal 8 karakter.');
  await adminRequest(`/admin/users/${encodeURIComponent(userId)}/password`, { newPassword });
}

export async function setUserBlocked(userId: string, blocked: boolean, reason?: string): Promise<void> {
  await adminRequest(`/admin/users/${encodeURIComponent(userId)}/block`, {
    blocked,
    ...(blocked && reason?.trim() ? { reason: reason.trim() } : {}),
  });
}
