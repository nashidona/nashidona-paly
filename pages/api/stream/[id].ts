// pages/api/stream/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

// تعطيل حدّ حجم الاستجابة حتى لا يقطع الستريم لملفات MP3 كبيرة
export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// نطبّق ترميز URL لكل "مقطع" في المسار حتى لو كان فيه عربي/مسافات
function encodePathSegments(u: string): string {
  try {
    const url = new URL(u);
    const segs = url.pathname.split('/').map(s => {
      try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); }
    });
    // نحافظ على الـ "/" بين المقاطع
    url.pathname = segs.join('/');
    return url.toString();
  } catch {
    return u;
  }
}

function isProbablyAudio(resp: Response) {
  const ct = resp.headers.get('content-type') || '';
  // MediaFire أحيانًا يرسل application/octet-stream
  return ct.includes('audio/') || ct.includes('octet-stream') || ct.includes('mpeg');
}

async function fetchWithHeaders(u: string, req: NextApiRequest) {
  const range = req.headers['range'] as string | undefined;
  const ua = (req.headers['user-agent'] as string) || 'Mozilla/5.0';
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Referer': 'https://www.mediafire.com/',
    'Accept': 'audio/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    // نتجنب ضغط المحتوى مع Range
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
  };
  if (range) headers.Range = range;

  return await fetch(u, {
    method: 'GET',
    headers,
    redirect: 'follow',
    // مهم لبعض مضيفي الملفات
    cache: 'no-store',
  });
}

// نمط تصحيح: ?debug=1 يرجّع معلومات بدلاً من الستريم للمساعدة على التشخيص
async function debugProbe(u: string, req: NextApiRequest) {
  const tryUrls = [u, encodePathSegments(u)];
  const out: any[] = [];
  for (const cand of tryUrls) {
    try {
      const r = await fetchWithHeaders(cand, req);
      const ct = r.headers.get('content-type') || '';
      const cl = r.headers.get('content-length') || '';
      out.push({ url: cand, status: r.status, ok: r.ok, contentType: ct, contentLength: cl, isAudio: isProbablyAudio(r) });
      try { r.body?.cancel(); } catch {}
      if (r.ok && isProbablyAudio(r)) break;
    } catch (e: any) {
      out.push({ url: cand, error: String(e?.message || e) });
    }
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

    const { data, error } = await supabase
      .from('tracks')
      .select('source_url')
      .eq('id', id)
      .maybeSingle();

    if (error || !data?.source_url) {
      return res.status(404).json({ ok: false, error: 'track not found' });
    }

    const originalUrl = String(data.source_url);

    // نمط التصحيح: جرّب /api/stream/123?debug=1
    if (String(req.query.debug || '') === '1') {
      const debug = await debugProbe(originalUrl, req);
      res.status(200).json({ ok: true, debug });
      return;
    }

    // نحاول برابطين: الأصلي، ثم مع ترميز مقاطع المسار
    const candidates = [originalUrl, encodePathSegments(originalUrl)];
    let resp: Response | null = null;
    for (const cand of candidates) {
      const r = await fetchWithHeaders(cand, req);
      if (r.ok && r.body && isProbablyAudio(r)) { resp = r; break; }
      // بعض الأحيان يرجّع 200 HTML: نتأكد من نوع المحتوى
      if (r.ok && r.body && (r.headers.get('content-disposition') || '').includes('.mp3')) {
        resp = r; break;
      }
      try { r.body?.cancel(); } catch {}
    }

    if (!resp) {
      // آخر محاولة: نُظهر نتيجة فشل مفصّلة
      const dbg = await debugProbe(originalUrl, req);
      res.status(502).json({ ok: false, error: 'upstream not audio or failed', probe: dbg });
      return;
    }

    // تمكين الهيدرز المهمة
    const passHeaders = [
      'content-type', 'content-length', 'accept-ranges', 'content-range',
      'etag', 'last-modified', 'cache-control', 'content-disposition'
    ];
    for (const h of passHeaders) {
      const v = resp.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // نمرّر كود الحالة كما هو (200/206…)
    res.status(resp.status);

    // بثّ الجسم
    const nodeStream = Readable.fromWeb(resp.body as any);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { try { res.destroy(); } catch {} });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}
