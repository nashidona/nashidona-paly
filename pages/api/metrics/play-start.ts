import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { track_id } = req.body || {}
  if (!track_id) return res.status(400).json({ error: 'track_id required' })

  try {
    const { error } = await supabase.rpc('increment_clicks', { p_track_id: Number(track_id) })
    if (error) throw error
    return res.json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
}
