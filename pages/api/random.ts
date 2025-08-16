
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '60')) || 60, 200);
    const { data, error } = await supabase.rpc('random_tracks', { limit_n: limit });
    if (error) throw error;
    res.status(200).json({ items: data || [] });
  } catch (err: any) {
    res.status(200).json({ items: [], error: err?.message || String(err) });
  }
}
