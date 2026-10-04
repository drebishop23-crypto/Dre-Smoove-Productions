'use client';
import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';

const LOOKS = [
  'Smooth late-night R&B, neon city reflections, deep purple and gold',
  'Vintage 90s soul record sleeve, warm film grain, sunset tones',
  'Minimal luxury, black marble and gold leaf, elegant',
  'Brooklyn rooftop at dusk, moody cinematic lighting',
  'Abstract liquid gold and teal waves, glossy, modern',
];

// Square-crop a photo in the browser (centered), up to 3000px, as JPEG. Banners keep their shape.
async function preparePhoto(file, square) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a photo the browser can open. Try a JPG or PNG.'));
      i.src = url;
    });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (square) {
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2;
      sy = (sh - side) / 2;
      sw = sh = side;
    }
    const scale = Math.min(1, 3000 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Album covers: use your own photo as-is, turn your photo into AI covers, or make 4 AI covers from a description.
// target: 'track' (needs trackId) | 'avatar' | 'banner'
export default function CoverGenerator({ initialPrompt = '', target = 'track', trackId, onSaved, onClose }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [images, setImages] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null); // { path, preview }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const pickPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const ready = await preparePhoto(file, target !== 'banner');
      const path = await api.uploadImage(ready);
      setPhoto({ path, preview: URL.createObjectURL(ready) });
      setImages([]);
      setPicked(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const savePhoto = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveCover({ path: photo.path, target, track_id: trackId });
      onSaved?.(res);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!photo && prompt.trim().length < 3) return setError('Describe the cover you want first.');
    setBusy(true);
    setError(null);
    setImages([]);
    setPicked(null);
    try {
      let found = [];
      if (photo) {
        const res = await api.startCovers(prompt, photo.path, target);
        found = res.images || [];
        let pending = res.pending || [];
        for (let tries = 0; pending.length && tries < 40; tries++) {
          await new Promise((r) => setTimeout(r, 1500));
          const polls = await Promise.all(pending.map((id) => api.pollCovers(id).then((p) => ({ id, ...p }))));
          for (const p of polls) if (p.images?.length) found = [...found, ...p.images];
          pending = polls.filter((p) => !p.images?.length && !['failed', 'canceled'].includes(p.status)).map((p) => p.id);
          if (polls.every((p) => p.status === 'failed') && !found.length) throw new Error(polls[0].error || 'The AI could not use that photo.');
        }
      } else {
        let res = await api.startCovers(prompt);
        let tries = 0;
        while (!res.images?.length && !['failed', 'canceled'].includes(res.status) && tries < 30) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await api.pollCovers(res.id);
          tries++;
        }
        if (!res.images?.length) throw new Error(res.error || 'No images came back. Try again.');
        found = res.images;
      }
      if (!found.length) throw new Error('No images came back. Try again.');
      setImages(found);
      setPicked(found[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveCover({ url: picked, target, track_id: trackId });
      onSaved?.(res);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const title = target === 'track' ? 'Album cover' : target === 'banner' ? 'Profile banner' : 'Profile picture';

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          {images.length > 0 && (
            <button type="button" className="btn-ghost" onClick={generate} disabled={busy}>
              <RotateCcw className="h-4 w-4" /> More options
            </button>
          )}
          {images.length > 0 ? (
            <button type="button" className="btn-primary" onClick={save} disabled={!picked || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Use this one
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {photo ? 'Make 2 AI versions of my photo' : 'Generate 4 options'}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
          <div className="label mb-2">Your photo</div>
          {photo ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <img src={photo.preview} alt="Your uploaded photo" className={`${target === 'banner' ? 'h-20 w-auto' : 'h-24 w-24'} rounded-lg object-cover`} />
                <button type="button" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink-700 text-white" aria-label="Remove photo" onClick={() => { setPhoto(null); setImages([]); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" className="btn-primary" onClick={savePhoto} disabled={saving || busy}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Use my photo as is
                </button>
                <span className="text-xs text-ink-400">Or describe a style below and make AI versions of it.</span>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload a photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div>
          <label htmlFor="cover-prompt" className="label mb-2 block">{photo ? 'Style for the AI versions (optional)' : 'Describe the cover'}</label>
          <textarea
            id="cover-prompt"
            rows={3}
            className="field resize-y leading-relaxed"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A couple slow dancing under a single streetlight in the rain, gold and deep blue tones"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LOOKS.map((l) => (
              <button
                key={l}
                type="button"
                className="chip border-ink-700 bg-ink-850 text-ink-300 hover:border-gold/60 hover:text-gold"
                onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()}. ${l}` : l))}
              >
                {l.split(',')[0]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            {photo
              ? 'The AI keeps your face and turns the photo into a finished cover. About 8¢ for both versions.'
              : 'About a penny per set of 4. Text and titles are left off so the cover works on every platform.'}
          </p>
        </div>

        {busy && (
          <div className="grid grid-cols-2 gap-3">
            {(photo ? [0, 1] : [0, 1, 2, 3]).map((i) => (
              <div key={i} className="aspect-square max-w-full animate-pulse rounded-xl bg-ink-800" />
            ))}
          </div>
        )}

        {images.length > 0 && !busy && (
          <div className="grid grid-cols-2 gap-3">
            {images.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setPicked(src)}
                aria-pressed={picked === src}
                className={`relative overflow-hidden rounded-xl ring-2 transition ${picked === src ? 'ring-gold' : 'ring-transparent hover:ring-ink-500'}`}
              >
                <img src={src} alt="" className="aspect-square w-full object-cover" />
                {picked === src && (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-ink-950">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
    </Modal>
  );
}
