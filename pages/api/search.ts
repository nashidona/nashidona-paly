// pages/api/search.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function parseBool(v: unknown, fallback: boolean) {
  const s = String(v ?? '').toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ count: 0, items: [], error: 'method_not_allowed' });
    }

    const q = String(req.query.q ?? '').trim().slice(0, 80);

    // حماية من البوتات: لا نسمح بطلب 1000 نتيجة من طلب واحد.
    const rawLimit = parseInt(String(req.query.limit ?? '60'), 10) || 60;
    const limit = Math.min(Math.max(rawLimit, 1), 60);

    // حماية من scraping عميق جداً. زِد الرقم لاحقاً إذا احتجت.
    const rawOffset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
    const offset = Math.min(Math.max(rawOffset, 0), 3000);

    const exclude_kids = parseBool(req.query.exclude_kids, true);

    const { data: rows, error: err1 } = await supabase.rpc('global_search', {
      q,
      limit_n: limit,
      offset_n: offset,
      exclude_kids,
    });
    if (err1) throw err1;

    const { data: totalArr, error: err2 } = await supabase.rpc('global_search_count', { q, exclude_kids });
    if (err2) throw err2;

    const count =
      Array.isArray(totalArr)
        ? (totalArr[0]?.count ?? totalArr[0]?.total ?? 0)
        : (totalArr as any)?.count ?? 0;

    const items = (rows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      album: r.album,
      artist: r.artist,
      artist_text: r.artist_text,
      class_parent: r.class_parent,
      class_child: r.class_child,
      cover_url: r.cover_url,
      year: r.year,
      has_lyrics: !!(r.lyrics && String(r.lyrics).trim()),
    }));

    // يقلل الضغط على Vercel/Supabase للبحث المتكرر والبوتات العادية.
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ count, items });
  } catch (err: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ count: 0, items: [], error: err?.message || String(err) });
  }
}
