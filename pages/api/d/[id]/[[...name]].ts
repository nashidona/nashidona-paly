// pages/api/d/[id]/[[...name]].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function isBot(ua: string) {
  return /(bot|spider|crawl|facebookexternalhit|twitterbot|whatsapp|telegram|google|bing|slurp|duckduck|duckduckgo|preview|embed|vkshare)/i.test(ua || '');
}

// اسم ملف آمن عبر RFC5987
function contentDispositionUtf8(filename: string) {
  const safe = filename.replace(/[\/\\:*?"<>|]+/g, '').trim() || 'track';
  return `attachment; filename="${safe}.mp3"; filename*=UTF-8''${encodeURIComponent(safe)}.mp3`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).send('bad id');

    // اسم الملف (اختياري من المسار)
    const tail = Array.isArray(req.query.name) ? req.query.name.join('/') : String(req.query.name || '');
    const rawBase = decodeURIComponent((tail || '').replace(/\.mp3$/i, ''));
    const baseName = rawBase || `nashidona-${id}`;

    // اجلب cdn_url إن وُجد
    let cdn = '';
    const { data, error } = await supabase.from('tracks').select('cdn_url').eq('id', id).single();
    if (!error && data?.cdn_url) cdn = data.cdn_url;

    // fallback إلى المسار القياسي
    if (!cdn) cdn = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;

    // زِد عداد التحميل (تجاهل البوت)
    const ua = String(req.headers['user-agent'] || '');
    if (!isBot(ua)) {
      const { error: incErr } = await supabase.rpc('increment_downloads', { p_track_id: id });
      if (incErr) console.error('increment_downloads error:', incErr);
    }

    // أعد التوجيه مع Content-Disposition باسم عربي صحيح
    res.statusCode = 302;
    res.setHeader('Location', cdn);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', contentDispositionUtf8(baseName));
    res.end();
  } catch (e: any) {
    console.error(e);
    res.status(500).send('server error');
  }
}
