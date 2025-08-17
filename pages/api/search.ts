import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit  = Math.min(parseInt(String(req.query.limit ?? '60')) || 60, 1000);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);

    // الصفحة
    const { data: rows, error: err1 } = await supabase.rpc('global_search', {
      q,
      limit_n: limit,   // ← مهم
      offset_n: offset, // ← مهم
    });
    if (err1) throw err1;

    // العدّ
    const { data: totalArr, error: err2 } = await supabase.rpc('global_search_count', { q });
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

    res.status(200).json({ count, items });
  } catch (err: any) {
    res.status(200).json({ count: 0, items: [], error: err?.message || String(err) });
  }
}
