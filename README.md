# Dré "Smoove" Productions

Private AI music studio and recording vault. Next.js 14 (App Router), Tailwind CSS, Lucide icons, Supabase (database + file storage), Replicate (AI audio).

## What's inside

- `app/studio` — Studio Generator: style/genre tags, sound description, lyrics with section tags, Song (vocals) or Beat (instrumental) mode, live generation queue, latest-take player with waveform, take history, MP3/WAV download.
- `app/library` — The Vault: upload recordings (drag and drop, batch), playlists, artwork, tags, release dates, search, tag filter, sort, play all, shuffle, edit, delete.
- `components/PlayerProvider.jsx` + `PlayerBar.jsx` — one audio player mounted in the root layout, so playback keeps going between pages.
- `app/api/*` — server routes. All secret keys stay on the server.
- `middleware.js` — password gate for the whole site (`APP_PASSWORD`).
- `supabase/schema.sql` — tables, row-level security, private storage buckets.
- `preview/` — builds the single-file interactive preview (real components + mock backend). Run `npm run preview:build`.

## AI models

| Mode | Model on Replicate | Notes |
| --- | --- | --- |
| Song (vocals) | `minimax/music-1.5` | Sings your lyrics. Prompt 10–300 characters (tags + description combined), lyrics 10–600 characters, English or Chinese lyrics. |
| Beat (instrumental) | `meta/musicgen` (stereo-large) | Text to instrumental, 5–30 seconds per take. Lyrics are ignored. |

To try a newer MiniMax model, change `REPLICATE_SONG_MODEL` (for example `minimax/music-2.6`). It uses the same `prompt` and `lyrics` fields.

Finished audio is copied from Replicate into your private Supabase `sp-audio` bucket right away, because Replicate output links expire.

## Setup

1. Unzip the project, open a terminal in the folder, and run `npm install`.
2. In Supabase, open your project, go to SQL Editor, click New query, paste everything from `supabase/schema.sql`, and click Run.
3. In Supabase, open Project Settings, then API Keys. Copy the anon (public) key and the service_role (secret) key. The Project URL is under Project Settings, then Data API.
4. In Replicate, sign in at replicate.com, open your account menu, click API tokens, then create a token. Replicate needs a payment method on file to run these models.
5. Create a file named `.env.local` in the project root and paste the block below with your values filled in.
6. Run `npm run dev` and open http://localhost:3000. The browser asks for a password: type anything as the username and your `APP_PASSWORD` as the password.

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
REPLICATE_API_TOKEN=r8_your_token_here
REPLICATE_SONG_MODEL=minimax/music-1.5
REPLICATE_MUSICGEN_VERSION=671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb
APP_PASSWORD=choose-a-long-password
```

## Deploying to Netlify

In Netlify, add a new site from the repo (build command `npm run build`). Then open Site configuration, click Environment variables, click Add a variable, choose Import from a .env file, paste the same block, and redeploy.

If saving a long finished song ever hits a function time limit, nothing is lost: the Studio keeps polling and the save step safely retries.

## Stable Audio (optional)

Replicate is wired in. To add Stability AI's Stable Audio as a third provider, create a key in the Stability AI platform, add `STABILITY_API_KEY` to your environment, and add a `startStableAudio()` function next to `startInstrumental()` in `lib/replicate.js` that calls their text-to-audio endpoint. Stability returns the audio file directly instead of a job ID, so that path would upload straight to Supabase inside `app/api/generate/route.js`.

## Limits worth knowing

- Supabase free plan caps each file at 50 MB (set on the `sp-audio` bucket in the SQL). WAV masters longer than about 4–5 minutes should be uploaded as MP3 or FLAC.
- Playback links are signed for 12 hours. Refresh the page if a track stops loading after a long session.
- WAV download from an MP3 is converted in the browser (16-bit PCM). It is a lossless container around the MP3's quality, not a higher-quality master.
