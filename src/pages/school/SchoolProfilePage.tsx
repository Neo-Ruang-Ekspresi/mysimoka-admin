import { useEffect, useState, type FormEvent } from 'react';
import { Copy, RefreshCw, Save } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMutation, useSchoolProfile } from '@/hooks/useSchoolData';
import { regenerateJoinCode, updateSchoolProfile } from '@/api/school';
import { errorMessage } from '@/api/errors';
import { formatDate } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Field, FormError, Input, Textarea } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function SchoolProfilePage() {
  const { schoolId, readOnly } = useSchoolScope();
  const profile = useSchoolProfile();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', address: '' });
  const [error, setError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setForm({ name: profile.data.name ?? '', number: profile.data.number ?? '', address: profile.data.address ?? '' });
    }
  }, [profile.data]);

  const save = useSchoolMutation((input: typeof form, role) => updateSchoolProfile({ ...input, schoolId }, role));
  const regenerate = useSchoolMutation((_: void, role) => regenerateJoinCode(schoolId, role));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync(form);
      toast.success('Profil sekolah disimpan.');
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  const joinCode = profile.data?.join_code ?? null;

  return (
    <div>
      <PageHeader title="Profil Sekolah" description="Identitas sekolah dan kode gabung untuk guru." />
      <QueryBoundary isLoading={profile.isLoading} error={profile.error} onRetry={() => void profile.refetch()}>
        {() =>
          !profile.data ? (
            <Card>
              <p className="p-8 text-center text-sm text-fg-subtle">Profil sekolah tidak ditemukan.</p>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Identitas sekolah" description={`Terdaftar sejak ${formatDate(profile.data.created_at)}`} />
                <CardBody>
                  <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FormError message={error} />
                    </div>
                    <Field label="Nama sekolah *" className="sm:col-span-2">
                      {id => (
                        <Input id={id} value={form.name} disabled={readOnly} onChange={e => setForm({ ...form, name: e.target.value })} />
                      )}
                    </Field>
                    <Field label="NPSN / nomor sekolah">
                      {id => (
                        <Input id={id} value={form.number} disabled={readOnly} onChange={e => setForm({ ...form, number: e.target.value })} />
                      )}
                    </Field>
                    <Field label="ID sekolah">{id => <Input id={id} value={profile.data!.id} disabled readOnly />}</Field>
                    <Field label="Alamat *" className="sm:col-span-2">
                      {id => (
                        <Textarea
                          id={id}
                          value={form.address}
                          disabled={readOnly}
                          onChange={e => setForm({ ...form, address: e.target.value })}
                        />
                      )}
                    </Field>
                    {!readOnly ? (
                      <div className="sm:col-span-2">
                        <Button type="submit" loading={save.isPending} icon={<Save className="size-4" />}>
                          Simpan perubahan
                        </Button>
                      </div>
                    ) : null}
                  </form>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Kode gabung" description="Dipakai guru untuk bergabung dari aplikasi mobile." />
                <CardBody className="flex flex-col items-start gap-4">
                  <code className="w-full rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.3em] text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                    {joinCode ?? '—'}
                  </code>
                  <div className="flex flex-wrap gap-2">
                    {joinCode ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Copy className="size-3.5" />}
                        onClick={() =>
                          navigator.clipboard
                            .writeText(joinCode)
                            .then(() => toast.success('Kode gabung disalin.'))
                            .catch(() => toast.error('Gagal menyalin kode.'))
                        }
                      >
                        Salin
                      </Button>
                    ) : null}
                    {!readOnly ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw className="size-3.5" />}
                        onClick={() => setConfirmRegenerate(true)}
                      >
                        Buat kode baru
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            </div>
          )
        }
      </QueryBoundary>
      <ConfirmDialog
        open={confirmRegenerate}
        title="Buat kode gabung baru?"
        message="Kode lama tidak dapat dipakai lagi. Guru yang sudah bergabung tidak terpengaruh."
        confirmLabel="Buat kode baru"
        loading={regenerate.isPending}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={async () => {
          try {
            await regenerate.mutateAsync();
            toast.success('Kode gabung baru dibuat.');
            setConfirmRegenerate(false);
          } catch (regenerateError) {
            toast.error(errorMessage(regenerateError));
          }
        }}
      />
    </div>
  );
}
