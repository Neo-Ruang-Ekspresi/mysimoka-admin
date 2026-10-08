# Konvensi mysimoka-admin

Ringkas, wajib diikuti agar pekerjaan paralel (CRUD, impor/ekspor, grafik/laporan) tidak bentrok.

## 1. Motion (`motion/react`)

- Token & varian: `src/lib/motion.ts` (`DURATION`, `EASE_OUT`, `springSnappy`, `pageVariants`,
  `fadeInUp`, `staggerContainer()`, `staggerItem`, `modalPanel`, `backdrop`, `drawerPanel(side)`).
  Jangan menulis durasi/easing baru di halaman; pakai token ini. Durasi 150–250 ms.
- `prefers-reduced-motion` sudah dihormati global (`<MotionConfig reducedMotion="user">` di `main.tsx`).
  Untuk animasi CSS tambahkan `motion-reduce:*`.
- Sudah otomatis (tidak perlu apa-apa): transisi halaman (`AppLayout` → `AnimatedOutlet`),
  stagger baris `DataTable`, count-up + hover lift `StatCard`, press `Button`, indikator sidebar,
  dropdown topbar, `Modal`/`Drawer`/`Toast`/`ConfirmDialog`, fade-in konten `QueryBoundary`.
- Primitif (`src/components/ui/`):
  - `Animated.tsx`: `<FadeIn delay>` (satu blok), `<AnimatedList stagger>` + `<AnimatedItem>` (grid/list kartu),
    `tableRowVariants` (untuk tabel custom: `<motion.tr custom={i} variants={tableRowVariants} initial="hidden" animate="show">`).
  - `StatCard.tsx`: `<StatGrid>` (grid 2/4 kolom + stagger) berisi `<StatCard label value hint icon progress animateValue?>`.
    `value` number atau string berformat id-ID ("1.234", "45,6%", "12 cm") otomatis count-up.
  - `CountUp.tsx`: `<CountUp value={n} format={fn} />` untuk angka animasi di luar StatCard.
  - `Tabs.tsx`: `<Tabs items value onChange />` (state) dan `<NavTabs items={[{to,label,end}]} />` (route), indikator geser.

## 2. Overlay & feedback

- **Modal** (`Modal.tsx`): `<Modal open title description? onClose footer? size="sm|md|lg|xl">`. Untuk dialog pendek/detail.
- **Drawer** (`Drawer.tsx`) — pakai untuk **form tambah/ubah** data:
  ```tsx
  <Drawer open={!!editing} title="Ubah siswa" onClose={close} size="md|lg|xl" side="right"
    onSubmit={handleSubmit}  // membungkus body+footer dalam <form>, preventDefault sudah
    footer={<><Button variant="secondary" onClick={close}>Batal</Button>
              <Button type="submit" loading={m.isPending}>Simpan</Button></>}>
    …fields…
  </Drawer>
  ```
  Escape/klik backdrop menutup; fokus awal ke input pertama (atau elemen `data-autofocus`).
- **ConfirmDialog** (`ConfirmDialog.tsx`) — **wajib** untuk hapus/nonaktifkan:
  - Imperatif (disarankan):
    ```ts
    const confirm = useConfirm();
    await confirm({ title: 'Hapus kelas?', message: '…', tone: 'danger', confirmLabel: 'Hapus',
                    onConfirm: () => remove.mutateAsync(id) });   // → Promise<boolean>
    ```
    `onConfirm` async: tombol loading; reject → pesan error tampil di dialog, dialog tetap terbuka.
  - Deklaratif: `<ConfirmDialog open title message tone="danger" onConfirm={async () => …} onClose />`
    (promise resolve → `onClose` dipanggil otomatis). Prop lama `danger`/`loading` tetap didukung.
    Juga masih diekspor dari `Modal.tsx` (kompatibilitas).
- **RowActions** (`RowActions.tsx`): menu ⋯ per baris tabel (`actions=[{label, icon, onSelect, tone:'danger', hidden, disabled}]`),
  dirender lewat portal; klik tidak memicu `onRowClick`.
- **DataTable** multi-select: `selection={useSelection()}` (+ `isSelectable`) dan `bulkActions={(rows, clear) => …}`;
  `emptyAction` untuk CTA saat data kosong. State form Drawer: `useDrawerState<T>()` (`hooks/useCrud.ts`) →
  `<Form key={d.key} open={d.open} … onClose={d.close} />` agar animasi tutup tetap mulus & form ter-reset.
- Error Hasura → pesan Indonesia otomatis lewat `errorMessage()` (`api/errors.ts`: FK, unique/NISN, check, permission).
- **Toast** (`Toast.tsx`): `const toast = useToast()` atau import global `toast` (bisa di luar komponen).
  `toast.success|error|info|warning(message, { description?, duration? })`.
