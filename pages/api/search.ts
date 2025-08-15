import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function extractArtist(s?: string): string {
  if (!s) return '';
  const m1 = s.match(/(?:أداء|المنشد|إنشاد|انشاد)\s+([^،\-\(\)\|\n\r]+?)(?:\s*[–—\-|]|$)/);
  if (m1?.[1]) return m1[1].trim();
  const m2 = s.match(/\(([^)]+)\)/);
  return m2?.[1]?.trim() || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(parseInt(String(req.query.limit ?? '60')) || 60, 1000);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);

    let query = supabase
      .from('tracks')
      .select('id,title,source_url,go_url,year,album_id,albums:album_id(title,cover_url,info)', { count: 'exact' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (q) {
      const like = `%${q}%`;
      query = query.or(`title.ilike.${like},year.ilike.${like},albums.title.ilike.${like}`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const filtered = (data ?? []).filter((r: any) => {
      const t = (r.title || '');
      const src = (r.source_url || '').toLowerCase();
      const isArchive = /\.(zip|rar|7z|tar|gz|bz2)(\?.*)?$/.test(src);
      const hasTahmil = /تحميل/.test(t);
      return !isArchive && !hasTahmil;
    });

    const items = filtered.map((r: any) => {
      const albumTitle = r.albums?.title || '';
      const albumInfo  = r.albums?.info  || '';
      const artist     = extractArtist(albumInfo) || extractArtist(albumTitle);
      return {
        id: r.id,
        title: r.title || `بدون عنوان #${r.id}`,
        album: albumTitle,
        artist,
        cover_url: r.albums?.cover_url || '',
        year: r.year || '',
        url: r.go_url || `https://nashidona.net/go/?download=song&id=${r.id}`
      };
    });

    res.status(200).json({ count, items });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
}
