'use client';

import { AuthProvider } from '@/lib/auth';
import { ModelProvider } from '@/lib/model';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ModelProvider>{children}</ModelProvider>
    </AuthProvider>
  );
}
