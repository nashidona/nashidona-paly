// pages/api/download/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// نستخدم Service Role إن وُجد، وإلا Anon (نفس أسلوب /api/track)
function getSupabase() {
  const url =
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.SUPABASE_URL as string | undefined);

  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);

  if (!url || !key) {
    throw new Error(
      'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// تنظيف الاسم ليلائم أنظمة الملفات والرؤوس
function buildFilename(title: string, artist?: string | null) {
  const base = [title, artist].filter(Boolean).join(' - ');
  const cleaned = base
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ') // محارف ممنوعة
    .replace(/\s+/g, ' ')               // مسافات متتالية
    .trim()
    .slice(0, 120);
  return (cleaned || `nashid-${Date.now()}`) + '.mp3';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '').trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ ok: false, error: 'bad_id' });

  // اسم افتراضي
  let title = `نشيد رقم ${id}`;
  let artist: string | undefined;

  // نجلب العنوان/المنشد (اختياري؛ لو فشل الاستعلام منمشي بالافتراضي)
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('tracks')
      .select('title, artist, artist_text')
      .eq('id', Number(id))
      .maybeSingle();
    if (data) {
      title = data.title || title;
      artist = (data as any).artist || (data as any).artist_text || undefined;
    }
  } catch {
    // تجاهُل الخطأ؛ نكمل بالاسم الافتراضي
  }

  const filename = buildFilename(title, artist);

  // B2 (Friendly URL) يدعم ?download= لتعيين اسم الملف في Content-Disposition
  const target = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3?download=${encodeURIComponent(filename)}`;

  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: target });
  res.end();
}
