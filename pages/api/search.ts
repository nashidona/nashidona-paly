import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(parseInt(String(req.query.limit ?? '200')) || 200, 1000);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);
    let query = supabase.from('tracks').select('id,title,go_url,year,album_id,albums:album_id(title,cover_url)', { count: 'exact' }).order('id',{ascending:true}).range(offset, offset+limit-1);
    if (q) { const like = `%${q}%`; query = query.or(`title.ilike.${like},year.ilike.${like}`); }
    const { data, error, count } = await query; if (error) throw error;
    const items = (data ?? []).map((r: any) => ({ id:r.id, title:r.title||`بدون عنوان #${r.id}`, album:r.albums?.title||'', cover_url:r.albums?.cover_url||'', year:r.year||'', url:r.go_url||`https://nashidona.net/go/?download=song&id=${r.id}` }));
    res.status(200).json({ count, items });
  } catch (err: any) { res.status(500).json({ error: err?.message || String(err) }); }
}