// pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = req.query.id;
    if (!id) { res.status(400).json({ error: 'missing id' }); return; }

    const { data, error } = await supabase
      .from('tracks')
      .select('id,title,lyrics')
      .eq('id', Number(id))
      .limit(1)
      .maybeSingle();

    if (error) { res.status(500).json({ error: String(error.message || error) }); return; }
    if (!data) { res.status(404).json({ error: 'not found' }); return; }

    res.status(200).json({ id: data.id, title: data.title, lyrics: data.lyrics || '' });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
