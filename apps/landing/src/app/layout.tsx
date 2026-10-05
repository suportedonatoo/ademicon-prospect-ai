import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

// Fonte arredondada próxima da identidade da marca (troque pela fonte oficial quando houver o arquivo).
const brandFont = Geist({ subsets: ['latin'], variable: '--font-brand', display: 'swap' });

export const metadata: Metadata = { title: 'Simulação de consórcio', robots: { index: true, follow: true } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={brandFont.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
