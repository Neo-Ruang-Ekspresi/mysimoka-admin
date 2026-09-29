# Kebutuhan Backend: Role `super_admin`

Dashboard Superadmin (`/superadmin/*`) di `mysimoka-admin` mengirim setiap request GraphQL dengan
header `x-hasura-role: super_admin`. Role ini **belum ada** di backend (metadata snapshot
`mysimoka/docs/hasura_metadata_2026_06_23_20_02_51_377.json` hanya punya `user`, `school_member`,
`teacher`, `school_admin`, `admin_sekolah`). Sampai dokumen ini diterapkan, UI menampilkan state
**"Belum ada izin backend"** (tidak logout, tidak retry).

Ringkasnya ada 3 hal yang harus disiapkan backend:

1. Baris role `super_admin` di `auth.roles` dan relasi user di `auth.user_roles`.
2. Auth service memasukkan `super_admin` ke klaim JWT `x-hasura-allowed-roles`.
3. Permission Hasura **select-only** untuk role `super_admin` di semua tabel yang dipakai.

---

## 0. Cara cepat: script otomatis

`hasura/apply-superadmin.mjs` mengerjakan langkah 1 & 3 sekaligus. Kolom diambil dari DB live
(`information_schema`), metadata di-backup sebelum diubah, dan bulk update memakai
`resource_version` (atomik, gagal satu batal semua).

```bash
export HASURA_ENDPOINT=https://hasura.mysimoka.sunhouse.co.id
export HASURA_ADMIN_SECRET=...

node hasura/apply-superadmin.mjs                                   # dry-run: lihat rencana
node hasura/apply-superadmin.mjs --apply --harden --grant-email=superadmin@contoh.id
```

- `--harden` menutup celah di bagian 5: `school_admin`/`admin_sekolah` tidak bisa
  membuat/mengubah/menghapus role `super_admin` di `auth.roles` & `auth.user_roles`, dan
  `password_hash`/`email_verification_token` disembunyikan dari select role lain.
  Insert/update `password_hash` tetap dibiarkan (dipakai app mobile saat membuat akun guru).
- Rollback: `replace_metadata` dengan isi file di `hasura/backups/`.
- Langkah 2 (klaim JWT di auth service) tetap harus dicek manual.

## 1. Membuat role & memberikannya ke user (SQL)

```sql
-- 1) Role (idempoten). Kolom sesuai metadata auth.roles: id, code, name, description, is_system, created_at
INSERT INTO auth.roles (code, name, description, is_system)
VALUES ('super_admin', 'Super Admin', 'Akses baca lintas sekolah untuk dashboard admin MySimoka', true)
ON CONFLICT (code) DO NOTHING;           -- asumsi ada UNIQUE(code); sesuaikan bila berbeda

-- 2) Beri role ke user tertentu (berdasarkan email).
--    is_default = false agar default role user tidak berubah (app mobile tetap memakai role lamanya);
--    dashboard mengirim x-hasura-role: super_admin secara eksplisit.
INSERT INTO auth.user_roles (user_id, role_id, is_default)
SELECT u.id, r.id, false
FROM auth.users u
JOIN auth.roles r ON r.code = 'super_admin'
WHERE lower(u.email) = lower('superadmin@contoh.id')
ON CONFLICT DO NOTHING;                   -- asumsi PK (user_id, role_id)

-- Cabut role
DELETE FROM auth.user_roles ur
USING auth.roles r, auth.users u
WHERE ur.role_id = r.id AND ur.user_id = u.id
  AND r.code = 'super_admin' AND lower(u.email) = lower('superadmin@contoh.id');

-- Cek siapa saja yang memegang role
SELECT u.email, u.full_name, ur.is_default, ur.created_at
FROM auth.user_roles ur
JOIN auth.roles r ON r.id = ur.role_id
JOIN auth.users u ON u.id = ur.user_id
WHERE r.code = 'super_admin';
```

> Constraint `auth.roles.code` / PK `auth.user_roles` tidak ada di repo (skema auth tidak ikut
> di-dump). Bila `ON CONFLICT` gagal, hapus klausa tsb dan cek duplikasi manual.

## 2. Klaim JWT dari auth service

Frontend membaca role dari klaim (sama dengan app mobile):

```json
{
  "https://hasura.io/jwt/claims": {
    "x-hasura-user-id": "<uuid>",
    "x-hasura-default-role": "school_admin",
    "x-hasura-allowed-roles": ["user", "teacher", "school_admin", "super_admin"]
  }
}
```

Yang perlu dipastikan di auth service (`https://auth.mysimoka.sunhouse.co.id`, endpoint `/login`
dan `/refresh`):

