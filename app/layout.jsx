import './globals.css';
import { Unbounded, Figtree, JetBrains_Mono } from 'next/font/google';
import AppShell from '@/components/AppShell';

const display = Unbounded({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata = {
  title: 'Dré "Smoove" Productions',
  description: 'Private AI music studio and recording vault.',
  robots: { index: false, follow: false },
  applicationName: 'Dré Smoove Productions',
};

export const viewport = {
  themeColor: '#07090e',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
