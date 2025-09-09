// pages/api/d/[id]/[[...name]].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// فلترة سريعة للبوتات (لا نعدّها)
function isBot(ua: string) {
  return /(bot|spider|crawl|facebookexternalhit|twitterbot|whatsapp|telegram|google|bing|slurp|duckduck|duckduckgo|preview|embed|vkshare|linkedinbot)/i
    .test(ua || '');
}

// فك ترميز آمن لاسم الملف (كي لا ينهار decodeURIComponent → 500)
function safeDecode(s: string) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Content-Disposition مع دعم UTF-8 وفق RFC 5987 + تنقية محارف غير صالحة
function contentDispositionUtf8(filenameBase: string) {
  const safe = (filenameBase || 'track')
    .replace(/[\/\\:*?"<>|]+/g, '')   // إزالة محارف محظورة على ويندوز/ماك
    .replace(/\s+/g, ' ')             // تبسيط الفراغات
    .trim() || 'track';
  return `attachment; filename="${safe}.mp3"; filename*=UTF-8''${encodeURIComponent(safe)}.mp3`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // نسمح GET و HEAD فقط
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // تحقق من id
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).send('bad id');

  // اسم الملف الاختياري من المسار
  const tail = Array.isArray(req.query.name) ? req.query.name.join('/') : String(req.query.name || '');
  const rawBase = safeDecode(tail.replace(/\.mp3$/i, ''));
  const baseName = rawBase || `nashidona-${id}`;

  // جلب cdn_url إن وجد، وإلا استخدم المسار الافتراضي
  let cdn = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('tracks').select('cdn_url').eq('id', id).single();
      if (!error && data?.cdn_url) cdn = data.cdn_url;
    } catch (e) {
      // نتجاهل ونستخدم الافتراضي بدون كسر التحميل
      console.error('fetch cdn_url error:', e);
    }
  }

  // ديباونس العدّاد بالكوكي: 10 دقائق لكل تراك
  const ua = String(req.headers['user-agent'] || '');
  const ckName = `nddl_${id}`;
  const hasCookie = (req.headers.cookie || '').includes(`${ckName}=1`);

  if (!isBot(ua) && supabase && !hasCookie) {
    try {
      const { error } = await supabase.rpc('increment_downloads', { p_track_id: id });
      if (error) console.error('increment_downloads error:', error);
    } catch (e) {
      console.error('increment_downloads exception:', e);
    }
  }

  // اضبط الكوكي (حتى لو كانت HEAD) — يمنع تكرار العدّ السريع
  res.setHeader('Set-Cookie', `${ckName}=1; Max-Age=${10 * 60}; Path=/; SameSite=Lax; HttpOnly`);

  // ترويسة اسم الملف + النوع
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', contentDispositionUtf8(baseName));

  // التحويل المباشر للـ CDN
  res.statusCode = 302;
  res.setHeader('Location', cdn);
  res.end();
}
