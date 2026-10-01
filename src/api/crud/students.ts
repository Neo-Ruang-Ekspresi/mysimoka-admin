/**
 * CRUD siswa & enrollment (school_admin, sekolah sendiri).
 *  - students: insert/update termasuk `is_active` (soft delete = nonaktifkan). TIDAK ada hard delete.
 *  - student_enrollments: insert, update `class_id`/`status`, delete.
 * Tambah/ubah profil memakai createStudent/updateStudent di `api/school.ts` (diekspor ulang).
 */
import { gql } from '../graphql';
import { ApiError } from '../errors';

export { createStudent, updateStudent, type StudentInput } from '../school';

export type EnrollmentStatus = 'active' | 'inactive' | 'graduated' | 'transferred';

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  graduated: 'Lulus / naik',
  transferred: 'Pindah sekolah',
};

/** Aktifkan/nonaktifkan banyak siswa sekaligus (`update_students`, permission sama dengan by_pk). */
export async function setStudentsActive(studentIds: string[], isActive: boolean, role: string): Promise<number> {
  if (studentIds.length === 0) return 0;
  const data = await gql<{ update_students: { affected_rows: number } | null }>(
    `mutation SetStudentsActive($ids: [uuid!]!, $isActive: Boolean!) {
      update_students(where: { id: { _in: $ids } }, _set: { is_active: $isActive }) { affected_rows }
    }`,
    { ids: studentIds, isActive },
    { role },
  );
  const affected = data.update_students?.affected_rows ?? 0;
  if (affected < 1) throw new ApiError('Tidak ada siswa yang diubah (tidak ditemukan atau tanpa akses).');
  return affected;
}

export async function setStudentActive(studentId: string, isActive: boolean, role: string): Promise<void> {
  const data = await gql<{ update_students_by_pk: { id: string } | null }>(
    `mutation SetStudentActive($id: uuid!, $isActive: Boolean!) {
      update_students_by_pk(pk_columns: { id: $id }, _set: { is_active: $isActive }) { id }
    }`,
    { id: studentId, isActive },
    { role },
  );
  if (!data.update_students_by_pk?.id) throw new ApiError('Siswa tidak ditemukan atau tidak dapat diubah.');
}

export async function createEnrollment(
  input: { studentId: string; classId: string; status?: EnrollmentStatus },
  role: string,
): Promise<string> {
  const data = await gql<{ insert_student_enrollments_one: { id: string } | null }>(
    `mutation CreateEnrollment($object: student_enrollments_insert_input!) {
      insert_student_enrollments_one(object: $object) { id }
    }`,
    { object: { student_id: input.studentId, class_id: input.classId, status: input.status ?? 'active' } },
    { role },
  );
  if (!data.insert_student_enrollments_one?.id) throw new ApiError('Gagal mendaftarkan siswa ke kelas.');
  return data.insert_student_enrollments_one.id;
}

export async function updateEnrollment(
  enrollmentId: string,
  set: { classId?: string; status?: EnrollmentStatus },
  role: string,
): Promise<void> {
  const payload: Record<string, string> = {};
  if (set.classId) payload.class_id = set.classId;
  if (set.status) payload.status = set.status;
  const data = await gql<{ update_student_enrollments_by_pk: { id: string } | null }>(
    `mutation UpdateEnrollment($id: uuid!, $set: student_enrollments_set_input!) {
      update_student_enrollments_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    { id: enrollmentId, set: payload },
    { role },
  );
  if (!data.update_student_enrollments_by_pk?.id) throw new ApiError('Data kelas siswa tidak ditemukan atau tidak dapat diubah.');
}

/** Pindah kelas massal: ubah `class_id` enrollment terpilih (riwayat tidak bertambah). */
export async function moveEnrollments(enrollmentIds: string[], classId: string, role: string): Promise<number> {
  if (enrollmentIds.length === 0) return 0;
  const data = await gql<{ update_student_enrollments: { affected_rows: number } | null }>(
    `mutation MoveEnrollments($ids: [uuid!]!, $classId: uuid!) {
      update_student_enrollments(where: { id: { _in: $ids } }, _set: { class_id: $classId }) { affected_rows }
    }`,
    { ids: enrollmentIds, classId },
    { role },
  );
  const affected = data.update_student_enrollments?.affected_rows ?? 0;
  if (affected < 1) throw new ApiError('Tidak ada siswa yang dipindahkan (tanpa akses atau kelas tujuan tidak valid).');
  return affected;
}

/**
 * Naik kelas: enrollment lama → status `graduated`, lalu enrollment baru (active) di kelas tujuan.
 * Riwayat kelas tetap tersimpan. Dijalankan per siswa agar kegagalan sebagian bisa dilaporkan.
 */
export async function promoteStudents(
  items: Array<{ studentId: string; enrollmentId: string }>,
  classId: string,
  role: string,
): Promise<{ ok: number; failed: Array<{ studentId: string; error: unknown }> }> {
  let ok = 0;
  const failed: Array<{ studentId: string; error: unknown }> = [];
  for (const item of items) {
    try {
      await createEnrollment({ studentId: item.studentId, classId, status: 'active' }, role);
      await updateEnrollment(item.enrollmentId, { status: 'graduated' }, role);
      ok += 1;
    } catch (error) {
      failed.push({ studentId: item.studentId, error });
    }
  }
  return { ok, failed };
}

export async function deleteEnrollment(enrollmentId: string, role: string): Promise<void> {
  const data = await gql<{ delete_student_enrollments_by_pk: { id: string } | null }>(
    `mutation DeleteEnrollment($id: uuid!) { delete_student_enrollments_by_pk(id: $id) { id } }`,
    { id: enrollmentId },
    { role },
  );
  if (!data.delete_student_enrollments_by_pk?.id) throw new ApiError('Riwayat kelas tidak ditemukan atau tidak dapat dihapus.');
}
