import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'missing title' });

  // جرّب تطابق دقيق أولاً
  let { data, error } = await supabase.from('albums').select('info').eq('title', title).maybeSingle();
  if (!data || error) {
    // ثم تقريبي كاحتياط
    const r = await supabase.from('albums').select('info').ilike('title', title).maybeSingle();
    data = r.data; error = r.error;
  }

  if (error) return res.status(200).json({ info: '', error: error.message });
  res.status(200).json({ info: data?.info || '' });
}
