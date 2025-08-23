import { AuthButton } from "@/components/AuthButton";

export default function Home() {
  return (
    <main className="min-h-dvh p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ShopWriter</h1>
        <AuthButton />
      </header>

      <section className="space-y-2">
        <p>ここにメインUIを追加していきます。</p>
      </section>
    </main>
  );
}
