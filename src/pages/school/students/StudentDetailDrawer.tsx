import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightLeft, CheckCircle2, ChevronRight, LineChart, Pencil, PauseCircle, PlayCircle, ScanFace, Trash2, XCircle } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useClasses,
  useEnrollments,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
  useSchoolMutation,
  useStudents,
} from '@/hooks/useSchoolData';
import { useDrawerState, useStudentFaces } from '@/hooks/useCrud';
import { useStudentAttempts, type AttemptHistory } from '@/hooks/useRecordHistory';
import { attemptKey } from '@/api/recordHistory';
import type { ImmunizationRecordRow, MeasurementRecordRow } from '@/api/types';
import { AttemptsBadge, ImmunizationRecordDrawer, MeasurementRecordDrawer, ReferenceNote } from '@/components/records/RecordDetailDrawer';
import {
  deleteEnrollment,
  ENROLLMENT_STATUS_LABEL,
  setStudentActive,
  updateEnrollment,
  type EnrollmentStatus,
} from '@/api/crud/students';
import { resetStudentFaces } from '@/api/crud/faces';
import { errorMessage } from '@/api/errors';
import { toMeasurementView, type MeasurementView, type StudentView } from '@/lib/analytics';
import { ageInYears, formatDate, formatDateTime, formatDecimal, genderLabel } from '@/lib/format';
import { readNumber } from '@/lib/object';
import { Badge, ImmunizationStatusBadge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { RowActions } from '@/components/ui/RowActions';
import { Skeleton } from '@/components/ui/Skeleton';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

const ENROLLMENT_TONE: Record<string, Tone> = { active: 'success', inactive: 'neutral', graduated: 'brand', transferred: 'warning' };

/**
 * SLOT grafik pertumbuhan: halaman `siswa/:studentId` (StudentGrowthPage, milik modul
 * laporan/grafik) terdaftar di SCHOOL_PAGES → di sini hanya TAUTAN, grafik tidak diimplementasikan.
 * (Tidak meng-import SCHOOL_PAGES untuk menghindari import melingkar.)
 */
const GROWTH_PAGE_AVAILABLE = true;

function Delta({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return <span className="text-fg-subtle">-</span>;
  const sign = value > 0.05 ? '+' : value < -0.05 ? '−' : '±';
  return (
    <span className={value > 0.05 ? 'text-success' : value < -0.05 ? 'text-warning' : 'text-fg-muted'}>
      {sign}
      {formatDecimal(Math.abs(value))} {unit}
    </span>
  );
}

/** Ringkasan di atas tabel pengukuran: jumlah, percobaan, terakhir ukur, tren vs sebelumnya. */
function MeasurementSummary({ measurements, attempts }: { measurements: MeasurementView[]; attempts: AttemptHistory }) {
  // `measurements` terurut terbaru dulu (order_by measured_at desc).
  const [latest, previous] = measurements;
  const totalAttempts = attempts.available
    ? measurements.reduce(
        (sum, item) =>
          sum + Math.max(1, attempts.bySessionStudent.get(attemptKey(item.record.session_id, item.record.student_id))?.length ?? 0),
        0,
      )
    : null;
  const diff = (a: number | null | undefined, b: number | null | undefined) =>
    a === null || a === undefined || b === null || b === undefined ? null : a - b;
  const items: Array<[string, ReactNode, ReactNode?]> = [
    ['Total pengukuran', measurements.length, `${new Set(measurements.map(item => item.record.session_id)).size} sesi`],
    [
      'Total percobaan',
      totalAttempts ?? '-',
      totalAttempts === null ? 'riwayat belum tersedia' : totalAttempts > measurements.length ? `${totalAttempts - measurements.length} ukur ulang` : 'tanpa ukur ulang',
    ],
    ['Terakhir diukur', formatDate(latest?.record.measured_at), latest ? `TB ${formatDecimal(latest.heightCm)} · BB ${formatDecimal(latest.weightKg)}` : undefined],
    [
      'Tren vs sebelumnya',
      previous ? (
        <span className="flex flex-col text-sm">
          <span>TB <Delta value={diff(latest?.heightCm, previous.heightCm)} unit="cm" /></span>
          <span>BB <Delta value={diff(latest?.weightKg, previous.weightKg)} unit="kg" /></span>
        </span>
      ) : (
        '-'
      ),
      previous ? `sejak ${formatDate(previous.record.measured_at)}` : 'baru 1 pengukuran',
    ],
  ];
  return (
    <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value, hint]) => (
        <div key={label} className="rounded-lg border border-line bg-card-muted/40 px-3 py-2">
          <dt className="text-xs text-fg-subtle">{label}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-fg">{value}</dd>
          {hint ? <dd className="text-xs text-fg-subtle">{hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StudentDetailDrawer({
  open,
  student: snapshot,
  onClose,
  onEdit,
  onMove,
}: {
  open: boolean;
  student: StudentView | null;
  onClose: () => void;
  onEdit: (student: StudentView) => void;
  onMove: (student: StudentView) => void;
}) {
  const { basePath, can } = useSchoolScope();
  const canManage = can.manageStudents;
  const canDelete = can.manageStudents && can.deleteData;
  const confirm = useConfirm();
  const toast = useToast();
  const classes = useClasses();
  const enrollments = useEnrollments();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  // Selalu pakai data terbaru dari cache (setelah mutasi), fallback ke snapshot saat dibuka.
  const students = useStudents();
  const student = students.data?.find(item => item.id === snapshot?.id) ?? snapshot;
  const faces = useStudentFaces(open && canManage ? (student?.id ?? null) : null);
  const mAttempts = useStudentAttempts('measurement', open ? student?.id : null);
  const iAttempts = useStudentAttempts('immunization', open ? student?.id : null);
  const mViewer = useDrawerState<MeasurementRecordRow>();
  const iViewer = useDrawerState<ImmunizationRecordRow>();

  const setActive = useSchoolMutation((input: { id: string; active: boolean; enrollmentId?: string }, role) =>
    (async () => {
      await setStudentActive(input.id, input.active, role);
      if (input.enrollmentId) await updateEnrollment(input.enrollmentId, { status: 'active' }, role);
    })(),
  );
  const setStatus = useSchoolMutation((input: { id: string; status: EnrollmentStatus }, role) =>
    updateEnrollment(input.id, { status: input.status }, role),
  );
  const removeEnrollment = useSchoolMutation((id: string, role) => deleteEnrollment(id, role));
  const resetFaces = useSchoolMutation((input: { studentId: string; ids: string[] }, role) =>
    resetStudentFaces(input.studentId, input.ids, role),
  );

  if (!student) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const s = student.student;
  const classById = new Map((classes.data ?? []).map(item => [item.id, item]));
  const sessionName = new Map([...(mSessions.data ?? []), ...(iSessions.data ?? [])].map(item => [item.id, item.name]));
  const history = (enrollments.data ?? [])
    .filter(item => item.student_id === student.id)
    .sort((a, b) => (b.enrolled_at ?? b.created_at ?? '').localeCompare(a.enrolled_at ?? a.created_at ?? ''));
  const measurements = (mRecords.data ?? []).filter(item => item.student_id === student.id).map(item => toMeasurementView(item, s));
  const immunizations = (iRecords.data ?? []).filter(item => item.student_id === student.id);
  const faceRows = faces.data;
  const age = ageInYears(s.date_of_birth);

  const askToggleActive = () => {
    const active = student.isActive;
    void confirm({
      title: active ? `Nonaktifkan ${s.full_name}?` : `Aktifkan kembali ${s.full_name}?`,
      tone: active ? 'danger' : 'primary',
      confirmLabel: active ? 'Nonaktifkan' : 'Aktifkan',
      message: active
        ? 'Siswa tidak lagi muncul di roster sesi dan statistik siswa aktif. Riwayat pengukuran & imunisasi tetap tersimpan, dan siswa bisa diaktifkan kembali kapan saja.'
        : 'Siswa akan kembali muncul di roster kelasnya.',
      onConfirm: async () => {
        await setActive.mutateAsync({
          id: student.id,
          active: !active,
          enrollmentId: !active && student.enrollmentStatus && student.enrollmentStatus !== 'active' ? student.enrollmentId : undefined,
        });
        toast.success(active ? 'Siswa dinonaktifkan.' : 'Siswa diaktifkan kembali.');
      },
    });
  };

  const askEnrollmentStatus = (id: string, status: EnrollmentStatus, className: string) =>
    void confirm({
      title: `Ubah status di ${className}?`,
      tone: status === 'active' ? 'primary' : 'danger',
      confirmLabel: 'Ubah status',
      message: `Status keanggotaan kelas menjadi "${ENROLLMENT_STATUS_LABEL[status]}".${
        status === 'active' ? '' : ' Siswa tidak dihitung di roster kelas tersebut.'
      }`,
      onConfirm: async () => {
        await setStatus.mutateAsync({ id, status });
        toast.success('Status kelas diperbarui.');
      },
    });

  const askDeleteEnrollment = (id: string, className: string) =>
    void confirm({
      title: `Hapus riwayat kelas ${className}?`,
      tone: 'danger',
      confirmLabel: 'Hapus riwayat',
      message:
        'Riwayat keanggotaan kelas ini dihapus permanen. Data pengukuran/imunisasi tetap tersimpan (tautan ke enrollment dikosongkan).',
      onConfirm: async () => {
        await removeEnrollment.mutateAsync(id);
        toast.success('Riwayat kelas dihapus.');
      },
    });

  const askResetFaces = () => {
    if (!faceRows || faceRows.length === 0) return;
    void confirm({
      title: `Reset data wajah ${s.full_name}?`,
      tone: 'danger',
      confirmLabel: 'Reset wajah',
      message: `${faceRows.length} data wajah akan dihapus permanen. Siswa tidak bisa dikenali lewat identifikasi wajah sampai didaftarkan ulang dari aplikasi mobile.`,
      onConfirm: async () => {
        await resetFaces.mutateAsync({ studentId: student.id, ids: faceRows.map(item => item.id) });
        await faces.refetch();
        toast.success('Data wajah direset.');
      },
    });
  };

  return (
    <>
      <Drawer
        open={open}
        size="xl"
        title={s.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            NISN {s.student_number ?? '-'} · {student.className}
            <Badge tone={student.isActive ? 'success' : 'neutral'}>{student.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
          </span>
        }
        onClose={onClose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div>
              {GROWTH_PAGE_AVAILABLE ? (
                <Link
                  to={`${basePath}/siswa/${student.id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  <LineChart className="size-4" /> Grafik pertumbuhan
                </Link>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <Button variant="secondary" size="sm" icon={student.isActive ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />} onClick={askToggleActive}>
                    {student.isActive ? 'Nonaktifkan' : 'Aktifkan kembali'}
                  </Button>
                  <Button variant="secondary" size="sm" icon={<ArrowRightLeft className="size-3.5" />} onClick={() => onMove(student)}>
                    Pindah kelas
                  </Button>
                  <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(student)}>
                    Ubah
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Tutup
                </Button>
              )}
            </div>
          </div>
        }
      >
        <Section title="Profil">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ['Jenis kelamin', genderLabel(s.gender)],
              ['Tanggal lahir', formatDate(s.date_of_birth)],
              ['Usia', age === null ? '-' : `${age} tahun`],
              ['Orang tua', s.parent_name ?? '-'],
              ['Telepon', s.parent_phone ?? '-'],
              ['Alamat', s.address ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{label}</dt>
                <dd className="break-words text-fg">{value}</dd>
              </div>
            ))}
            {s.notes ? (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-fg-subtle">Catatan</dt>
                <dd className="whitespace-pre-line text-fg">{s.notes}</dd>
              </div>
            ) : null}
          </dl>
        </Section>

        <Section title={`Kelas & riwayat (${history.length})`}>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {history.map(item => {
              const classRow = classById.get(item.class_id);
              const className = classRow?.name ?? 'Kelas tidak diketahui';
              const status = (item.status ?? 'active') as EnrollmentStatus;
              const isCurrent = item.id === student.enrollmentId;
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">
                      {className}
                      {isCurrent ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">(saat ini)</span> : null}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {classRow?.academic_year?.label ? `TA ${classRow.academic_year.label} · ` : ''}
                      sejak {formatDate(item.enrolled_at ?? item.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={ENROLLMENT_TONE[status] ?? 'neutral'}>{ENROLLMENT_STATUS_LABEL[status] ?? status}</Badge>
                    {canManage ? (
                      <RowActions
                        label="Aksi riwayat kelas"
                        actions={[
                          ...(['active', 'graduated', 'transferred', 'inactive'] as EnrollmentStatus[])
                            .filter(next => next !== status)
                            .map(next => ({
                              label: `Tandai ${ENROLLMENT_STATUS_LABEL[next].toLowerCase()}`,
                              icon: next === 'active' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />,
                              onSelect: () => askEnrollmentStatus(item.id, next, className),
                            })),
                          {
                            label: 'Hapus riwayat',
                            icon: <Trash2 className="size-4" />,
                            tone: 'danger' as const,
                            hidden: !canDelete,
                            disabled: history.length <= 1,
                            title: history.length <= 1 ? 'Satu-satunya kelas siswa; siswa akan hilang dari daftar' : undefined,
                            onSelect: () => askDeleteEnrollment(item.id, className),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={`Riwayat pengukuran (${measurements.length})`}>
          {measurements.length === 0 ? (
            <p className="text-sm text-fg-subtle">Belum ada data pengukuran.</p>
          ) : (
            <>
              <MeasurementSummary measurements={measurements} attempts={mAttempts} />
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-card-muted/60 text-left text-xs text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tanggal</th>
                      <th className="px-3 py-2 font-medium">Sesi</th>
                      <th className="px-3 py-2 font-medium">TB (cm)</th>
                      <th className="px-3 py-2 font-medium">BB (kg)</th>
                      <th className="px-3 py-2 font-medium">IMT</th>
                      <th className="px-3 py-2 font-medium">Percobaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map(item => {
                      const count = mAttempts.bySessionStudent.get(attemptKey(item.record.session_id, student.id))?.length ?? 0;
                      return (
                        <tr
                          key={item.record.id}
                          onClick={() => mViewer.show(item.record)}
                          className="cursor-pointer border-t border-line transition-colors hover:bg-brand-50/60 dark:hover:bg-brand-900/20"
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-left font-medium text-brand-600 hover:underline focus-visible:underline dark:text-brand-300"
                              aria-label={`Detail pengukuran ${formatDateTime(item.record.measured_at)}`}
                              onClick={event => {
                                event.stopPropagation();
                                mViewer.show(item.record);
                              }}
                            >
                              {formatDateTime(item.record.measured_at)}
                            </button>
                          </td>
                          <td className="px-3 py-2">{sessionName.get(item.record.session_id) ?? '-'}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatDecimal(item.heightCm)}
                            <ReferenceNote record={item.record} kind="height" />
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatDecimal(item.weightKg)}
                            <ReferenceNote record={item.record} kind="weight" />
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatDecimal(item.bmi)} {item.category ? <span className="text-xs text-fg-subtle">· {item.category}</span> : null}
                          </td>
                          <td className="px-3 py-2">
                            {count > 1 ? <AttemptsBadge count={count} /> : <span className="text-xs text-fg-subtle">{mAttempts.available ? '1' : '-'}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-xs text-fg-subtle">Klik baris untuk melihat detail lengkap{mAttempts.available ? ' dan semua percobaan di sesi tsb' : ''}.</p>
            </>
          )}
        </Section>

        <Section title={`Riwayat imunisasi (${immunizations.length})`}>
          {immunizations.length === 0 ? (
            <p className="text-sm text-fg-subtle">Belum ada catatan imunisasi.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {immunizations.map(item => {
                const count = iAttempts.bySessionStudent.get(attemptKey(item.session_id, student.id))?.length ?? 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => iViewer.show(item)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50/60 focus-visible:bg-brand-50/60 dark:hover:bg-brand-900/20 dark:focus-visible:bg-brand-900/20"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-fg">
                          {item.vaccine_name}
                          {item.dose_label ? ` · ${item.dose_label}` : ''}
                        </p>
                        <p className="text-xs text-fg-subtle">
                          {formatDateTime(item.administered_at)} · {sessionName.get(item.session_id) ?? '-'}
                          {item.officer_name ? ` · ${item.officer_name}` : ''}
                        </p>
                        {item.adverse_event_notes?.trim() ? <p className="text-xs text-danger">KIPI: {item.adverse_event_notes}</p> : null}
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <AttemptsBadge count={count} />
                        <ImmunizationStatusBadge status={item.status} />
                        <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {canManage ? (
          <Section
            title="Data wajah"
            action={
              canDelete && faceRows && faceRows.length > 0 ? (
                <Button variant="ghost" size="sm" className="text-danger" icon={<ScanFace className="size-3.5" />} onClick={askResetFaces}>
                  Reset wajah
                </Button>
              ) : null
            }
          >
            {faces.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : faces.error ? (
              <p className="text-sm text-danger">{errorMessage(faces.error)}</p>
            ) : faceRows === null || faceRows === undefined ? (
              <p className="text-sm text-fg-subtle">Data wajah tidak tersedia untuk peran ini.</p>
            ) : (
              <div className="rounded-lg border border-line px-3 py-2 text-sm">
                <p className="text-fg">
                  Data wajah: <b className="tabular-nums">{faceRows.length}</b>
                  {faceRows.length === 0 ? <span className="text-fg-subtle"> · belum didaftarkan dari aplikasi mobile</span> : null}
                </p>
                {faceRows.length > 0 ? (
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    Terakhir {formatDateTime(faceRows[0].created_at)}
                    {readNumber(faceRows[0].detection_score) !== null
                      ? ` · skor deteksi ${formatDecimal(readNumber(faceRows[0].detection_score), 2)}`
                      : ''}
                  </p>
                ) : null}
              </div>
            )}
          </Section>
        ) : null}
      </Drawer>
      <MeasurementRecordDrawer
        open={open && mViewer.open}
        record={mViewer.target}
        onClose={mViewer.close}
        attempts={mViewer.target ? mAttempts.bySessionStudent.get(attemptKey(mViewer.target.session_id, mViewer.target.student_id)) : undefined}
        historyAvailable={mAttempts.available}
        historyLoading={mAttempts.isLoading}
      />
      <ImmunizationRecordDrawer
        open={open && iViewer.open}
        record={iViewer.target}
        onClose={iViewer.close}
        attempts={iViewer.target ? iAttempts.bySessionStudent.get(attemptKey(iViewer.target.session_id, iViewer.target.student_id)) : undefined}
        historyAvailable={iAttempts.available}
        historyLoading={iAttempts.isLoading}
      />
    </>
  );
}
