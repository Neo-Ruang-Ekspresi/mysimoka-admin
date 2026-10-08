/**
 * Kapabilitas per mode dashboard. Halaman WAJIB menggating tombol/aksi lewat `can.*`
 * dari useSchoolScope(), bukan lewat `mode` atau `readOnly`.
 *
 * Matriks teacher mengikuti app mobile (mysimoka/src/screens/dashboard/*: aksi tambah/ubah
 * kelas, siswa, guru hanya untuk `isAdmin`; menu Guru disembunyikan untuk guru; pencatatan
 * (buat sesi + input pengukuran/imunisasi) terbuka untuk guru).
 */
export type SchoolMode = 'school' | 'super' | 'teacher';

export type SchoolCapabilities = {
  /** Ubah nama/NPSN/alamat sekolah. */
  manageSchoolProfile: boolean;
  /** Lihat kode gabung sekolah. */
  viewJoinCode: boolean;
  /** Buat ulang kode gabung. */
  manageJoinCode: boolean;
  /** Lihat halaman/daftar guru. */
  viewTeachers: boolean;
  /** Tambah/ubah/nonaktifkan guru. */
  manageTeachers: boolean;
  /** Lihat & kelola tahun ajaran (halaman khusus admin). */
  manageAcademicYears: boolean;
  /** Tambah/ubah/hapus kelas. */
  manageClasses: boolean;
  /** Tambah/ubah/pindah/nonaktifkan siswa. */
  manageStudents: boolean;
  /** Buat sesi pengukuran/imunisasi baru. */
  createSessions: boolean;
  /** Ubah status sesi (selesai/batal/aktifkan kembali) & edit metadata sesi. */
  manageSessions: boolean;
  /** Input/ubah hasil pengukuran & imunisasi di sesi. */
  recordData: boolean;
  /** Hapus data permanen (record, sesi, kelas, siswa). */
  deleteData: boolean;
  /** Impor data massal (Excel/CSV). */
  importData: boolean;
  /** Ekspor/unduh data & laporan. */
  exportData: boolean;
  /** Ubah nama, aktifkan/nonaktifkan & hapus perangkat BLE sekolah. */
  manageDevices: boolean;
  /** Ubah batas toleransi cek akurasi alat untuk sekolah ini. */
  manageCalibrationSettings: boolean;
  /** Ubah batas toleransi global (bawaan semua sekolah). */
  manageGlobalCalibrationSettings: boolean;
};

const NONE: SchoolCapabilities = {
  manageSchoolProfile: false,
  viewJoinCode: false,
  manageJoinCode: false,
  viewTeachers: false,
  manageTeachers: false,
  manageAcademicYears: false,
  manageClasses: false,
  manageStudents: false,
  createSessions: false,
  manageSessions: false,
  recordData: false,
  deleteData: false,
  importData: false,
  exportData: false,
  manageDevices: false,
  manageCalibrationSettings: false,
  manageGlobalCalibrationSettings: false,
};

export const CAPABILITIES: Record<SchoolMode, SchoolCapabilities> = {
  // Admin sekolah: semua.
  school: {
    ...(Object.fromEntries(Object.keys(NONE).map(key => [key, true])) as SchoolCapabilities),
    manageGlobalCalibrationSettings: false,
  },
  // Superadmin drill-down: read-only + ekspor (+ batas toleransi global).
  super: { ...NONE, viewJoinCode: true, viewTeachers: true, exportData: true, manageGlobalCalibrationSettings: true },
  // Guru: lihat kelas/siswa, buat sesi & catat data, ekspor.
  teacher: { ...NONE, createSessions: true, recordData: true, exportData: true },
};

export function capabilitiesFor(mode: SchoolMode): SchoolCapabilities {
  return CAPABILITIES[mode];
}
