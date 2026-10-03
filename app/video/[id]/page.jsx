import VideoStudio from '@/components/VideoStudio';

export const metadata = { title: 'Music video · Dré Smoove Productions' };

export default function VideoPage({ params }) {
  return <VideoStudio trackId={params.id} />;
}
