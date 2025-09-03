// pages/t/[id].tsx
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function T() {
  const { id } = useRouter().query;
  return (
    <>
      <Head><title>{id ? `مشاركة ${id}` : '...'}</title></Head>
      <main style={{padding:20, fontFamily:'system-ui'}}>
        ✅ Route works — ID: {String(id || '')}
      </main>
    </>
  );
}
