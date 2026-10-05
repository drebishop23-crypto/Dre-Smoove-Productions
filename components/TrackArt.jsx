'use client';
import { onThumbError, thumb } from '@/lib/img';

const GRADIENTS = [
  ['#2ee6d6', '#9d7bff'],
  ['#ff4fa3', '#9d7bff'],
  ['#ffc15e', '#ff4fa3'],
  ['#2ee6d6', '#1f6fff'],
  ['#9d7bff', '#10151e'],
  ['#ff4fa3', '#ffc15e'],
];

function hash(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Album artwork, or a generated gradient cover when none is uploaded.
export default function TrackArt({ track, size = 48, className = '', rounded = 'rounded-lg' }) {
  const style = { width: size, height: size };
  if (track?.artwork_url) {
    return (
      <img
        src={thumb(track.artwork_url, size)}
        onError={(e) => onThumbError(e, track.artwork_url)}
        alt=""
        loading="lazy"
        decoding="async"
        style={style}
        className={`shrink-0 object-cover ${rounded} ${className}`}
      />
    );
  }
  const [a, b] = GRADIENTS[hash(track?.id || track?.title) % GRADIENTS.length];
  const letters = (track?.title || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div
      style={{ ...style, background: `radial-gradient(circle at 30% 25%, ${a}, ${b} 70%, #07090e)` }}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${rounded} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-[18%] rounded-full border border-white/20" />
      <div className="absolute h-[14%] w-[14%] rounded-full bg-ink-950/80" />
      <span
        className="relative font-display font-bold text-white/90 drop-shadow"
        style={{ fontSize: Math.max(9, size * 0.22) }}
      >
        {size >= 40 ? letters : ''}
      </span>
    </div>
  );
}
