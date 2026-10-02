import { useSyncExternalStore } from 'react';

let path = '/studio';
const subs = new Set();
export function navigate(to) {
  path = to;
  subs.forEach((f) => f());
  try { document.querySelector('main')?.scrollTo?.(0, 0); window.scrollTo(0, 0); } catch {}
}
export function usePathname() {
  return useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => path);
}
export function useRouter() {
  return { push: navigate, replace: navigate };
}
export function redirect(to) { navigate(to); }
