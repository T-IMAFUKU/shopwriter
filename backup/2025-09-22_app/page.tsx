"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ShopWriter</h1>
        <nav className="flex gap-3">
          {/* 竊・縺薙％縺後・繧､繝ｳ繝茨ｼ喞allbackUrl=/writer 繧呈・遉ｺ */}
          <Link
            href="/api/auth/signin?callbackUrl=/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            GitHub縺ｧ繧ｵ繧､繝ｳ繧､繝ｳ
          </Link>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-3xl font-extrabold leading-tight">
          ShopWriter 窶・蝠・刀隱ｬ譏弱ｒ縲∽ｸ迸ｬ縺ｧ縲・        </h2>
        <p className="text-muted-foreground">
          Next.js + Prisma 讒区・縺ｮ繝ｩ繧､繝・ぅ繝ｳ繧ｰ謾ｯ謠ｴSaaS縲ゅヲ繝ｼ繝ｭ繝ｼ・・繧ｫ繝ｼ繝峨・繝医ャ繝励・繝ｼ繧ｸ縺ｧ縺吶・        </p>

        <div className="flex gap-3">
          <Link
            href="/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            辟｡譁吶〒隧ｦ縺・          </Link>
          <Link
            href="/api/auth/signin?callbackUrl=/writer"
            className="px-4 py-2 rounded-md border shadow-sm"
          >
            GitHub縺ｧ繧ｵ繧､繝ｳ繧､繝ｳ
          </Link>
        </div>
      </section>

      {/* 莉･荳九・繝繝溘・UI・井ｻｻ諢擾ｼ・*/}
      <section className="space-y-4">
        <div className="rounded-xl border p-4 space-y-3">
          <label className="block text-sm font-medium">蝠・刀蜷搾ｼ井ｾ具ｼ夐滉ｹｾ繧ｿ繧ｪ繝ｫ・・/label>
          <input className="w-full border rounded-md px-3 py-2" placeholder="ShopWriter" />
          <label className="block text-sm font-medium">諠ｳ螳夊ｪｭ閠・/label>
          <input className="w-full border rounded-md px-3 py-2" placeholder="WEB繝ｦ繝ｼ繧ｶ繝ｼ" />
          <button className="px-4 py-2 rounded-md border shadow-sm">逕滓・縺吶ｋ</button>
        </div>
      </section>
    </main>
  );
}

