// lib/shareStore.ts
// 髢狗匱逕ｨ縺ｮ繝｡繝｢繝ｪ蜈ｱ譛峨せ繝医い
// 窶ｻ Vercel遲峨・Serverless迺ｰ蠅・〒縺ｯ蜀崎ｵｷ蜍墓凾縺ｫ繝ｪ繧ｻ繝・ヨ縺輔ｌ繧九◆繧√∵悽逡ｪ縺ｧ縺ｯDB邂｡逅・ｒ謗ｨ螂ｨ

const _store = new Set<string>();

export const shareStore = {
  add(id: string) {
    _store.add(id);
  },
  has(id: string) {
    return _store.has(id);
  },
};
