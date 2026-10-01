/**
 * CRUD kelas (school_admin, sekolah sendiri). Tambah/ubah tetap di `api/school.ts`
 * (createClass/updateClass) dan diekspor ulang di sini agar halaman cukup import satu tempat.
 */
import { gql } from '../graphql';
import { ApiError, isForeignKeyError } from '../errors';

export { createClass, updateClass } from '../school';

/** Hapus kelas. FK error (masih ada enrollment/sesi) → pesan ramah. */
export async function deleteClass(classId: string, role: string): Promise<void> {
  try {
    const data = await gql<{ delete_classes_by_pk: { id: string } | null }>(
      `mutation DeleteClass($id: uuid!) { delete_classes_by_pk(id: $id) { id } }`,
      { id: classId },
      { role },
    );
    if (!data.delete_classes_by_pk?.id) throw new ApiError('Kelas tidak ditemukan atau tidak dapat dihapus.');
  } catch (error) {
    if (isForeignKeyError(error)) throw new ApiError('Kelas masih punya siswa/sesi; pindahkan atau hapus dulu.', 'fk');
    throw error;
  }
}
