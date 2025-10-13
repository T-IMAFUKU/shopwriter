import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

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
          position: "relative",
          background: "#F7FAFF",
          color: "#0F1D2F",
          padding: "64px 64px",
          boxSizing: "border-box",
        }}
      >
        {/* 背景装飾（子なし） */}
        <div
          style={{
            display: "block",
            position: "absolute",
            top: 40,
            right: 40,
            width: 220,
            height: 220,
            borderRadius: 28,
            background: "#EEF3FB",
            boxShadow: "inset 0 14px 80px rgba(59,130,246,0.22)",
          }}
        />
        <div
          style={{
            display: "block",
            position: "absolute",
            top: 76,
            right: 68,
            width: 200,
            height: 160,
            borderRadius: 20,
            background: "rgba(255,255,255,0.6)",
            boxShadow: "0 10px 30px rgba(15,29,47,0.06)",
          }}
        />
        <div
          style={{
            display: "block",
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 24,
            height: 120,
            borderRadius: 18,
            background: "#EFF3F9",
            boxShadow: "inset 0 10px 50px rgba(59,130,246,0.12)",
          }}
        />

        {/* レイアウト */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            gap: 28,
            width: "100%",
            height: "100%",
          }}
        >
          {/* 左テキスト */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              gap: 24,
              width: 740,
            }}
          >
            {/* ブランド行 */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: "#E8EFFF",
                  color: "#1E3A8A",
                  fontSize: 18,
                  fontWeight: 700 as any,
                }}
              >
                2
              </div>
              <div
                style={{
                  display: "flex",
                  width: 140,
                  height: 18,
                  borderRadius: 6,
                  background: "#1E3A8A",
                }}
              />
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 24,
                  fontWeight: 700 as any,
                  color: "#1E3A8A",
                }}
              >
                ShopWriter
              </span>
            </div>

            {/* 見出し：<br> をやめ、2行の span に分割 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  display: "flex",
                  fontSize: 56,
                  lineHeight: 1.18,
                  fontWeight: 800 as any,
                  letterSpacing: "-0.5px",
                }}
              >
                AIが設計する、
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: 56,
                  lineHeight: 1.18,
                  fontWeight: 800 as any,
                  letterSpacing: "-0.5px",
                }}
              >
                あなたの商品の魅力と言葉。
              </span>
            </div>

            {/* サブコピー（テキストのみ＝子1つなので blockでもOKだが、念のためflex） */}
            <div
              style={{
                display: "flex",
                fontSize: 22,
                lineHeight: 1.6,
                color: "#2A3A4E",
              }}
            >
              質問に答えるだけで、読みやすく伝わる文章に。販売ページ・プロダクト説明・ニュースレターに最適。日本語SEOにも配慮した設計。
            </div>
          </div>

          {/* 右の装飾カード */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 380,
                height: 220,
                borderRadius: 20,
                background: "rgba(255,255,255,0.7)",
                boxShadow: "0 18px 40px rgba(15,29,47,0.10)",
                padding: 20,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 120,
                    height: 14,
                    borderRadius: 7,
                    background: "#D9E3F5",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    width: 220,
                    height: 12,
                    borderRadius: 6,
                    background: "#E5EDF9",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    width: 160,
                    height: 12,
                    borderRadius: 6,
                    background: "#E5EDF9",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    width: 280,
                    height: 12,
                    borderRadius: 6,
                    background: "#E5EDF9",
                    marginTop: 6,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
