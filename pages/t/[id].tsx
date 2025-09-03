// pages/t/[id].tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';

type Track = {
  id: number;
  title: string;
  album?: string | null;
  artist?: string | null;
  year?: string | null;
  cover_url?: string | null;
  lyrics?: string | null;
};

interface Props { tr: Track | null; site: string; }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = String(ctx.params?.id || '').trim();
  if (!/^\d+$/.test(id)) return { notFound: true };

  // 👈 استخدم هوست الطلب (ينفع مع Cloudflare/الدومين المخصص)
  const proto =
    (ctx.req.headers['x-forwarded-proto'] as string) ||
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  const host = ctx.req.headers.host || '';
  const site = `${proto}://${host}`;

  try {
    const r = await fetch(`${site}/api/track?id=${id}&full=1`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) return { notFound: true };
    const js = await r.json();
    const tr: Track | null = js?.item ?? null;
    if (!tr) return { notFound: true };
    return { props: { tr, site } };
  } catch {
    return { notFound: true };
  }
};


export default function SharePage({ tr, site }: Props) {
  if (!tr) return null;

  const url = `${site}/t/${tr.id}`;
const baseName = [tr.title, tr.artist].filter(Boolean).join(' - ');


  const titleParts = [tr.title];
  if (tr.artist) titleParts.push(tr.artist);
  if (tr.album) titleParts.push(`من ألبوم «${tr.album}»`);
  const fullTitle = titleParts.join(' — ');

  const desc: string[] = [];
  if (tr.year) desc.push(`السنة: ${tr.year}`);
  desc.push('استمع الآن عبر نشيدُنا');
  const lyr = (tr.lyrics || '').replace(/\s+/g, ' ').slice(0, 180);
  const description = [desc.join(' • '), lyr ? `\n«${lyr}…»` : ''].join(' ').trim();

  const image = tr.cover_url && tr.cover_url.trim() ? tr.cover_url : `${site}/logo.png`;

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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicRecording',
              name: tr.title,
              byArtist: tr.artist || undefined,
              inAlbum: tr.album || undefined,
              datePublished: tr.year || undefined,
              image,
              url,
            }),
          }}
        />
      </Head>

      <main style={{maxWidth: 720, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Tahoma'}}>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <img src={image} width={96} height={96}
               style={{borderRadius:12, objectFit: image.endsWith('/logo.png') ? 'contain' : 'cover', background:'#f3f4f6', padding: image.endsWith('/logo.png') ? 8 : 0}}
               alt=""/>
          <div>
            <h1 style={{margin:'4px 0 6px', fontSize: '20px'}}>{tr.title}</h1>
            <div style={{color:'#065f46'}}>
              {tr.artist ? <span>{tr.artist}</span> : null}
              {tr.album ? <><span> • </span><span>الألبوم: {tr.album}</span></> : null}
              {tr.year ? <><span> • </span><span>{tr.year}</span></> : null}
            </div>
            <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
             <a
  href={`/api/d/${tr.id}/${encodeURIComponent(baseName)}.mp3`}
  className="btn"
  rel="noopener"
  target="_blank"
>
  ⬇ تنزيل
</a>
              <button className="btn" onClick={() => {
                if (navigator.share) navigator.share({ title: tr.title, text: 'نشيدُنا', url }).catch(()=>{});
                else { navigator.clipboard?.writeText(url); alert('تم نسخ الرابط'); }
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
  );
}
