import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';

/**
 * Mutation superadmin: mengoper role super_admin dan me-refresh data global (['super']) serta
 * cache sekolah (['school']) karena drill-down memakai ulang halaman sekolah.
 */
export function useSuperMutation<TInput, TResult = unknown>(fn: (input: TInput, role: string) => Promise<TResult>) {
  const { superAdminRole } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(input, superAdminRole),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super'] }),
        queryClient.invalidateQueries({ queryKey: ['school'] }),
        queryClient.invalidateQueries({ queryKey: ['my-memberships'] }),
      ]);
    },
  });
}
