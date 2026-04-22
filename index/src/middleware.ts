import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Normalize /admin/ -> /admin
  if (pathname === '/admin/') {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    url.hash = '';
    return NextResponse.redirect(url);
  }

  // Let Next.js App Router handle /admin and /admin/* normally.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
