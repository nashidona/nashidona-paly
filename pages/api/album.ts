import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ info: '', error: 'method_not_allowed' });
    }

    const title = typeof req.query.title === 'string' ? req.query.title.trim().slice(0, 160) : '';
    if (!title) return res.status(400).json({ error: 'missing title' });

    let { data, error } = await supabase.from('albums').select('info').eq('title', title).maybeSingle();
    if (!data || error) {
      const r = await supabase.from('albums').select('info').ilike('title', title).maybeSingle();
      data = r.data; error = r.error;
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');
    if (error) return res.status(200).json({ info: '', error: error.message });
    res.status(200).json({ info: data?.info || '' });
  } catch (err: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ info: '', error: err?.message || String(err) });
  }
}
