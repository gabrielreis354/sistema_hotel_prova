import { QueryClient } from '@tanstack/react-query';

// Um PMS é 90% estado de servidor. Defaults conservadores: sem refetch agressivo no foco,
// retry curto (o backend é a fonte da verdade e erros de negócio não devem ser reincididos).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
