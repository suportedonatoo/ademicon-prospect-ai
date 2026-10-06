import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { TempPasswords, Toaster } from '@/components/client';
import { env } from '@/lib/env';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = {
  title: { default: env.APP_NAME, template: `%s · ${env.APP_NAME}` },
  description: 'Plataforma de prospecção, aquisição, IA e gestão comercial.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.png', apple: '/icon.png' },
  appleWebApp: { capable: true, title: 'Prospect AI', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#131c17', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body className="font-sans">
        {children}
        <Toaster />
        <TempPasswords />
      </body>
    </html>
  );
}
