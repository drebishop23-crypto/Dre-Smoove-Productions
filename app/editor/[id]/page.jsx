import { Suspense } from 'react';
import SongEditor from '@/components/SongEditor';

export const metadata = { title: 'Editor · Dré "Smoove" Productions' };

export default function Editor({ params }) {
  return (
    <Suspense fallback={null}>
      <SongEditor id={params.id} />
    </Suspense>
  );
}
