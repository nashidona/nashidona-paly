import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

export const config = {
  api: { responseLimit: false, bodyParser: false }, // ✅ ستريم بدون حدود حجم
};

// اسم ملف أنيق وآمن
function buildFilename(title: string, artist?: string | null) {
  const base = [title, artist].filter(Boolean).join(' - ');
  const cleaned = base
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return (cleaned || `nashid-${Date.now()}`) + '.mp3';
}

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL as string) || (process.env.SUPABASE_URL as string);
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string) ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
  if (!url || !key) throw new Error('Supabase env missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim();
    if (!/^\d+$/.test(id)) return res.status(400).json({ ok: false, error: 'bad_id' });

    // 1) اسم الملف: من المسار إن وُجد، وإلا من الداتابيس
    let filename = '';
    const nameParts = (req.query.name as string[] | undefined) || [];
    if (nameParts.length) {
      filename = decodeURIComponent(nameParts.join('/'))
        .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!/\.(mp3)$/i.test(filename)) filename += '.mp3';
    } else {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('tracks')
          .select('title, artist, artist_text')
          .eq('id', Number(id))
          .maybeSingle();
        const title = data?.title || `نشيد رقم ${id}`;
        const artist = (data?.artist as string) || (data?.artist_text as string) || undefined;
        filename = buildFilename(title, artist);
      } catch {
        filename = `nashid-${id}.mp3`;
      }
    }

    // 2) جلب الملف من B2 (Friendly URL) كستريم
    const b2Url = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;
    const upstream = await fetch(b2Url, {
      method: 'GET',
      headers: { Accept: 'audio/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5' },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ ok: false, error: `upstream_failed_${upstream.status}` });
    }

    // 3) تمهيد الهيدرز الصحيحة للإجبار على التحميل
    const type = upstream.headers.get('content-type') || 'audio/mpeg';
    const len  = upstream.headers.get('content-length');

    res.status(200);
    res.setHeader('Content-Type', type);
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-store');

    // 4) ستريم مباشر دون تخزين
    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { try { res.destroy(); } catch {} });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
}
