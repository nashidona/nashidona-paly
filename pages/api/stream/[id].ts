
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    if (!id) { res.status(400).send('missing id'); return; }
    const go = `https://nashidona.net/go/?download=song&id=${id}`;
    const r = await fetch(go, { redirect: 'manual' });
    const loc = r.headers.get('location');
    if (!loc) { res.status(502).send('no redirect from go'); return; }
    res.setHeader('Location', loc);
    res.status(302).end();
  } catch (err: any) {
    res.status(500).send(err?.message || 'stream error');
  }
}