- `x-hasura-allowed-roles` berisi **semua** `auth.roles.code` milik user dari `auth.user_roles`
  (bukan hanya default role / role membership sekolah aktif).
- `x-hasura-default-role` **jangan** diubah menjadi `super_admin` untuk user yang juga admin sekolah;
  app mobile tidak selalu mengirim `x-hasura-role` sehingga akan jatuh ke default role.
- Setelah role diberikan user harus login ulang (atau menunggu refresh token) agar klaim baru terbit.

Tanpa langkah ini Hasura membalas `access-denied: Your requested role is not in allowed roles`,
dan menu Superadmin tidak muncul (frontend hanya menampilkannya bila klaim memuat `super_admin`,
kecuali `VITE_ENABLE_SUPERADMIN_PREVIEW=true` untuk uji integrasi).

## 3. Permission Hasura untuk `super_admin`

Semua **select**, `filter: {}` (lintas sekolah), `allow_aggregations: true`. **Tidak ada**
insert/update/delete — dashboard superadmin read-only. Kolom rahasia `auth.users.password_hash` dan
`auth.users.email_verification_token` **tidak** diekspos.

| Tabel | Select | Row filter | Aggregations | Insert / Update / Delete | Dipakai untuk |
|---|---|---|---|---|---|
| `public.schools` | semua kolom | `{}` | ya | — | daftar sekolah, profil |
| `public.school_memberships` | semua kolom | `{}` | ya | — | guru/admin per sekolah, membership user |
| `public.classes` | semua kolom | `{}` | ya | — | kelas per sekolah |
| `public.student_enrollments` | semua kolom | `{}` | ya (**wajib**: `student_enrollments_aggregate`) | — | jumlah siswa aktif per sekolah |
| `public.students` | semua kolom | `{}` | ya (**wajib**: `students_aggregate`) | — | statistik global, daftar siswa |
| `public.academic_years` | semua kolom | `{}` | ya | — | label tahun ajaran kelas |
| `public.grade_levels` | semua kolom | `{}` | ya | — | label tingkat kelas |
| `public.measurement_sessions` | semua kolom | `{}` | ya (**wajib**) | — | sesi pengukuran |
| `public.student_measurement_records` | semua kolom | `{}` | ya (**wajib**) | — | record TB/BB, tren |
| `public.immunization_sessions` | semua kolom | `{}` | ya (**wajib**) | — | sesi imunisasi |
| `public.student_immunization_records` | semua kolom | `{}` | ya (**wajib**) | — | cakupan imunisasi |
| `public.face_embeddings` | metadata (tanpa vektor) | `{}` | opsional | — | belum dipakai UI (disiapkan) |
| `auth.users` | semua **kecuali** `password_hash`, `email_verification_token` | `{}` | ya (**wajib**: `auth_users_aggregate`) | — | daftar pengguna |
| `auth.roles` | semua kolom | `{}` | ya | — | label role |
| `auth.user_roles` | semua kolom | `{}` | ya | — | role auth per user |

Relationship yang dipakai frontend (semuanya **sudah ada** di metadata, cukup permission-nya):
`schools.user`, `schools.classes`, `schools.school_memberships`, `classes.grade_level`,
`classes.academic_year`, `classes.student_enrollments`, `student_enrollments.class`,
`student_enrollments.student`, `school_memberships.user`, `school_memberships.school`,
`auth.users.school_memberships`, `auth.users.user_roles`, `auth.user_roles.role`.

### 3a. Terapkan via Metadata API

`POST https://hasura.mysimoka.sunhouse.co.id/v1/metadata` dengan header
`x-hasura-admin-secret: <secret>`:

