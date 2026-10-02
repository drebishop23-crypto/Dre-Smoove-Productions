const R = window.React;
export const Fragment = R.Fragment;
export function jsx(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  if (Array.isArray(children)) return R.createElement(type, rest, ...children);
  if (children === undefined) return R.createElement(type, rest);
  return R.createElement(type, rest, children);
}
export const jsxs = jsx;
