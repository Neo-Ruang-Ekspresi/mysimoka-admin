# MySimoka Admin

Dashboard web untuk **MySimoka** — pencatatan antropometri (tinggi/berat, status gizi) dan imunisasi
siswa SD. Dua mode:

| Mode | Role Hasura | Akses |
|---|---|---|
| **Admin Sekolah** (`/sekolah`) | `school_admin` (alias `admin_sekolah`) | KPI, grafik, CRUD siswa/kelas/guru/tahun ajaran/sesi, ekspor CSV, profil & kode gabung |
| **Superadmin** (`/superadmin`) | `super_admin` (**baru**, lihat `docs/superadmin_backend.md`) | semua sekolah + KPI, drill-down sekolah (read-only), pengguna & membership, statistik global |

Setelah login, role dibaca dari klaim JWT `x-hasura-allowed-roles` + membership sekolah
(`school_memberships`). User dengan kedua role dapat berpindah mode dari topbar.

Stack: Vite 8 + React 19 + TypeScript, react-router, TanStack Query, Tailwind CSS v4, Recharts, lucide-react.

## Menjalankan

```bash
cp .env.example .env        # sesuaikan bila perlu (default = endpoint produksi, sama dengan app mobile)
npm install
npm run dev                 # http://localhost:5174
npm run typecheck           # tsc --noEmit
npm run build               # tsc --noEmit && vite build → dist/
npm run preview             # sajikan dist/ secara lokal
```

### Environment

| Variabel | Default | Keterangan |
|---|---|---|
| `VITE_AUTH_BASE_URL` | `https://auth.mysimoka.sunhouse.co.id` | `/login`, `/refresh`, `/register` |
| `VITE_API_BASE_URL` | `https://api.mysimoka.sunhouse.co.id` | REST API (belum dipakai; disiapkan) |
| `VITE_GRAPHQL_URL` | `https://hasura.mysimoka.sunhouse.co.id/v1/graphql` | Hasura |
| `VITE_ENABLE_SUPERADMIN_PREVIEW` | `false` | `true` = tampilkan menu Superadmin walau JWT belum memuat `super_admin` (uji integrasi backend) |

Variabel `VITE_*` di-inline saat **build**. CORS Hasura/auth service harus mengizinkan origin dashboard.

### Docker

```bash
docker build -t mysimoka-admin \
  --build-arg VITE_GRAPHQL_URL=https://hasura.mysimoka.sunhouse.co.id/v1/graphql .
docker run --rm -p 8080:8080 mysimoka-admin     # http://localhost:8080, health: /healthz
```

Image: build Node 22 → `nginxinc/nginx-unprivileged` (port 8080, non-root) dengan SPA fallback
(`deploy/nginx.conf`), pola yang sama dengan `mysimoka-web`.

## Struktur

```
src/
  config/env.ts            URL endpoint dari VITE_* (fallback = default app mobile)
  api/
    auth.ts                login / refresh (single-flight, proaktif sebelum exp) / register
    session.ts             penyimpanan sesi (localStorage key sama dengan mobile: mysimoka:auth-session)
    graphql.ts             klien Hasura: Bearer + x-hasura-role, retry setelah refresh, klasifikasi error
    errors.ts              ApiError / AuthExpiredError / PermissionError / NetworkError
    types.ts               tipe baris Hasura (kolom diverifikasi dengan metadata & SQL)
    school.ts              query & mutation admin sekolah (cermin mysimoka/src/services/auth.ts)
    superadmin.ts          query agregat & lintas sekolah (role super_admin)
  auth/AuthContext.tsx     sesi, role, membership, sekolah aktif, mode
  scope/SchoolScope.tsx    konteks sekolah (dipakai ulang admin sekolah & drill-down superadmin read-only)
  hooks/useSchoolData.ts   hook TanStack Query per resource + mutation dengan invalidasi
  lib/                     analytics (KPI/tren/cakupan), status gizi, format id-ID, CSV, JWT, role
  components/ui|layout|charts
  pages/school/*           Ringkasan, Siswa, Kelas, Guru, Tahun Ajaran, Sesi (+detail), Profil
  pages/superadmin/*       Statistik global, Sekolah (+detail), Pengguna
docs/superadmin_backend.md permission Hasura + SQL untuk role super_admin
```

