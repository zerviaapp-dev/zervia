import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/server';
import { takeAsync } from '@/lib/rate-limit';
import { getCeoProductFiles, CEO_EMAIL } from '@/lib/ceo-products';

/**
 * CEO one-tap download — zips every file in the product package.
 * OWNER ONLY: owner email or admin role. No payment, CEO bypass.
 * Rate-limited: 10 downloads per user per minute (prevents zip-bomb abuse).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await takeAsync(`ceo-download:${user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  let isCeo = user.email === CEO_EMAIL;
  if (!isCeo) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    isCeo = profile?.role === 'admin';
  }
  if (!isCeo) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const files = await getCeoProductFiles(slug);
  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  const buf = await zip.generateAsync({ type: 'uint8array' });

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="zervia-${slug}.zip"`,
    },
  });
}
