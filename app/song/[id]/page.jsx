import SongPage from '@/components/SongPage';

export const metadata = { title: 'Song · Dré "Smoove" Productions' };

export default function Song({ params }) {
  return <SongPage id={params.id} />;
}
