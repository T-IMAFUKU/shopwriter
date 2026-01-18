// data/updates.ts
// ShopWriter - Updates / Announcements (SSOT: file)
//
// 方針:
// - 更新しやすさ最優先（1件追加＝1オブジェクト追加）
// - ユーザー価値ベースの短文のみ（技術用語は避ける）
// - date は YYYY/MM/DD（表示用）
// - 上に新しいものを積む

export type UpdateItem = {
  date: string;   // YYYY/MM/DD
  title: string;  // 短い見出し
  note?: string;  // 補足（省略可）
};

export const updates: UpdateItem[] = [
  {
    date: "2026/01/18",
    title: "お知らせ欄を追加しました",
    note: "トップページで、更新情報を確認できるようになりました！",
  },
  {
    date: "2026/01/17",
    title: "Stripeの決済不具合を修正しました",
    note: "申し込み〜反映までの流れを見直し、安定して進めるように改善しました。",
  },
  {
    date: "2026/01/12",
    title: "共有機能を実装しました",
    note: "下書きをURLで共有して、レビュー依頼がしやすくなりました。",
  },
];
