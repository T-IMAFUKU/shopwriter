// lib/shareStore.ts
// 開発用のメモリ共有ストア
// ※ Vercel等のServerless環境では再起動時にリセットされるため、本番ではDB管理を推奨

const _store = new Set<string>();

export const shareStore = {
  add(id: string) {
    _store.add(id);
  },
  has(id: string) {
    return _store.has(id);
  },
};