- **Skeleton** (`Skeleton.tsx`): `Skeleton`, `SkeletonText lines`, `SkeletonRow`, `SkeletonCard`,
  `SkeletonStatGrid count`, `SkeletonTable rows columns toolbar`, `SkeletonForm fields`, `SkeletonDashboard`.
  - `LoadingState variant="spinner|table|form|cards|dashboard"`.
  - `QueryBoundary skeleton="table"` (default `table`; pakai `form` untuk form, `cards`/`dashboard` sesuai konten).
  - Spinner hanya untuk gate/halaman penuh.

## 3. Scope sekolah & kapabilitas

`useSchoolScope()` → `{ schoolId, schoolName, role, basePath, mode, can, readOnly }`.

- `mode`: `'school'` (admin sekolah, `/sekolah`), `'teacher'` (guru, `/pengajar`, Hasura role `teacher`),
  `'super'` (drill-down superadmin, `/superadmin/sekolah/:id`).
- **Gating aksi WAJIB lewat `can.*`** (`src/scope/capabilities.ts`). Jangan cek `mode`/`readOnly` untuk tombol.
  `readOnly` deprecated (hanya kompatibilitas).
- Selalu kirim `role` dari scope ke API (`useSchoolMutation(fn)` sudah mengoper `role`).
- Link internal pakai `basePath` (`${basePath}/siswa`), jangan hardcode `/sekolah`.

| capability            | school | teacher | super |
|-----------------------|:------:|:-------:|:-----:|
| manageSchoolProfile   | ✓ | – | – |
| viewJoinCode          | ✓ | – | ✓ |
| manageJoinCode        | ✓ | – | – |
| viewTeachers          | ✓ | – | ✓ |
| manageTeachers        | ✓ | – | – |
| manageAcademicYears   | ✓ | – | – |
| manageClasses         | ✓ | – | – |
| manageStudents        | ✓ | – | – |
| createSessions        | ✓ | ✓ | – |
| manageSessions        | ✓ | – | – |
| recordData            | ✓ | ✓ | – |
| deleteData            | ✓ | – | – |
| importData            | ✓ | – | – |
| exportData            | ✓ | ✓ | ✓ |
| manageDevices         | ✓ | – | – |
| manageCalibrationSettings | ✓ | – | – |
| manageGlobalCalibrationSettings | – | – | ✓ |

Kapabilitas baru: tambah field di `SchoolCapabilities` + isi ketiga mode di `CAPABILITIES`.
Mode guru bisa saja ditolak Hasura untuk data tertentu → tangani `PermissionError` dengan degradasi halus
(contoh: `useSchoolProfile`/`useSchoolMembers` di `hooks/useSchoolData.ts`).

## 4. API — satu file per area fitur

- Jangan menumpuk fungsi baru di `src/api/school.ts` (sudah besar; rawan konflik). Buat file baru:
  - CRUD: `src/api/crud/<entitas>.ts` (mis. `crud/students.ts`, `crud/classes.ts`, `crud/sessions.ts`, `crud/teachers.ts`).
  - Impor/ekspor: `src/api/importExport.ts` (+ util parsing di `src/lib/excel.ts`).
  - Laporan/grafik: `src/api/reports.ts` (+ agregasi di `src/lib/reports.ts`).
- Semua fungsi menerima `role: string` sebagai argumen terakhir dan memanggil `gql(query, vars, { role })`.
  Selalu filter eksplisit per `school_id`/`session_id` (permission beberapa tabel `{}`).
- Hook React Query per area di `src/hooks/use<Area>.ts`; query key diawali `['school', schoolId, role, …]`
  agar `useSchoolMutation` meng-invalidate otomatis.

## 5. Route & menu

- Halaman sekolah terdaftar **sekali** di `src/routes/schoolPages.tsx` (`SCHOOL_PAGES`): `path`, `label`,
  `icon`, `element`, `visible?(can)`, `children?` (route detail), `inNav?`, `tabLabel?`.
  Dari situ diturunkan route (`schoolRoutes(mode)`), menu sidebar admin & guru (`schoolNavFor`) dan tab superadmin.
  Halaman yang `visible` false untuk sebuah mode tidak didaftarkan sebagai route (404).
- Base path: `src/routes/paths.ts` (`SCHOOL_BASE_PATH`, `TEACHER_BASE_PATH`, `SUPER_BASE_PATH`).
- Halaman superadmin global: `SUPER_NAV` + `<Route>` di `App.tsx`.
- Halaman baru → file sendiri di `src/pages/school/` atau `src/pages/superadmin/`; jangan membuat versi
  halaman terpisah per mode — gating via `can.*`.
