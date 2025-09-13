// tools/envcheck.js
const out = {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  HAS_DB: !!process.env.DATABASE_URL,
  HAS_OPENAI: !!process.env.OPENAI_API_KEY,
  HAS_GH: !!(process.env.GITHUB_ID && process.env.GITHUB_SECRET),
  BYPASS: process.env.SHARE_DEV_BYPASS_TOKEN,
};
console.log(JSON.stringify(out, null, 2));
