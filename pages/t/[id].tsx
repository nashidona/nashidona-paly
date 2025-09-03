import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { createClient } from '@supabase/supabase-js'

type Track = {
  id: number
  title: string
  artist?: string | null
  artist_text?: string | null
  year?: string | null
  cover_url?: string | null
  lyrics?: string | null
}

interface Props { tr: Track | null }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const idStr = String(ctx.params?.id || '').trim()
  if (!/^\d+$/.test(idStr)) return { notFound: true }
  const id = Number(idStr)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined

  // نحاول أولًا عبر Supabase ANON (قراءة فقط)
  if (supabaseUrl && anonKey) {
    try {
      const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
      const { data, error } = await supabase
        .from('tracks')
        // نبقيها بسيطة: بدون join
        .select('id,title,artist,artist_text,year,cover_url,lyrics')
        .eq('id', id)
        .maybeSingle()

      if (!error && data) {
        const tr: Track = {
          id,
          title: data.title || `نشيد رقم ${id}`,
          artist: data.artist ?? null,
          artist_text: data.artist_text ?? null,
          year: data.year ?? null,
          cover_url: data.cover_url ?? null,
          lyrics: data.lyrics ?? null,
        }
        return { props: { tr } }
      }
    } catch { /* نكمل للفال‌باك */ }
  }

  // فال‌باك: نقرأ من API الداخلي /api/track (يعمل عندك)
  try {
    const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host
    const proto = (ctx.req.headers['x-forwarded-proto'] as string) || 'https'
    const base = `${proto}://${host}`
    const r = await fetch(`${base}/api/track?id=${id}`, { headers: { 'accept': 'application/json' } })
    if (r.ok) {
      const j = await r.json()
      if (j && (j.id || j.title)) {
        const tr: Track = {
          id,
          title: j.title || `نشيد رقم ${id}`,
          artist: j.artist || j.artist_text || null,
          artist_text: j.artist_text || null,
          year: j.year || null,
          cover_url: j.cover_url || null,
          lyrics: j.lyrics || null,
        }
        return { props: { tr } }
      }
    }
  } catch { /* تجاهل ونرجع notFound */ }

  return { notFound: true }
}

export default function SharePage({ tr }: Props) {
  if (!tr) return null

  const site = 'https://play.nashidona.net'
  const url  = `${site}/t/${tr.id}`

  const who  = tr.artist || tr.artist_text || ''
  const fullTitle = [tr.title, who].filter(Boolean).join(' — ')

  const descBits: string[] = []
  if (tr.year) descBits.push(`السنة: ${tr.year}`)
  descBits.push('استمع الآن عبر نشيدُنا')
  const lyr = (tr.lyrics || '').replace(/\s+/g, ' ').slice(0, 180)
  const description = [descBits.join(' • '), lyr ? `\n«${lyr}…»` : ''].join(' ').trim()

  const image = tr.cover_url && tr.cover_url.trim() ? tr.cover_url : `${site}/logo.png`

  return (
    <>
      <Head>
        <title>{fullTitle || `نشيد رقم ${tr.id}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />

        {/* Open Graph */}
        <meta property="og:type" content="music.song" />
        <meta property="og:site_name" content="نشيدُنا" />
        <meta property="og:title" content={fullTitle || `نشيد رقم ${tr.id}`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={fullTitle || `نشيد رقم ${tr.id}`} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicRecording',
              name: tr.title,
              byArtist: who || undefined,
              image,
              url,
              datePublished: tr.year || undefined,
            }),
          }}
        />
      </Head>

      <main style={{maxWidth: 720, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Tahoma'}}>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <img
            src={image}
            width={96}
            height={96}
            style={{borderRadius:12, objectFit: image.endsWith('/logo.png') ? 'contain' : 'cover', background:'#f3f4f6', padding: image.endsWith('/logo.png') ? 8 : 0}}
            alt=""
          />
          <div>
            <h1 style={{margin:'4px 0 6px', fontSize: 20}}>{tr.title}</h1>
            <div style={{color:'#065f46'}}>
              {who ? <span>{who}</span> : null}
              {tr.year ? <><span> • </span><span>{tr.year}</span></> : null}
            </div>
            <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
              <a href={`/api/stream/${tr.id}`} className="btn">▶ تشغيل</a>
              <a href={`https://media.nashidona.net/file/nashidona/tracks/${tr.id}.mp3?download`} className="btn" rel="noopener" target="_blank">⬇ تنزيل</a>
              <button className="btn" onClick={() => {
                const shareUrl = url
                if (navigator.share) navigator.share({ title: tr.title, text: 'نشيدُنا', url: shareUrl }).catch(()=>{})
                else { navigator.clipboard?.writeText(shareUrl); alert('تم نسخ الرابط'); }
              }}>🔗 مشاركة</button>
            </div>
          </div>
        </div>
        {tr.lyrics && (
          <pre style={{whiteSpace:'pre-wrap', lineHeight:1.7, marginTop:16, background:'#fff', padding:12, border:'1px solid #e5e7eb', borderRadius:12}}>
            {tr.lyrics}
          </pre>
        )}
      </main>

      <style jsx>{`
        .btn { padding: 8px 10px; border: 1px solid #d1fae5; border-radius: 8px; background:#fff; }
        .btn:hover { background:#f0fdf4; }
      `}</style>
    </>
  )
}
