// pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const idRaw = req.query.id;
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'missing id' });
    }

    const supabase = getSupabase();

    const { data: tr, error } = await supabase
      .from('tracks')
      .select('id,title,year,lyrics,album_id,artist_id')
      .eq('id', idNum)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!tr) return res.status(404).json({ error: 'not found' });

    const basic = { lyrics: (tr.lyrics ?? '') as string };

    const wantFull =
      String(req.query.full || '').toLowerCase() === '1' ||
      String(req.query.full || '').toLowerCase() === 'true';

    if (!wantFull) {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');
      return res.status(200).json(basic);
    }

    let albumTitle: string | null = null;
    let albumYear: string | null = tr.year ?? null;
    let albumCover: string | null = null;

    if (tr.album_id) {
      const { data: alb } = await supabase
        .from('albums')
        .select('title, year, cover_url')
        .eq('id', tr.album_id)
        .maybeSingle();
      albumTitle = alb?.title ?? null;
      albumYear = (alb?.year as string | null) ?? (tr.year as string | null) ?? null;
      albumCover = alb?.cover_url ?? null;
    }

    let artistName: string | null = null;
    if (tr.artist_id) {
      const { data: ar } = await supabase
        .from('artists')
        .select('name')
        .eq('id', tr.artist_id)
        .maybeSingle();
      artistName = ar?.name ?? null;
    }

    const item = {
      id: tr.id,
      title: tr.title || `نشيد رقم ${idNum}`,
      year: albumYear,
      cover_url: albumCover,
      album: albumTitle,
      artist: artistName,
      lyrics: (tr.lyrics ?? '') as string,
    };

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({ ...basic, item, ok: true });
  } catch (e: any) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
