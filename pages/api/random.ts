// pages/api/random.ts
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
      return res.status(405).json({ items: [], error: 'method_not_allowed' });
    }

    const rawLimit = parseInt(String(req.query.limit ?? '60'), 10) || 60;
    const limit = Math.min(Math.max(rawLimit, 1), 60);
    const exclude_kids = parseBool(req.query.exclude_kids, true);

    const { data: totalArr, error: cErr } = await supabase.rpc('global_search_count', { q: '', exclude_kids });
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
      exclude_kids,
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

    // عشوائي لكن قابل للكاش مؤقتاً لحماية الخطة المجانية.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({ items });
  } catch (err: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ items: [], error: err?.message || String(err) });
  }
}
