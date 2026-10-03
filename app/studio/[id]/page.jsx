import StudioEditor from '@/components/StudioEditor';

export const metadata = { title: 'Studio · Dré "Smoove" Productions' };

export default function StudioProject({ params }) {
  return <StudioEditor id={params.id} />;
}
