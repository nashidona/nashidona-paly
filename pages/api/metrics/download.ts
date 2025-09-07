import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end()
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const ua = String(req.headers['user-agent'] || '').toLowerCase()
    const isBot = /(bot|spider|crawler|preview|curl|wget|httpx|uptime|monitor)/.test(ua)
    if (isBot) return res.json({ ok: true, skipped: 'bot' })

const { error } = await supabase.rpc('increment_downloads', { p_track_id: Number(id) });

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'server_error' })
  }
}
