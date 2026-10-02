// Builds a single-file interactive preview of the real UI components,
// wired to an in-memory mock backend. Output: preview/dist/smoove-preview.html
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (p) => path.join(root, p);

const alias = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: r('preview/mock-api.js') }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: r('preview/shims/link.jsx') }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: r('preview/shims/nav.js') }));
    b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: r('preview/shims/jsx-runtime.js') }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: r('preview/shims/react.js') }));
    b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({ path: r('preview/shims/react-dom.js') }));
    b.onResolve({ filter: /^@\// }, async (args) => {
      const res = await b.resolve('./' + args.path.slice(2), { resolveDir: root, kind: args.kind });
      return res;
    });
  },
};

const out = await build({
  entryPoints: [r('preview/entry.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  target: 'es2020',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [alias],
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

mkdirSync(r('preview/dist'), { recursive: true });
execSync(`npx tailwindcss -c tailwind.config.js -i app/globals.css -o preview/dist/preview.css --minify`, { cwd: root, stdio: 'inherit' });
const css = readFileSync(r('preview/dist/preview.css'), 'utf8');

const html = `<title>Dré Smoove Productions</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: sidebar + main column + docked player. Single committed dark look. */
:root{--font-display:'Unbounded';--font-body:'Figtree';--font-mono:'JetBrains Mono';--bg:#07090e;color-scheme:dark}
${css}
#boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#07090e;color:#98a3b8;font:500 12px/1.4 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
#boot i{display:flex;gap:4px;height:22px;align-items:center}
#boot b{width:4px;height:22px;border-radius:2px;background:#2ee6d6;animation:pulsebar 1s ease-in-out infinite}
#boot b:nth-child(2){animation-delay:.12s;background:#9d7bff}#boot b:nth-child(3){animation-delay:.24s;background:#ff4fa3}
</style>
<div id="boot"><i><b></b><b></b><b></b></i>Pressing sample tracks</div>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
writeFileSync(r('preview/dist/smoove-preview.html'), html);
console.log('Wrote preview/dist/smoove-preview.html', (html.length / 1024).toFixed(0) + ' KB');
