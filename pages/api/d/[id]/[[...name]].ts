import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim();

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'bad_id' });
    }

    // تحويل مباشر إلى Cloudflare / Backblaze
    // مهم: لا نعمل fetch للملف من داخل Vercel حتى لا يستهلك Fast Origin Transfer
    const cdnUrl = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.redirect(302, cdnUrl);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
}
