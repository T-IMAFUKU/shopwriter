"use client"
import { useSession, signIn, signOut } from "next-auth/react"
import Link from "next/link"

export default function DebugSession() {
  const { data, status } = useSession()
  return (
    <div className="p-6 space-y-4">
      <div>status: <b>{status}</b></div>
      <pre className="border rounded-xl p-4 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      <div className="flex gap-3">
        <button onClick={() => signIn("github", { callbackUrl: "/writer" })} className="border px-3 py-1 rounded">Sign in</button>
        <a href="/api/auth/signin" className="border px-3 py-1 rounded">Sign in (link)</a>
        <button onClick={() => signOut()} className="border px-3 py-1 rounded">Sign out</button>
        <Link href="/api/auth/providers" className="underline">providers JSON</Link>
        <Link href="/api/auth/session" className="underline">session JSON</Link>
      </div>
    </div>
  )
}
