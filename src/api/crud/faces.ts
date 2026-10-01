/**
 * Data wajah siswa (face_embeddings) — hanya metadata (tanpa vektor/gambar) + reset.
 * Permission school_admin: select & delete untuk siswa yang terdaftar di sekolah sendiri.
 */
import { gql } from '../graphql';

export type FaceEmbeddingRow = {
  id: string;
  student_id: string;
  detection_score: number | string | null;
  created_at: string | null;
};

export async function fetchFaceEmbeddings(studentId: string, role: string): Promise<FaceEmbeddingRow[]> {
  const data = await gql<{ face_embeddings: FaceEmbeddingRow[] }>(
    `query StudentFaceEmbeddings($studentId: uuid!) {
      face_embeddings(where: { student_id: { _eq: $studentId } }, order_by: [{ created_at: desc }]) {
        id student_id detection_score created_at
      }
    }`,
    { studentId },
    { role },
  );
  return data.face_embeddings;
}

/** Reset wajah: hapus semua embedding siswa (by_pk per baris, sesuai permission delete). */
export async function resetStudentFaces(studentId: string, ids: string[], role: string): Promise<number> {
  if (ids.length === 0) return 0;
  const fields = ids.map((_, index) => `d${index}: delete_face_embeddings_by_pk(id: $id${index}) { id student_id }`).join('\n');
  const params = ids.map((_, index) => `$id${index}: uuid!`).join(', ');
  const variables = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const data = await gql<Record<string, { id: string; student_id: string } | null>>(
    `mutation ResetStudentFaces(${params}) { ${fields} }`,
    variables,
    { role },
  );
  return Object.values(data).filter(row => row?.student_id === studentId).length;
}
