// tests/preload-env.cjs
// 目的: Vitest 実行の前に .env.test.local -> .env.local を確実に読み込む（Node --require で強制）
// 依存: 追加パッケージ不要（fs でシンプル実装）

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return false;
  const raw = fs.readFileSync(p, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
  return true;
}

// 読み順: .env.test.local -> .env.local
const loadedTest = loadEnvFile('.env.test.local');
const loadedLocal = loadedTest ? false : loadEnvFile('.env.local');

// デバッグ出力（秘匿のため先頭のみ）
const head = (process.env.OPENAI_API_KEY || '').slice(0, 12);
const len = (process.env.OPENAI_API_KEY || '').length;
const src = loadedTest ? '.env.test.local' : loadedLocal ? '.env.local' : '(none)';
console.log(`[preload-env] src=${src} OPENAI_HEAD=${head}... LEN=${len}`);
