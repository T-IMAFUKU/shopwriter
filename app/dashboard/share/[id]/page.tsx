import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import ShareCard from "@/components/share/ShareCard"
import { Button } from "@/components/ui/button"

type Share = {
  id: string
  title: string
  description?: string
  status?: "public" | "private" | "draft"
  createdAt?: string
  updatedAt?: string
}

export default async function ShareDetailPage({ params }: { params: { id: string } }) {
  const item: Share = {
    id: params.id,
    title: "共有の詳細",
    description: "この画面は共有アイテムのプレビューです。",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            ダッシュボードへ戻る
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">共有の詳細</h1>
      </div>

      <div className="max-w-3xl">
        <ShareCard {...item} variant="card" />
      </div>
    </div>
  )
}