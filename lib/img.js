// Small, fast versions of cover images through Netlify's image CDN.
// Album covers can be several megabytes; a song row only needs a thumbnail.
export function thumb(url, width, height = width) {
  if (!url) return url;
  if (typeof window !== 'undefined' && /^(localhost|127\.)/.test(window.location.hostname)) return url;
  if (!/\.supabase\.co\//.test(url)) return url;
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 2;
  const w = Math.round(width * dpr);
  // height 0 = keep the image's own shape (banners)
  const size = height ? `&w=${w}&h=${Math.round(height * dpr)}&fit=cover` : `&w=${w}`;
  return `/.netlify/images?url=${encodeURIComponent(url)}${size}&fm=webp&q=75`;
}

// If the CDN can't fetch the image, fall back to the original file
export function onThumbError(e, original) {
  if (original && e.currentTarget.src !== original) e.currentTarget.src = original;
}
