// pages/t/[id].tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';

// صفحة مشاركة مع OG للبوتات + تحويل البشر للرئيسية للتشغيل الفوري (?play=ID)
// لا تعتمد على مفاتيح Supabase هنا؛ نقرأ من API الداخلي /api/track

type Track = {
  id: number;
  title: string;
  album?: string | null;
  artist?: string | null;
  artist_text?: string | null;
  year?: string | null;
  cover_url?: string | null;
  lyrics?: string | null;
};

interface Props { tr: Track; site: string; }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = String(ctx.params?.id || '').trim();
  if (!/^\d+$/.test(id)) return { notFound: true };

  // نبني الـbase من نفس الطلب (يناسب Cloudflare/Vercel)
  const proto = (ctx.req.headers['x-forwarded-proto'] as string) || (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  const host  = ctx.req.headers.host || '';
  const site  = `${proto}://${host}`;

  // تمييز البوتات (تبقى هنا للـOG) عن البشر (نحوّلهم للرئيسية)
  const ua = String(ctx.req.headers['user-agent'] || '').toLowerCase();
  const isBot = /(bot|facebookexternalhit|twitterbot|whatsapp|telegram|google|bing|slurp|duckduck|linkedinbot|embed|preview|vkshare)/i.test(ua);
  const noRedir = 'noredir' in (ctx.query || {});

  // نجلب بيانات النشيد من API الداخلي
  let tr: Track | null = null;
  try {
    const r = await fetch(`${site}/api/track?id=${id}&full=1`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (r.ok) {
      const js = await r.json();
      tr = js?.item ?? null;
    }
  } catch {}

  if (!tr) return { notFound: true };

  // البشر → تحويل للتشغيل على الرئيسية
  if (!isBot && !noRedir) {
    return { redirect: { destination: `/?play=${id}`, permanent: false } };
  }

  return { props: { tr, site } };
};

export default function SharePage({ tr, site }: Props) {
  const url  = `${site}/t/${tr.id}`;
  const who  = tr.artist || tr.artist_text || '';
  const titleBits = [tr.title];
  if (who) titleBits.push(who);
  if (tr.album) titleBits.push(`من ألبوم «${tr.album}»`);
  const fullTitle = titleBits.join(' — ');

  const descBits: string[] = [];
  if (tr.year) descBits.push(`السنة: ${tr.year}`);
  descBits.push('استمع الآن عبر نشيدُنا');
  const lyr = (tr.lyrics || '').replace(/\s+/g, ' ').slice(0, 180);
  const description = [descBits.join(' • '), lyr ? `\n«${lyr}…»` : ''].join(' ').trim();

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
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicRecording',
              name: tr.title,
              byArtist: who || undefined,
              inAlbum: tr.album || undefined,
              datePublished: tr.year || undefined,
              image,
              url,
            }),
          }}
        />
      </Head>

      {/* محتوى بسيط للـbots (أو عند ?noredir=1) */}
      <main style={{maxWidth: 720, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Tahoma'}}>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <img src={image} width={96} height={96}
               style={{borderRadius:12, objectFit: image.endsWith('/logo.png') ? 'contain' : 'cover', background:'#f3f4f6', padding: image.endsWith('/logo.png') ? 8 : 0}}
               alt="" />
          <div>
            <h1 style={{margin:'4px 0 6px', fontSize: '20px'}}>{tr.title}</h1>
            <div style={{color:'#065f46'}}>
              {who ? <span>{who}</span> : null}
              {tr.album ? <><span> • </span><span>الألبوم: {tr.album}</span></> : null}
              {tr.year ? <><span> • </span><span>{tr.year}</span></> : null}
            </div>
            <div style={{marginTop:10, color:'#6b7280'}}>ستتم إعادة توجيه الزائر إلى المشغّل للتشغيل الفوري.</div>
          </div>
        </div>
        {tr.lyrics && <pre style={{whiteSpace:'pre-wrap', lineHeight:1.7, marginTop:16, background:'#fff', padding:12, border:'1px solid #e5e7eb', borderRadius:12}}> {tr.lyrics}</pre>}
      </main>
    </>
  );
}
