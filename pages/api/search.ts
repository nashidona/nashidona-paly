// pages/api/search.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const qRaw = req.query.q;
    const q = typeof qRaw === 'string' ? qRaw.trim() : '';

    const lim = Math.min(
      Number.parseInt(String(req.query.limit ?? '60'), 10) || 60,
      120
    );
    const off = Number.parseInt(String(req.query.offset ?? '0'), 10) || 0;

    // 1) العدّ الإجمالي
    const { data: total, error: cntErr } = await supabase.rpc('global_search_count', {
      q: q || null, // مرّر NULL عندما لا يوجد نص
    });
    if (cntErr) return res.status(500).json({ error: cntErr.message });

    // 2) الصفحة المطلوبة
    const { data: rows, error } = await supabase.rpc('global_search', {
      q: q || null,
      limit: lim,
      offset: off,
    });
    if (error) return res.status(500).json({ error: error.message });

    // 3) تهيئة الحقول للواجهة
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
      has_lyrics: !!(r.lyrics && String(r.lyrics).trim().length),
    }));

    return res.status(200).json({ items, count: Number(total || 0) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
