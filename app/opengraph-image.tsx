import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

/**
 * ShopWriter OGP画像（ブランド統一版）
 *
 * 目的:
 * - どこでシェアされても「ShopWriterのあのアイコン」が一発でわかること
 * - キャッチコピーも明示し、プロダクト価値を伝えること
 *
 * 実装メモ:
 * - Edge runtime の ImageResponse / @vercel/og は
 *   <img src="/foo.png"> のような相対パスを直接使えない。
 *   そのため public 内の画像を fetch して base64 DataURL に変換し、
 *   <img src="data:..."> で埋め込んでいる。
 *
 * - origin は NEXT_PUBLIC_SITE_URL（本番）を優先し、
 *   なければローカル http://localhost:3000 を使う。
 */

export default async function OpenGraphImage() {
  const W = size.width;
  const H = size.height;

  // 1. どこから public を取るか決める
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // 2. /public/logo-icon.png を取得して base64 にする
  //    ※ 今回はアイコン単体でブランド統一する
  const logoRes = await fetch(`${origin}/logo-icon.png`);
  const logoArrayBuffer = await logoRes.arrayBuffer();
  const logoBase64 = Buffer.from(logoArrayBuffer).toString("base64");
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          background: "#ffffff",
          color: "#0F1D2F",
          padding: "64px 64px",
          boxSizing: "border-box",
          fontFamily:
            '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans JP", system-ui, sans-serif',
        }}
      >
        {/* LEFT: ブランドアイコン（今回の正式アイコン） */}
        <div
          style={{
            display: "flex",
            width: 360,
            height: 360,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            borderRadius: 24,
            background:
              // もとの淡い放射グラデを、ブランド側（濃紺→バイオレット）寄りに若干強調
              "radial-gradient(circle at 30% 30%, rgba(15,29,47,0.10) 0%, rgba(106,31,191,0.00) 70%)",
            boxShadow: "0 24px 48px rgba(15,29,47,0.12)",
          }}
        >
          {/* data URL として埋め込み */}
          <img
            src={logoDataUrl}
            alt="ShopWriter"
            width={320}
            height={320}
            style={{
              objectFit: "contain",
              width: 320,
              height: 320,
              borderRadius: 32,
            }}
          />
        </div>

        {/* RIGHT: テキストコピー */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 48,
            maxWidth: 640,
            gap: 24,
          }}
        >
          {/* プロダクト名 */}
          <div
            style={{
              fontSize: 32,
              fontWeight: 700 as any,
              color: "#0A1F61", // ブランド濃紺
              lineHeight: 1.2,
            }}
          >
            ShopWriter
          </div>

          {/* キャッチコピー */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 48,
              lineHeight: 1.2,
              fontWeight: 800 as any,
              letterSpacing: "-0.03em",
              color: "#0F1D2F",
            }}
          >
            <span>AIが設計する、</span>
            <span>あなたの商品の魅力と言葉。</span>
          </div>

          {/* サブコピー */}
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.5,
              color: "#2A3A4E",
              fontWeight: 400 as any,
              letterSpacing: "-0.02em",
              maxWidth: 600,
            }}
          >
            質問に答えるだけで、商品の魅力が伝わるプロ品質の文章を作成。
            販売ページ・プロダクト説明・ニュースレターに最適。
            日本語SEOにも配慮した設計です。
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
