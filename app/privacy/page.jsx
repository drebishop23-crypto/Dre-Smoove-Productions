export const metadata = { title: 'Privacy Policy · Dré Smoove Productions' };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 text-[15px] leading-7 text-ink-200">
      <div>
        <div className="label mb-2">Privacy policy</div>
        <h1 className="font-display text-2xl font-extrabold text-gold">Dré Smoove Productions</h1>
        <p className="text-sm text-ink-400">Last updated October 3, 2026</p>
      </div>
      <p>
        Dré Smoove Productions is a personal music studio and library run by Dré Bishop. It is used only by its owner
        to store, create, and publish his own music.
      </p>
      <h2 className="font-display text-lg font-bold text-white">What the app accesses</h2>
      <p>
        When the owner connects a YouTube or SoundCloud account, the app receives permission to upload videos and songs
        to that account and to read the account's name. The sign-in tokens are stored privately on the app's server and
        are used only when the owner chooses to upload.
      </p>
      <h2 className="font-display text-lg font-bold text-white">What the app does not do</h2>
      <p>
        The app does not sell, share, or transfer any account data or Google user data to anyone. It does not read
        viewers' personal information, and it does not use Google data for advertising.
      </p>
      <h2 className="font-display text-lg font-bold text-white">Removing access</h2>
      <p>
        The owner can disconnect any account on the Connections page, which deletes the stored tokens. Google access can
        also be removed at any time at myaccount.google.com/permissions.
      </p>
      <h2 className="font-display text-lg font-bold text-white">Contact</h2>
      <p>Questions about this policy: dre.bishop23@gmail.com</p>
    </article>
  );
}
