// pages/api/album.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const titleRaw = req.query.title;
    const idRaw = req.query.id;

    if (!titleRaw && !idRaw) {
      return res.status(400).json({ error: 'pass ?title=... or ?id=...' });
    }

    let q = supabase.from('albums').select('id,title,info').limit(1);

    if (idRaw) {
      const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
      q = q.eq('id', Number(id));
    } else {
      const title = Array.isArray(titleRaw) ? titleRaw[0] : titleRaw;
      q = q.eq('title', title);
    }

    const { data, error } = await q.single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ info: (data?.info ?? '') as string, id: data?.id, title: data?.title });
  } catch (e:any) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
