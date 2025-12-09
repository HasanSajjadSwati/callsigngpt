// app/layout.tsx
import './globals.css';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* Lock the viewport; page-level sections handle their own scrolling */}
      <body className="h-screen overflow-auto bg-black text-zinc-100 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
