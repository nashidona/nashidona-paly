// pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = Number(req.query.id);
    if (!id) { res.status(200).json({ lyrics: '' }); return; }

    const { data, error } = await supabase
      .from('tracks')
      .select('lyrics')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (error) { res.status(200).json({ lyrics: '' }); return; }
    res.status(200).json({ lyrics: (data?.lyrics || '') });
  } catch {
    res.status(200).json({ lyrics: '' });
  }
}
