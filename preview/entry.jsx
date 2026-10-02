import { createRoot } from 'react-dom/client';
import AppShell from '@/components/AppShell';
import StudioGenerator from '@/components/StudioGenerator';
import AudioVault from '@/components/AudioVault';
import { usePathname } from './shims/nav';
import { previewReady } from './mock-api';

function Routes() {
  const path = usePathname();
  return path.startsWith('/library') ? <AudioVault /> : <StudioGenerator />;
}

function App() {
  return (
    <>
      <div className="pointer-events-none fixed right-3 top-3 z-[80] rounded-full border border-neon-amber/40 bg-ink-900/90 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neon-amber backdrop-blur">
        Preview<span className="hidden sm:inline"> · sample tracks · simulated AI</span>
      </div>
      <AppShell>
        <Routes />
      </AppShell>
    </>
  );
}

previewReady().finally(() => {
  document.getElementById('boot')?.remove();
  createRoot(document.getElementById('root')).render(<App />);
});
