import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ChangePasswordError, changePassword } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

const MIN_LENGTH = 8;

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>;

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  invalid: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        data-autofocus={autoFocus ? true : undefined}
        className="pr-10"
        onChange={event => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible(current => !current)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-fg-subtle transition-colors hover:text-fg"
        aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Form ganti password akun sendiri (semua peran, termasuk superadmin). */
export function ChangePasswordDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const validate = (): Errors => {
    const result: Errors = {};
    if (!current) result.current = 'Isi password saat ini.';
    if (next.length < MIN_LENGTH) result.next = `Password baru minimal ${MIN_LENGTH} karakter.`;
    else if (next === current) result.next = 'Password baru harus berbeda dari password saat ini.';
    if (confirm !== next) result.confirm = 'Konfirmasi tidak sama dengan password baru.';
    return result;
  };

  const onSubmit = async () => {
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      await changePassword(current, next);
      toast.success('Password berhasil diubah');
      onClose();
    } catch (error) {
      if (error instanceof ChangePasswordError && error.field === 'current') {
        setErrors({ current: error.message });
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      open={open}
      title="Ubah password"
      description="Gunakan minimal 8 karakter dan berbeda dari password saat ini."
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button type="submit" loading={pending}>
            Simpan password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <Field label="Password saat ini" error={errors.current}>
          {id => <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" invalid={!!errors.current} autoFocus />}
        </Field>
        <Field label="Password baru" error={errors.next} hint={`Minimal ${MIN_LENGTH} karakter.`}>
          {id => <PasswordInput id={id} value={next} onChange={setNext} autoComplete="new-password" invalid={!!errors.next} />}
        </Field>
        <Field label="Konfirmasi password baru" error={errors.confirm}>
          {id => <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!errors.confirm} />}
        </Field>
      </div>
    </Drawer>
  );
}