```json
{
  "type": "bulk",
  "args": [
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"auth","name":"roles"},"role":"super_admin","permission":{"columns":["code","created_at","description","id","is_system","name"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"auth","name":"user_roles"},"role":"super_admin","permission":{"columns":["created_at","is_default","role_id","user_id"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"auth","name":"users"},"role":"super_admin","permission":{"columns":["blocked_at","blocked_reason","created_at","email","email_verification_sent_at","full_name","id","image_url","is_blocked","is_email_verified","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"academic_years"},"role":"super_admin","permission":{"columns":["created_at","end_year","id","label","start_year","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"classes"},"role":"super_admin","permission":{"columns":["academic_year_id","created_at","grade_level_id","id","name","school_id","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"face_embeddings"},"role":"super_admin","permission":{"columns":["created_at","detection_score","file_path","id","student_id","submitted_by","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"grade_levels"},"role":"super_admin","permission":{"columns":["created_at","id","is_active","label","level_number","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"immunization_sessions"},"role":"super_admin","permission":{"columns":["class_id","created_at","created_by","dose_label","id","name","note","officer_name","school_id","session_date","status","updated_at","vaccine_name"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"measurement_sessions"},"role":"super_admin","permission":{"columns":["class_id","created_at","created_by","id","name","note","school_id","session_date","status","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"school_memberships"},"role":"super_admin","permission":{"columns":["created_at","id","is_active","joined_at","role","school_id","status","updated_at","user_id"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"schools"},"role":"super_admin","permission":{"columns":["address","created_at","created_by","id","join_code","name","number","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"student_enrollments"},"role":"super_admin","permission":{"columns":["class_id","created_at","enrolled_at","id","status","student_id","updated_at"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"student_immunization_records"},"role":"super_admin","permission":{"columns":["administered_at","adverse_event_notes","batch_number","capture_method","client_record_id","created_at","dose_label","id","injection_site","notes","officer_name","recorded_by","session_id","status","student_enrollment_id","student_id","updated_at","vaccine_name"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"student_measurement_records"},"role":"super_admin","permission":{"columns":["capture_method","capture_source","client_record_id","created_at","device_id","device_name","device_payload","height_cm","id","measured_at","notes","recorded_by","session_id","student_enrollment_id","student_id","updated_at","weight_kg"],"filter":{},"allow_aggregations":true}}},
    {"type":"pg_create_select_permission","args":{"source":"default","table":{"schema":"public","name":"students"},"role":"super_admin","permission":{"columns":["address","created_at","date_of_birth","full_name","gender","id","is_active","notes","parent_name","parent_phone","student_number","updated_at"],"filter":{},"allow_aggregations":true}}}
  ]
}
```

Lalu export metadata (`hasura metadata export`) dan commit ke repo backend.

### 3b. (Opsional, disarankan) Relationship tambahan

Tabel sesi & record belum punya relationship sehingga frontend melakukan join di klien. Untuk
query yang lebih efisien tambahkan (manual / FK sudah ada di SQL):

- `measurement_sessions.school` (school_id → schools.id), `measurement_sessions.class`, `measurement_sessions.records` (array → student_measurement_records.session_id)
- `immunization_sessions.school`, `immunization_sessions.class`, `immunization_sessions.records`
- `student_measurement_records.student`, `student_immunization_records.student`
- `schools.measurement_sessions`, `schools.immunization_sessions`

Frontend **tidak** bergantung pada relationship ini (belum ada), jadi aman ditambahkan kapan saja.

## 4. Verifikasi

```bash
TOKEN="<access token user super_admin>"
curl -s https://hasura.mysimoka.sunhouse.co.id/v1/graphql \
  -H "Authorization: Bearer $TOKEN" -H "x-hasura-role: super_admin" -H "Content-Type: application/json" \
  -d '{"query":"{ schools_aggregate { aggregate { count } } auth_users_aggregate { aggregate { count } } }"}'
```

Hasil yang diharapkan: angka count, bukan `access-denied` / `field ... not found in type: 'query_root'`.
Query lengkap yang dipakai UI ada di `src/api/superadmin.ts` dan `src/api/school.ts`
(fungsi `fetch*` dipanggil dengan role `super_admin` untuk drill-down sekolah).

## 5. Temuan permission existing (bukan untuk super_admin, tetapi perlu ditinjau)

Dari metadata snapshot yang sama — tidak diubah oleh dashboard, dicatat agar tim backend menilai:

- `measurement_sessions`, `immunization_sessions`, `student_measurement_records`,
  `student_immunization_records`: role `school_admin` memakai `filter: {}` untuk select/update/delete
  → admin satu sekolah bisa membaca/mengubah data sekolah lain. Dashboard selalu memfilter
  `school_id` / `session_id` secara eksplisit, tetapi itu bukan kontrol akses.
- `school_memberships`: role `user` & `school_member` memakai `filter: {}` untuk select/update
  → semua user dapat membaca dan mengubah membership siapa pun (dashboard memfilter `user_id`).
- `schools`: role `user` dapat update semua sekolah (`filter: {}`).
- `auth.users`: role `school_admin`/`admin_sekolah` dapat select `password_hash` dan
  `email_verification_token` serta insert/update/delete seluruh user.
- `auth.roles` / `auth.user_roles`: `school_admin` dapat insert/update/delete role global,
  artinya admin sekolah secara teori bisa memberi dirinya `super_admin`. **Tutup ini sebelum
  mengaktifkan role `super_admin`** (mis. batasi `auth.user_roles` insert ke role code
  `teacher`/`school_member` saja via check `{ role: { code: { _in: ["teacher","school_member"] } } }`).
