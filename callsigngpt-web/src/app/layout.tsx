// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import 'highlight.js/styles/github-dark-dimmed.css';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* Lock the viewport; page-level sections handle their own scrolling */}
      <body className="h-screen overflow-auto antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
