import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '60')) || 60, 120);

    // كم عنصر عندنا إجمالاً؟
    const { data: totalArr, error: cErr } = await supabase.rpc('global_search_count', { q: '' });
    if (cErr) throw cErr;
    const total =
      Array.isArray(totalArr)
        ? (totalArr[0]?.count ?? totalArr[0]?.total ?? 0)
        : (totalArr as any)?.count ?? 0;

    const maxStart = Math.max(total - limit, 0);
    const offset = maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;

    const { data: rows, error } = await supabase.rpc('global_search', {
      q: '',
      limit_n: limit,
      offset_n: offset,
    });
    if (error) throw error;

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

    res.status(200).json({ items });
  } catch (err: any) {
    res.status(200).json({ items: [], error: err?.message || String(err) });
  }
}
