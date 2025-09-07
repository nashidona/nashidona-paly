// pages/api/download.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { track_id } = req.body || {}
  if (!track_id || !/^\d+$/.test(String(track_id))) return res.status(400).json({ error: 'bad track_id' })

  try {
    await supabase.rpc('track_download', { tid: track_id })
    return res.json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
}
