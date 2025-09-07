// pages/api/play-start.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // لازم service key
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { track_id, fp } = req.body || {}
  if (!track_id || !/^\d+$/.test(String(track_id))) return res.status(400).json({ error: 'bad track_id' })

  try {
    // زيادة clicks بواحد
    const { error } = await supabase
      .from('tracks')
      .update({ clicks: supabase.rpc('increment', { x: 'clicks' }) }) // أو نكتبها يدوي
      .eq('id', track_id)

    if (error) throw error
    return res.json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
}
