import { navigate } from './nav';

export default function Link({ href, children, onClick, ...rest }) {
  return (
    <a
      href={`#${href.replace(/^\//, '')}`}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
