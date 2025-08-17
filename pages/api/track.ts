// pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const idRaw = req.query.id;
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ error: 'missing id' });
    }

    const { data, error } = await supabase
      .from('tracks')
      .select('lyrics')
      .eq('id', idNum)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ lyrics: (data?.lyrics ?? '') as string });
  } catch (e:any) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
