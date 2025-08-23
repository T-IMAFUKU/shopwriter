export const metadata = {
  title: "ShopWriter",
  description: "ShopWriter",
};

import Providers from "./providers";
import "../styles/globals.css";  // ← styles 配下を参照

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
