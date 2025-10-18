"use client"

import * as React from "react"
import Link from "next/link"
import { PlusCircle } from "lucide-react"
import ShareCard from "@/components/share/ShareCard"
import { Button } from "@/components/ui/button"

// 仮のデータ型
type Share = {
  id: string
  title: string
  description?: string
  status?: "public" | "private" | "draft"
  createdAt?: string
  updatedAt?: string
}

// ダッシュボードページ
export default function DashboardPage() {
  // ダミーデータ（本来はAPI呼び出しなど）
  const [shares] = React.useState<Share[]>([
    {
      id: "demo-1",
      title: "サンプル共有1",
      description: "これはサンプル説明です",
      status: "public",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "demo-2",
      title: "サンプル共有2",
      description: "別の説明文",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Button asChild>
          <Link href="/writer">
            <PlusCircle className="mr-2 h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {shares.map((s) => (
          <ShareCard key={s.id} {...s} />
        ))}
      </div>
    </div>
  )
}


