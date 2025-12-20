// tools/print-db-target.cjs
// 目的: DATABASE_URL が「どのDB」を向いているかを安全に表示する（パスワードは出さない）
//
// 使い方:
//   node .\tools\print-db-target.cjs
//
// 必須ENV:
//   DATABASE_URL

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return v;
}

function maskUrl(raw) {
  try {
    const u = new URL(raw);
    const user = u.username ? `${u.username}` : "";
    const pass = u.password ? "******" : "";
    const auth = user || pass ? `${user}:${pass}@` : "";
    const host = u.host;
    const db = u.pathname || "";
    const params = u.searchParams;

    // よく見るキーだけ出す（任意）
    const extras = [];
    for (const k of ["sslmode", "pgbouncer", "connection_limit"]) {
      if (params.has(k)) extras.push(`${k}=${params.get(k)}`);
    }

    return {
      protocol: u.protocol.replace(":", ""),
      host,
      db,
      auth: auth ? "(present)" : "(none)",
      extras: extras.length ? extras.join("&") : "(none)",
    };
  } catch {
    return { error: "DATABASE_URL is not a valid URL format" };
  }
}

const raw = mustGetEnv("DATABASE_URL");
console.log(maskUrl(raw));
