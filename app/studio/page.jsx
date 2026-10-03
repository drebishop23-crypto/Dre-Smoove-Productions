import { Suspense } from 'react';
import StudioHome from '@/components/StudioHome';

export const metadata = { title: 'Studio · Dré "Smoove" Productions' };

export default function Studio() {
  return (
    <Suspense fallback={null}>
      <StudioHome />
    </Suspense>
  );
}
