import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// نفس دالة بناء اسم أنيق وآمن
function buildFilename(title: string, artist?: string | null) {
  const base = [title, artist].filter(Boolean).join(' - ');
  const cleaned = base
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ') // محارف غير مسموحة
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
  const id = String(req.query.id || '').trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ ok: false, error: 'bad_id' });

  // إذا مرّرنا اسم بالمسار، خذه كما هو (مع تنظيف خفيف)
  let prettyFromPath = '';
  const nameParts = (req.query.name as string[] | undefined) || [];
  if (nameParts.length) {
    prettyFromPath = decodeURIComponent(nameParts.join('/'))
      .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/\.(mp3)$/i.test(prettyFromPath)) prettyFromPath += '.mp3';
  }

  // إن لم يُمرّر اسم، نبنيه من الداتابيس (اختياري)
  let filename = prettyFromPath;
  if (!filename) {
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

  const target = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3?download=${encodeURIComponent(filename)}`;
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: target });
  res.end();
}
