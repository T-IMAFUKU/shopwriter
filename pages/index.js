import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>ShopWriter</title>
      </Head>
      <main style={{ padding: '2rem' }}>
        <h1>ShopWriterへようこそ！</h1>
        <p>商品説明やSNSコピーを自動生成するAIサービスです。</p>
      </main>
    </>
  );
}