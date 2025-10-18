import { describe, it, expect } from 'vitest';

describe('ENV DUMP', () => {
  it('prints OPENAI key head & length', () => {
    const key = process.env.OPENAI_API_KEY || '';
    console.log('OPENAI_API_KEY_HEAD:', key.slice(0, 12), '... LEN=', key.length);
    expect(key.length).toBeGreaterThan(20); // 最低限チェック
  });
});