// pages/api/stream/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string; // للقراءة بدون مشاكل RLS
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function normalizePathOnce(u: string): string {
  try {
    const url = new URL(u);
    // نفك ترميز الموجود ثم نعيد ترميزه بشكل صحيح (يحافظ على العربية لكن يكتبها %D9%...)
    url.pathname = encodeURI(decodeURI(url.pathname));
    return url.toString();
  } catch {
    return u;
  }
}

async function fetchWithHeaders(u: string, req: NextApiRequest) {
  const range = req.headers['range'] as string | undefined;
  const ua = (req.headers['user-agent'] as string) || 'Mozilla/5.0';
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Referer': 'https://www.mediafire.com/',
    // نتجنب ضغط النقل حتى لا يخلط مع Range
    'Accept-Encoding': 'identity',
  };
  if (range) headers.Range = range;

  return await fetch(u, {
    method: 'GET',
    headers,
    redirect: 'follow',
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) {
      res.status(400).json({ ok: false, error: 'missing id' });
      return;
    }

    // نجلب الرابط الأصلي من قاعدة البيانات
    const { data, error } = await supabase
      .from('tracks')
      .select('source_url')
      .eq('id', id)
      .maybeSingle();

    if (error || !data?.source_url) {
      res.status(404).json({ ok: false, error: 'track not found' });
      return;
    }

    const originalUrl = data.source_url as string;
    const normalizedUrl = normalizePathOnce(originalUrl);

    // محاولة 1: كما هو
    let r = await fetchWithHeaders(originalUrl, req);

    // إذا فشل أو لا يوجد Body، نجرب النسخة المنَسَّقة
    if ((!r.ok || !r.body) && normalizedUrl !== originalUrl) {
      try { r.body?.cancel(); } catch {}
      r = await fetchWithHeaders(normalizedUrl, req);
    }

    // لو ما زال فاشل
    if (!r.ok || !r.body) {
      res.status(r.status || 502).json({ ok: false, error: `upstream ${r.status} ${r.statusText}` });
      return;
    }

    // نمرّر أهم الهيدرز للصوت (مع حماية)
    const passHeaders = [
      'content-type', 'content-length', 'accept-ranges', 'content-range',
      'cache-control', 'etag', 'last-modified', 'content-disposition'
    ];
    for (const h of passHeaders) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    // حالة 206/200 كما upstream
    res.status(r.status);

    // بثّ الجسم إلى الرد
    const nodeStream = Readable.fromWeb(r.body as any);
    nodeStream.pipe(res);
    nodeStream.on('error', () => {
      try { res.destroy(); } catch {}
    });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}
