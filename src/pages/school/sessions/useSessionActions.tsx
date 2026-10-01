import { useSchoolMutation } from '@/hooks/useSchoolData';
import { deleteSession, deleteSessions, setSessionsStatus, updateSessionStatus, type SessionKind } from '@/api/crud/sessions';
import { errorMessage } from '@/api/errors';
import type { SessionStatus } from '@/api/types';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

type SessionLite = { id: string; name: string };

const STATUS_COPY: Record<SessionStatus, { title: string; label: string; message: string; danger: boolean }> = {
  completed: {
    title: 'Tandai sesi selesai?',
    label: 'Tandai selesai',
    message: 'Sesi ditandai selesai. Data yang sudah dicatat tetap tersimpan dan masih bisa diubah.',
    danger: false,
  },
  cancelled: {
    title: 'Batalkan sesi?',
    label: 'Batalkan sesi',
    message: 'Sesi yang dibatalkan tidak dihitung dalam statistik ringkasan dan tidak bisa diisi. Data tetap tersimpan; sesi bisa diaktifkan kembali.',
    danger: true,
  },
  active: { title: 'Aktifkan kembali sesi?', label: 'Aktifkan', message: 'Sesi dapat diisi lagi.', danger: false },
  draft: { title: 'Jadikan draf?', label: 'Jadikan draf', message: 'Sesi dikembalikan ke status draf.', danger: false },
};

/** Aksi status & hapus sesi (dengan konfirmasi + toast), dipakai daftar & detail sesi. */
export function useSessionActions(kind: SessionKind) {
  const confirm = useConfirm();
  const toast = useToast();
  const status = useSchoolMutation(async (input: { ids: string[]; status: SessionStatus }, role): Promise<void> => {
    if (input.ids.length === 1) await updateSessionStatus(kind, input.ids[0], input.status, role);
    else await setSessionsStatus(kind, input.ids, input.status, role);
  });
  const removeOne = useSchoolMutation((input: { id: string; withRecords: boolean }, role) =>
    deleteSession(kind, input.id, role, { withRecords: input.withRecords }),
  );
  const removeMany = useSchoolMutation((input: { ids: string[]; withRecords: boolean }, role) =>
    deleteSessions(kind, input.ids, role, { withRecords: input.withRecords }),
  );

  const askStatus = (sessions: SessionLite[], next: SessionStatus, onDone?: () => void) => {
    const copy = STATUS_COPY[next];
    const label = sessions.length === 1 ? `"${sessions[0].name}"` : `${sessions.length} sesi`;
    return confirm({
      title: copy.title,
      tone: copy.danger ? 'danger' : 'primary',
      confirmLabel: copy.label,
      message: `${label}: ${copy.message}`,
      onConfirm: async () => {
        await status.mutateAsync({ ids: sessions.map(item => item.id), status: next });
        toast.success(sessions.length === 1 ? 'Status sesi diperbarui.' : `Status ${sessions.length} sesi diperbarui.`);
        onDone?.();
      },
    });
  };

  /** `recordCount` = jumlah data siswa di sesi; bila > 0, record ikut dihapus (dijelaskan di dialog). */
  const askDelete = (sessions: Array<SessionLite & { recordCount: number }>, onDone?: () => void) => {
    const records = sessions.reduce((sum, item) => sum + item.recordCount, 0);
    const label = sessions.length === 1 ? `"${sessions[0].name}"` : `${sessions.length} sesi`;
    return confirm({
      title: sessions.length === 1 ? 'Hapus sesi?' : `Hapus ${sessions.length} sesi?`,
      tone: 'danger',
      confirmLabel: 'Hapus permanen',
      message:
        records > 0 ? (
          <>
            {label} beserta <b>{records} data pencatatan siswa</b> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            Pertimbangkan <i>Batalkan sesi</i> bila hanya ingin mengecualikannya dari statistik.
          </>
        ) : (
          `${label} akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
        ),
      onConfirm: async () => {
        if (sessions.length === 1) {
          await removeOne.mutateAsync({ id: sessions[0].id, withRecords: sessions[0].recordCount > 0 });
          toast.success('Sesi dihapus.');
        } else {
          const result = await removeMany.mutateAsync({ ids: sessions.map(item => item.id), withRecords: records > 0 });
          if (result.ok === 0) throw result.failed[0]?.error ?? new Error('Gagal menghapus sesi.');
          if (result.failed.length > 0) {
            toast.warning(`${result.ok} sesi dihapus, ${result.failed.length} gagal.`, {
              description: errorMessage(result.failed[0].error),
            });
          } else {
            toast.success(`${result.ok} sesi dihapus.`);
          }
        }
        onDone?.();
      },
    });
  };

  return { askStatus, askDelete };
}
