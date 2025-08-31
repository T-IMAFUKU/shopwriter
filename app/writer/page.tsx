"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

type GenResp = {
  output?: string
  checks?: string
  variants?: string[]
  [k: string]: any
}

export default function WriterPage() {
  const { toast } = useToast()
  const [productName, setProductName] = useState("")
  const [audience, setAudience] = useState("")
  const [loading, setLoading] = useState(false)

  const [out, setOut] = useState<string>("")
  const [checks, setChecks] = useState<string>("")
  const [vars, setVars] = useState<string[]>([])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setOut(""); setChecks(""); setVars([])

    try {
      const res = await fetch("/api/writer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, audience }),
      })

      if (!res.ok) throw new Error(await res.text())

      const data: GenResp = await res.json()
      setOut(data.output ?? JSON.stringify(data, null, 2))
      setChecks(
        data.checks ??
          "（サンプル）禁止表現なし。薬機法に抵触する表現は検出されませんでした。"
      )
      setVars(data.variants ?? ["A案：短め訴求", "B案：丁寧説明", "C案：SNS向け"])

      toast({ title: "生成完了", description: "文章が生成されました。" })
    } catch {
      // フォールバック（API未実装でもUI動作確認できる）
      setOut(`（サンプル）${productName || "商品"}を「${audience || "想定読者"}」向けに紹介する文章です。`)
      setChecks("（サンプル）NG表現なし。根拠表現の提示が必要な箇所はありません。")
      setVars(["A案（短文）", "B案（通常）", "C案（SNS向け）"])
      toast({ title: "生成API未接続", description: "UIは正常です。API実装後に再試行してください。", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setProductName(""); setAudience(""); setOut(""); setChecks(""); setVars([])
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <Card>
        <CardHeader><CardTitle>文章生成フォーム</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">商品名</label>
              <Input placeholder="例）ShopWriter（AIライティング支援）"
                     value={productName}
                     onChange={(e) => setProductName(e.target.value)}
                     required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">想定読者</label>
              <Textarea placeholder="例）中小ECの担当者。短時間で販促テキストを量産したいユーザー。"
                        rows={4}
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        required />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>{loading ? "生成中…" : "生成する"}</Button>
              <Button type="button" variant="secondary" onClick={handleClear}>クリア</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>結果</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="output" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="output">出力</TabsTrigger>
              <TabsTrigger value="checks">法令/品質チェック</TabsTrigger>
              <TabsTrigger value="vars">バリエーション</TabsTrigger>
            </TabsList>

            <TabsContent value="output" className="pt-4">
              {out ? <pre className="whitespace-pre-wrap rounded-xl border p-4">{out}</pre>
                   : <p className="text-sm text-muted-foreground">まだ出力はありません。</p>}
            </TabsContent>
            <TabsContent value="checks" className="pt-4">
              {checks ? <pre className="whitespace-pre-wrap rounded-xl border p-4">{checks}</pre>
                      : <p className="text-sm text-muted-foreground">チェック結果はありません。</p>}
            </TabsContent>
            <TabsContent value="vars" className="pt-4">
              {vars.length ? (
                <ul className="list-disc pl-6 space-y-1">{vars.map((v, i) => <li key={i}>{v}</li>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">バリエーションはありません。</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
