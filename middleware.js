import { NextResponse } from 'next/server';

// Password gate for the whole app. Set APP_PASSWORD in your environment.
// The browser shows its built-in login box; any username works.
export function middleware(req) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (given === password) return NextResponse.next();
    } catch {}
  }

  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Dré Smoove Productions", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
