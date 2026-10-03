import { Suspense } from 'react';
import CreatePage from '@/components/CreatePage';

export const metadata = { title: 'Create · Dré "Smoove" Productions' };

export default function Create() {
  return (
    <Suspense fallback={null}>
      <CreatePage />
    </Suspense>
  );
}
