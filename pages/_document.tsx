
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html dir="rtl" lang="ar">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
