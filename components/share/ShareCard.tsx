"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreVertical, ExternalLink, Copy, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export type ShareStatus = "public" | "private" | "draft"

export type ShareCardProps = {
  id: string
  title: string
  description?: string
  status?: ShareStatus
  createdAt?: string | Date
  updatedAt?: string | Date
  variant?: "row" | "card"
  className?: string
  onRegenerate?: (id: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
}

function fmt(dt?: string | Date) {
  if (!dt) return "-"
  const d = typeof dt === "string" ? new Date(dt) : dt
  if (Number.isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function StatusBadge({ status = "draft" }: { status?: ShareStatus }) {
  switch (status) {
    case "public":
      return <Badge>蜈ｬ髢・/Badge>
    case "private":
      return <Badge variant="secondary">髱槫・髢・/Badge>
    default:
      return <Badge variant="outline">荳区嶌縺・/Badge>
  }
}

function buildShareUrl(id: string) {
  if (typeof window === "undefined") return `/share/${id}`
  const base = window.location.origin
  return `${base}/share/${id}`
}

export default function ShareCard({
  id,
  title,
  description,
  status = "draft",
  createdAt,
  updatedAt,
  variant = "row",
  className,
  onRegenerate,
  onDelete,
}: ShareCardProps) {
  const router = useRouter()

  async function handleCopyLink() {
    const url = buildShareUrl(id)
    try {
      await navigator.clipboard.writeText(url)
      toast.success("蜈ｱ譛峨Μ繝ｳ繧ｯ繧偵さ繝斐・縺励∪縺励◆", { description: url })
    } catch {
      toast.error("繧ｳ繝斐・縺ｫ螟ｱ謨励＠縺ｾ縺励◆")
    }
  }

  async function handleRegenerate() {
    try {
      if (onRegenerate) {
        await onRegenerate(id)
        // 隕ｪ縺後ヨ繝ｼ繧ｹ繝医ｒ蜃ｺ縺吝燕謠撰ｼ壹％縺薙〒縺ｯ謌仙粥繝医・繧ｹ繝医＠縺ｪ縺・ｼ磯㍾隍・亟豁｢・・      } else {
        toast.success("逕滓・繧貞・螳溯｡後＠縺ｾ縺励◆")
      }
    } catch {
      toast.error("逕滓・縺ｮ蜀榊ｮ溯｡後↓螟ｱ謨励＠縺ｾ縺励◆")
    }
  }

  async function handleDelete() {
    try {
      if (onDelete) {
        // 隕ｪ縺ｧ縺ｮ繝医・繧ｹ繝郁｡ｨ遉ｺ縺ｫ蟋斐・繧具ｼ磯㍾隍・亟豁｢・・        await onDelete(id)
      } else {
        toast.success("蜑企勁縺励∪縺励◆")
      }
      router.refresh()
    } catch {
      toast.error("蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆")
    }
  }

  const body = (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
        variant === "card" && "flex-col items-stretch",
        className
      )}
    >
      {/* 蟾ｦ蛛ｴ・壹ち繧､繝医Ν/隱ｬ譏・繝｡繧ｿ */}
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", variant === "card" && "flex-col items-start")}>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/share/${id}`} className="truncate font-medium hover:underline">
              {title || "(辟｡鬘・"}
            </Link>
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            菴懈・: {fmt(createdAt)} / 譖ｴ譁ｰ: {fmt(updatedAt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            蜈ｱ譛迂D(API): <span className="font-mono">{id}</span>
          </p>
        </div>
      </div>

      {/* 蜿ｳ蛛ｴ・壹い繧ｯ繧ｷ繝ｧ繝ｳ */}
      <div className={cn("flex items-center gap-2", variant === "card" && "w-full justify-end")}>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/dashboard/share/${id}`} className="inline-flex items-center gap-1">
            <ExternalLink className="h-4 w-4" />
            髢九￥
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="縺昴・莉悶・謫堺ｽ・>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>謫堺ｽ・/DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="mr-2 h-4 w-4" />
              蜈ｱ譛峨Μ繝ｳ繧ｯ繧偵さ繝斐・
              <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              蜀咲函謌・            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* 遐ｴ螢顔噪謫堺ｽ懊・蟶ｸ譎りｵ､・九ワ繧､繝ｩ繧､繝医ｂ襍､ */}
            <DropdownMenuItem
              onClick={handleDelete}
              className={cn(
                "text-destructive",
                "data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
                "focus:text-destructive"
              )}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              蜑企勁
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  if (variant === "card") {
    return <div className="w-full">{body}</div>
  }
  return body
}
