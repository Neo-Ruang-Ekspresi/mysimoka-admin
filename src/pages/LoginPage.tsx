import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Field, FormError, Input } from '@/components/ui/Form';

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from;
  if (isAuthenticated && !submitting) return <Navigate to={from ?? '/'} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (!password) {
      setError('Password wajib diisi.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from ?? '/', { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError, 'Login gagal. Periksa email dan password Anda.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-11 rounded-xl bg-white object-contain p-1" />
          <div>
            <p className="text-lg font-bold">MySimoka</p>
            <p className="text-xs text-brand-300">Dashboard Admin</p>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Pantau pertumbuhan &amp; imunisasi siswa dalam satu dashboard.
          </h1>
          <p className="mt-3 text-sm text-brand-100/80">
            Data antropometri, status gizi, dan cakupan imunisasi sekolah dasar — tersinkron dengan aplikasi mobile
            MySimoka.
          </p>
        </div>
        <p className="text-xs text-brand-100/60">© {new Date().getFullYear()} MySimoka · Sunhouse Digital</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-500/25 blur-2xl" aria-hidden />
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="" className="size-10 rounded-xl bg-white object-contain p-1 shadow-sm" />
            <p className="text-lg font-bold text-brand-900 dark:text-white">MySimoka Admin</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Masuk</h2>
          <p className="mt-1 text-sm text-fg-subtle">Gunakan akun yang sama dengan aplikasi mobile MySimoka.</p>

          <div className="mt-6 flex flex-col gap-4">
            <FormError message={error} />
            <Field label="Email">
              {id => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="nama@sekolah.sch.id"
                  required
                />
              )}
            </Field>
            <Field label="Password">
              {id => (
                <div className="relative">
                  <Input
                    id={id}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Field>
            <Button type="submit" loading={submitting} icon={<LogIn className="size-4" />} className="mt-2 w-full">
              Masuk
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
