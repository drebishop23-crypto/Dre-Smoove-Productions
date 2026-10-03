import './globals.css';
import AppShell from '@/components/AppShell';

const display={variable:''},body={variable:''},mono={variable:''};

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
