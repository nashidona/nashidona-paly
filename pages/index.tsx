// pages/api/album.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const title = (req.query.title || '').toString().trim();
    if (!title) { res.status(200).json({ info: '' }); return; }

    const { data, error } = await supabase
      .from('albums')
      .select('info')
      .eq('title', title)
      .limit(1)
      .maybeSingle();

    if (error) { res.status(200).json({ info: '' }); return; }
    res.status(200).json({ info: (data?.info || '') });
  } catch {
    res.status(200).json({ info: '' });
  }
}
