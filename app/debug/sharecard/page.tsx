"use client"

import * as React from "react"
import ShareCard from "@/components/share/ShareCard"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type Share = {
  id: string
  title: string
  description?: string
  status?: "public" | "private" | "draft"
  createdAt?: string
  updatedAt?: string
}

export default function DebugShareCardPage() {
  const [item, setItem] = React.useState<Share>({
    id: "dbg_0001",
    title: "繝・ヰ繝・げ逕ｨ繧ｿ繧､繝医Ν",
    description: "ShareCard 縺ｮ隕九◆逶ｮ繝ｻ謫堺ｽ懊ｒ讀懆ｨｼ縺吶ｋ繝壹・繧ｸ縺ｧ縺吶・,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const onRegenerate = async (id: string) => {
    await new Promise((r) => setTimeout(r, 200))
    setItem((prev: Share) => ({
      ...(prev ?? { id }),
      title: "逕滓・蠕後ち繧､繝医Ν",
      updatedAt: new Date().toISOString(),
    }))
    toast.success("蜀咲函謌舌′螳御ｺ・＠縺ｾ縺励◆")
  }

  const onDelete = async (id: string) => {
    await new Promise((r) => setTimeout(r, 200))
    toast.success(`蜑企勁: ${id}`)
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Debug / ShareCard</h1>

      <div className="flex gap-3">
        <Button
          size="sm"
          onClick={() =>
            setItem((prev: Share) => ({
              ...(prev ?? { id: "dbg_0001", title: "蛻晄悄繧ｿ繧､繝医Ν" }),
              title: "謇句虚譖ｴ譁ｰ繧ｿ繧､繝医Ν",
              updatedAt: new Date().toISOString(),
            }))
          }
        >
          繧ｿ繧､繝医Ν譖ｴ譁ｰ
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setItem((prev: Share) => ({
              ...(prev ?? { id: "dbg_0001", title: "蛻晄悄繧ｿ繧､繝医Ν" }),
              status: prev?.status === "public" ? "private" : "public",
              updatedAt: new Date().toISOString(),
            }))
          }
        >
          蜈ｬ髢・髱槫・髢・蛻・崛
        </Button>
      </div>

      <div className="max-w-3xl">
        <ShareCard {...item} variant="card" onRegenerate={onRegenerate} onDelete={onDelete} />
      </div>

      <div>
        <ShareCard {...item} variant="row" onRegenerate={onRegenerate} onDelete={onDelete} />
      </div>
    </div>
  )
}
