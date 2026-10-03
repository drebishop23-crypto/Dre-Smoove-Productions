import { Suspense } from 'react';
import Connections from '@/components/Connections';

export const metadata = { title: 'Connections · Dré Smoove Productions' };

export default function ConnectionsPage() {
  return (
    <Suspense>
      <Connections />
    </Suspense>
  );
}
