import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function extractArtist(s?: string): string {
  if (!s) return '';
  const patterns = [
    /(?:أداء|اداء|المنشد|إنشاد|انشاد)\s*[:：]?\s*([^،\-\(\)\|\n\r]+?)(?:\s*[–—\-|]|$)/,
    /\(([^)]+)\)/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(parseInt(String(req.query.limit ?? '60')) || 60, 1000);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);
    const like = q ? `%${q}%` : undefined;

    let query = supabase
      .from('tracks')
      .select('id,title,source_url,go_url,year,album_id,albums:album_id(title,cover_url,info)', { count: 'exact' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (like) {
      query = query.or(`title.ilike.${like},year.ilike.${like}`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    let rows = (data ?? []).filter((r: any) => {
      const t = (r.title || '');
      const src = (r.source_url || '').toLowerCase();
      const isArchive = /\.(zip|rar|7z|tar|gz|bz2)(\?.*)?$/.test(src);
      const hasTahmil = /تحميل/.test(t);
      return !isArchive && !hasTahmil;
    });

    if (q) {
      const ql = q.toLowerCase();
      rows = rows.filter((r: any) => {
        const albumTitle = (r.albums?.title || '').toLowerCase();
        const artist = (extractArtist(r.albums?.info || '') || extractArtist(r.albums?.title || '')).toLowerCase();
        return albumTitle.includes(ql) || artist.includes(ql) || (r.title||'').toLowerCase().includes(ql) || String(r.year||'').includes(q);
      });
    }

    const items = rows.map((r: any) => ({
      id: r.id,
      title: r.title || `بدون عنوان #${r.id}`,
      album: r.albums?.title || '',
      artist: extractArtist(r.albums?.info || '') || extractArtist(r.albums?.title || ''),
      cover_url: r.albums?.cover_url || '',
      year: r.year || '',
      url: r.go_url || `https://nashidona.net/go/?download=song&id=${r.id}`
    }));

    res.status(200).json({ count, items });
  } catch (err: any) {
    res.status(200).json({ count: 0, items: [], error: err?.message || String(err) });
  }
}
