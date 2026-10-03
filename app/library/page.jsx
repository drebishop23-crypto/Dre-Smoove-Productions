import { Suspense } from 'react';
import LibraryPage from '@/components/LibraryPage';

export const metadata = { title: 'Library · Dré "Smoove" Productions' };

export default function Library() {
  return (
    <Suspense fallback={null}>
      <LibraryPage />
    </Suspense>
  );
}
