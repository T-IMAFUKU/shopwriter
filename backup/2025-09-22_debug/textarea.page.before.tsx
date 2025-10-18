export default function Page() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Debug: Textarea（最小安全版）</h1>
      <textarea className="mt-4 w-full rounded-md border p-2 text-sm" rows={5} defaultValue="" />
    </main>
  );
}

