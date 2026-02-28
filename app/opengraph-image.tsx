import { ImageResponse } from "next/og";

export const runtime = "edge";

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

/**
 * ShopWriter OGP画像（ブランド統一版）
 *
 * 目的:
 * - どこでシェアされても「ShopWriter」だと一発でわかること
 * - キャッチコピーを明示し、プロダクト価値を伝えること
 *
 * 実装メモ:
 * - build/prerender で落ちないことを最優先にするため、
 *   public 画像の fetch/base64 変換は使わない（環境依存が強い）。
 * - 代わりにモノグラム（SW）をブランドブロックとして固定表示する。
 */

export default async function OpenGraphImage() {
  const W = size.width;
  const H = size.height;

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
        {/* LEFT: ブランドブロック（画像取得なしのモノグラム固定） */}
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
              "radial-gradient(circle at 30% 30%, rgba(15,29,47,0.10) 0%, rgba(106,31,191,0.00) 70%)",
            boxShadow: "0 24px 48px rgba(15,29,47,0.12)",
          }}
        >
          <div
            style={{
              width: 320,
              height: 320,
              borderRadius: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10,31,97,0.06)",
              color: "#0A1F61",
              fontSize: 96,
              fontWeight: 900 as any,
              letterSpacing: "-0.04em",
            }}
          >
            SW
          </div>
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
              color: "#0A1F61",
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