## Konvensi yang diikuti dari app mobile

- Login `POST {AUTH}/login` `{email,password}`; token dibaca dari `access_token|accessToken|token`
  (juga di `data.*`); refresh `POST {AUTH}/refresh` dengan body `{refreshToken, refresh_token}`.
- Hasura: `Authorization: Bearer <token>` + `x-hasura-role` (default = role tertinggi JWT yang sudah
  dinormalisasi, `admin_sekolah → school_admin`, `school_member → teacher`). Membership user
  dibaca dengan `x-hasura-role: user`.
- HTTP 401 / error GraphQL JWT → refresh token lalu retry sekali; gagal → sesi dihapus → /login.
  Beda dari mobile: error `access-denied`/permission **tidak** memicu logout, melainkan
  ditampilkan sebagai "Belum ada izin backend".
- Mutation yang dicerminkan: `insert_students_one` + `insert_student_enrollments_one`,
  `insert/update_classes`, `insert/update/delete_academic_years`, `insert_measurement_sessions_one`,
  `insert_immunization_sessions_one`, upsert `student_measurement_records` /
  `student_immunization_records` (on_conflict `*_one_per_session_student`), `update_schools_by_pk`
  (profil & kode gabung), tambah guru (cari `auth_users` → `/register` bila belum ada →
  `auth_roles` teacher/school_member → `auth_user_roles` → `school_memberships`).
- Tambahan yang **tidak ada di mobile** tapi permission-nya terverifikasi di metadata:
  `update_students_by_pk` (edit siswa), `update_student_enrollments_by_pk` (pindah kelas),
  `update_*_sessions_by_pk` (ubah status sesi: selesai/batal/aktif).

## Known gaps

- **Status gizi** memakai ambang IMT dewasa (18,5 / 25 / 30) persis seperti mobile
  (`getBmiCategory`). Untuk anak SD standar yang benar adalah **IMT/U z-score** (WHO 2007 /
  Permenkes No. 2/2020) berdasarkan usia & jenis kelamin; perlu tabel LMS referensi (belum ada di
  repo). Akibatnya banyak siswa akan terkategori "Kurus".
- **academic_years** global (tanpa `school_id`) dan tanpa kolom `is_active`; "tahun ajaran aktif" =
  `start_year` terbesar (sama dengan mobile). Menambah/menghapus tahun ajaran berdampak ke semua sekolah.
- **Wali kelas** tidak ada di skema (tidak ada relasi guru↔kelas); mobile memakai guru pertama.
  Dashboard tidak menampilkan wali kelas.
- **Sesi & record tanpa relationship** Hasura → join dilakukan di klien; semua record sesi sekolah
  diambil sekaligus (cukup untuk skala satu sekolah, tapi tanpa paginasi server).
- **Filter permission `{}`** pada tabel sesi/record (`school_admin`) & `school_memberships` (`user`):
  dashboard selalu memfilter `school_id`/`user_id` eksplisit, namun backend perlu memperketat
  (lihat `docs/superadmin_backend.md` §5).
- **Ganti sekolah** di topbar hanya lokal (localStorage); tidak memanggil flow `setActiveSchool`
  mobile (yang mengubah `school_memberships.is_active` & refresh token) agar tidak mengubah
  sekolah aktif di perangkat mobile user. Permission Hasura tidak bergantung pada sekolah aktif.
- **Tambah guru**: mobile menimpa default role `auth.user_roles`; dashboard hanya menambah default
  role bila user belum punya, supaya admin/superadmin yang diundang tidak turun role.
  `/register` bisa mengirim email verifikasi — perilaku auth service tidak terdokumentasi di repo.
- Tidak ada **hapus** siswa/kelas/sesi (mobile juga tidak; permission delete sesi ada namun sengaja
  tidak dipakai). Nonaktifkan siswa via edit.
- **Superadmin**: seluruh query gagal dengan "Belum ada izin backend" sampai
  `docs/superadmin_backend.md` diterapkan. Drill-down memakai halaman sekolah yang sama (read-only).
  Kolom `face_embeddings` belum ditampilkan.
- REST API (`VITE_API_BASE_URL`, `api_reference_live.md`) belum dipakai; semua data via Hasura
  seperti app mobile.
- Tidak ada test otomatis; verifikasi = `npm run typecheck` + `npm run build`.
