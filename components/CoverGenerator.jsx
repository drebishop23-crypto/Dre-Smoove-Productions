'use client';
import { useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';

const LOOKS = [
  'Smooth late-night R&B, neon city reflections, deep purple and gold',
  'Vintage 90s soul record sleeve, warm film grain, sunset tones',
  'Minimal luxury, black marble and gold leaf, elegant',
  'Brooklyn rooftop at dusk, moody cinematic lighting',
  'Abstract liquid gold and teal waves, glossy, modern',
];

// Generates 4 AI album covers and saves the one you pick.
// target: 'track' (needs trackId) | 'avatar' | 'banner'
export default function CoverGenerator({ initialPrompt = '', target = 'track', trackId, onSaved, onClose }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [images, setImages] = useState([]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    if (prompt.trim().length < 3) return setError('Describe the cover you want first.');
    setBusy(true);
    setError(null);
    setImages([]);
    setPicked(null);
    try {
      let res = await api.startCovers(prompt);
      let tries = 0;
      while (!res.images?.length && !['failed', 'canceled'].includes(res.status) && tries < 30) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await api.pollCovers(res.id);
        tries++;
      }
      if (!res.images?.length) throw new Error(res.error || 'No images came back. Try again.');
      setImages(res.images);
      setPicked(res.images[0]);
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

  const title = target === 'track' ? 'Generate album cover' : target === 'banner' ? 'Generate profile banner' : 'Generate profile picture';

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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate 4 options
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="cover-prompt" className="label mb-2 block">Describe the cover</label>
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
          <p className="mt-2 text-xs text-ink-500">About a penny per set of 4. Text and titles are left off so the cover works on every platform.</p>
        </div>

        {busy && (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
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
