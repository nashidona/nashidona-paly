import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { createClient } from '@supabase/supabase-js'

// صفحة مشاركة أنشودة مع وسم OG/Twitter جاهز للمنصات الاجتماعية
// URL: https://play.nashidona.net/t/[id]
// لا تلمس أي ملفات قديمة — هذا ملف جديد فقط.

// Types
interface Track {
  id: number
  title: string
  album?: string | null
  artist?: string | null
  artist_text?: string | null
  year?: string | null
  cover_url?: string | null
  lyrics?: string | null
}

interface Props { tr: Track | null }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  try {
    const id = String(ctx.params?.id || '').trim()
    if (!id || !/^[0-9]+$/.test(id)) return { notFound: true }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

    // نجلب أقل قدر ممكن من الحقول
    const { data, error } = await supabase
      .from('tracks')
      .select('id,title,album:albums(title,year,cover_url),artist,artist_text,year,cover_url,lyrics')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { notFound: true }

    // نبسّط الحقول (album قد تكون علاقة)
    const albumTitle = (data as any).album?.title ?? null
    const albumYear  = (data as any).album?.year ?? data.year ?? null
    const albumCover = (data as any).album?.cover_url ?? data.cover_url ?? null

    const tr: Track = {
      id: Number(id),
      title: data.title || `نشيد رقم ${id}`,
      album: albumTitle,
      year: albumYear,
      artist: data.artist || null,
      artist_text: data.artist_text || null,
      cover_url: albumCover,
      lyrics: data.lyrics || null,
    }

    return { props: { tr } }
  } catch {
    return { notFound: true }
  }
}

export default function SharePage({ tr }: Props) {
  if (!tr) return null

  const site = 'https://play.nashidona.net'
  const url  = `${site}/t/${tr.id}`

  const titleBits = [tr.title]
  if (tr.artist || tr.artist_text) titleBits.push(String(tr.artist || tr.artist_text))
  if (tr.album) titleBits.push(`من ألبوم «${tr.album}»`)
  const fullTitle = titleBits.join(' — ')

  const descParts: string[] = []
  if (tr.year) descParts.push(`السنة: ${tr.year}`)
  descParts.push('استمع الآن عبر نشيدُنا')

  // مقتطف كلمات (إن وُجدت) لتغذية og:description
  const lyr = (tr.lyrics || '').replace(/\s+/g, ' ').slice(0, 180)
  const description = [descParts.join(' • '), lyr ? `\n«${lyr}…»` : ''].join(' ').trim()

  // صورة المشاركة: غلاف الألبوم أو الشعار
  const image = tr.cover_url && tr.cover_url.trim() ? tr.cover_url : `${site}/logo.png`

  // اسم ملف مقترح عند التحميل (يمكن استخدامه لاحقًا مع /api/download)
  const baseName = [tr.title, tr.artist || tr.artist_text].filter(Boolean).join(' - ')

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />

        {/* Open Graph */}
        <meta property="og:type" content="music.song" />
        <meta property="og:site_name" content="نشيدُنا" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />

        {/* Structured Data */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'MusicRecording',
          name: tr.title,
          byArtist: tr.artist || tr.artist_text || undefined,
          inAlbum: tr.album || undefined,
          datePublished: tr.year || undefined,
          image,
          url,
        }) }} />
      </Head>

      <main style={{maxWidth: 720, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Tahoma'}}>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <img src={image} width={96} height={96} style={{borderRadius:12, objectFit: image.endsWith('/logo.png') ? 'contain' : 'cover', background: '#f3f4f6', padding: image.endsWith('/logo.png') ? 8 : 0}} alt=""/>
          <div>
            <h1 style={{margin:'4px 0 6px', fontSize: '20px'}}>{tr.title}</h1>
            <div style={{color:'#065f46'}}>
              {(tr.artist || tr.artist_text) ? <span>{tr.artist || tr.artist_text}</span> : null}
              {tr.album ? <><span> • </span><span>الألبوم: {tr.album}</span></> : null}
              {tr.year ? <><span> • </span><span>{tr.year}</span></> : null}
            </div>
            <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
              <a href={`/api/stream/${tr.id}`} className="btn">▶ تشغيل</a>
              {/* مبدئياً نكتفي بالتحميل المباشر من الـ CDN بدون تغيير الاسم */}
              <a href={`https://media.nashidona.net/file/nashidona/tracks/${tr.id}.mp3?download`} className="btn" rel="noopener" target="_blank">⬇ تنزيل</a>
              <button className="btn" onClick={() => {
                const shareUrl = url
                if (navigator.share) navigator.share({ title: fullTitle, text: 'نشيدُنا', url: shareUrl }).catch(()=>{})
                else { navigator.clipboard?.writeText(shareUrl); alert('تم نسخ الرابط'); }
              }}>🔗 مشاركة</button>
            </div>
          </div>
        </div>
        {tr.lyrics && <pre style={{whiteSpace:'pre-wrap', lineHeight:1.7, marginTop:16, background:'#fff', padding:12, border:'1px solid #e5e7eb', borderRadius:12}}> {tr.lyrics}</pre>}
      </main>

      <style jsx>{`
        .btn { padding: 8px 10px; border: 1px solid #d1fae5; border-radius: 8px; background:#fff; }
        .btn:hover { background:#f0fdf4; }
      `}</style>
    </>
  )
}
