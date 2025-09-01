// pages/api/stream/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// فحص سريع بالرأس فقط (HEAD) للتأكد من توفر ملف الـCDN
async function headOk(url: string, ms = 2500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

// ترميز كل مقطع من المسار (للتعامل مع العربية/المسافات)
function encodePathSegments(u: string): string {
  try {
    const url = new URL(u);
    url.pathname = url.pathname
      .split('/')
      .map(seg => {
        try { return encodeURIComponent(decodeURIComponent(seg)); }
        catch { return encodeURIComponent(seg); }
      })
      .join('/');
    return url.toString();
  } catch {
    return u;
  }
}

function isMediaFire(u: string) {
  try { return new URL(u).hostname.includes('mediafire.com'); } catch { return false; }
}

function isProbablyAudio(resp: Response) {
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('audio/') || ct.includes('octet-stream') || ct.includes('mpeg');
}

async function fetchWithHeaders(u: string, req: NextApiRequest) {
  const range = req.headers['range'] as string | undefined;
  const ua = (req.headers['user-agent'] as string) || 'Mozilla/5.0';
  const headers: Record<string, string> = {
    'User-Agent': ua,
    // بعض المستضيفين يتطلبون Referer/Origin (خاصة MediaFire)
    'Referer': 'https://www.mediafire.com/',
    'Origin': 'https://www.mediafire.com',
    'Accept': 'audio/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
  };
  if (range) headers.Range = range;

  return await fetch(u, {
    method: 'GET',
    headers,
    redirect: 'follow',
    cache: 'no-store',
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

    const { data, error } = await supabase
      .from('tracks')
      .select('source_url, cdn_url')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ ok: false, error: 'track not found' });
    }

    // 1) تفضيل التحويل إلى الـCDN إذا متوفر ويعمل
    const cdnUrl = (data.cdn_url || '').trim();
    if (cdnUrl && await headOk(cdnUrl)) {
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(302, { Location: cdnUrl });
      res.end();
      return;
    }

    // إن لم يتوفر CDN صالح، نتابع على المنطق الحالي
    const originalUrl = (data.source_url || '').trim();
    if (!originalUrl) {
      return res.status(404).json({ ok: false, error: 'no url available' });
    }
    const encodedUrl = encodePathSegments(originalUrl);

    // 2) MediaFire: إعادة توجيه مباشرة (المتصفح يحمّل بسلاسة)
    if (isMediaFire(originalUrl)) {
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(302, { Location: encodedUrl });
      res.end();
      return;
    }

    // 3) باقي الاستضافات: نحاول ستريم من السيرفر (كما السابق)
    const candidates = [originalUrl, encodedUrl];
    let resp: Response | null = null;
    for (const cand of candidates) {
      const r = await fetchWithHeaders(cand, req);
      if (r.ok && r.body && isProbablyAudio(r)) { resp = r; break; }
      // fallback: أحيانًا يحدّد الاسم في Content-Disposition
      if (r.ok && r.body && (r.headers.get('content-disposition') || '').match(/\.(mp3|m4a|flac|wav)/i)) {
        resp = r; break;
      }
      try { r.body?.cancel(); } catch {}
    }

    if (!resp) {
      return res.status(502).json({ ok: false, error: 'upstream not audio or failed' });
    }

    // تمرير رؤوس مهمة
    const passHeaders = [
      'content-type', 'content-length', 'accept-ranges', 'content-range',
      'etag', 'last-modified', 'cache-control', 'content-disposition'
    ];
    for (const h of passHeaders) {
      const v = resp.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.status(resp.status);

    const nodeStream = Readable.fromWeb(resp.body as any);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { try { res.destroy(); } catch {} });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}
