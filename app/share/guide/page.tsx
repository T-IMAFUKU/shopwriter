"use client";

// app/share/guide/page.tsx
import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TabKey = "viewer" | "creator";

export const dynamic = "force-static";

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
        "border",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-soft"
          : "bg-background text-foreground border-border hover:bg-muted",
      ].join(" ")}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function KickerPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

function BulletOk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1 inline-flex size-5 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700">
        ✓
      </span>
      <span className="text-sm text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

function BulletNo({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1 inline-flex size-5 items-center justify-center rounded-full bg-rose-600/10 text-rose-700">
        ×
      </span>
      <span className="text-sm text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

function StepRow({
  n,
  title,
  desc,
}: {
  n: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
        {n}
      </div>
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function FAQItem({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border bg-background px-4 py-3">
      <summary className="cursor-pointer list-none select-none font-medium outline-none">
        <div className="flex items-center justify-between gap-3">
          <span>{title}</span>
          <span className="text-muted-foreground transition group-open:rotate-45">＋</span>
        </div>
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </details>
  );
}

export default function ShareGuidePage() {
  const [tab, setTab] = React.useState<TabKey>("viewer");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* Hero */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <KickerPill>共有の使い方</KickerPill>
          <KickerPill>60秒で要点</KickerPill>
          <KickerPill>閲覧者優先</KickerPill>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          共有リンクの見方・作り方
        </h1>

        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          このページはまず「共有リンクを受け取った人（閲覧者）」向けのガイドです。
          共有を作る手順は、下のタブでまとめて確認できます。
        </p>

        {/* 60秒要点 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <SmallLabel>まずこれだけ</SmallLabel>
              <CardTitle className="text-base">リンクを開けば読めます</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              共有リンクは、URLを知っている人に文章を見せるためのページです。基本は「読むだけ」でOKです。
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SmallLabel>よくある誤解</SmallLabel>
              <CardTitle className="text-base">編集や公開切替はできません</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              公開/非公開の切り替えや本文の編集は、作成者（ログインしている人）だけができます。
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SmallLabel>開けないとき</SmallLabel>
              <CardTitle className="text-base">作成者に確認</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              URLの貼り間違い、または非公開の可能性があります。作成者に「再送」か「公開設定の確認」をお願いしてください。
            </CardContent>
          </Card>
        </div>
      </header>

      {/* Tabs */}
      <section className="mt-10 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton active={tab === "viewer"} onClick={() => setTab("viewer")}>
            閲覧する人（受け取った人）
          </TabButton>
          <TabButton active={tab === "creator"} onClick={() => setTab("creator")}>
            作成する人（共有する側）
          </TabButton>
        </div>

        {tab === "viewer" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">このリンクでできること / できないこと</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="font-medium">できること</div>
                  <ul className="space-y-2">
                    <BulletOk>共有された文章を読む</BulletOk>
                    <BulletOk>必要に応じてコピーして利用する（作成者の意図に沿ってご利用ください）</BulletOk>
                  </ul>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">できないこと</div>
                  <ul className="space-y-2">
                    <BulletNo>共有の公開/非公開を変更する</BulletNo>
                    <BulletNo>共有の内容を編集する</BulletNo>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">見られない/おかしいときのチェック</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StepRow
                  n={1}
                  title="URLが合っているか"
                  desc="末尾までコピーできているか確認（途中で改行や欠けがあると開けません）。"
                />
                <StepRow
                  n={2}
                  title="公開設定の可能性"
                  desc="作成者が「非公開」にしていると開けません。作成者に確認してください。"
                />
                <StepRow
                  n={3}
                  title="内容が古い"
                  desc="更新後に再共有していない可能性があります。最新URLの再送をお願いしてください。"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">次にやること</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  作成者に「最新URLの再送」または「公開設定の確認」をお願いするのが最短です。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary">
                    <Link href="/writer">Writerに戻る</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/dashboard/share">共有一覧へ</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">最短3ステップ（作成者）</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-3">
                <div className="rounded-lg border bg-background p-4">
                  <SmallLabel>STEP 1</SmallLabel>
                  <div className="mt-1 font-medium">Writerで文章を作る</div>
                  <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    文章を作成し、必要なら整えてから共有の素材にします。
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <SmallLabel>STEP 2</SmallLabel>
                  <div className="mt-1 font-medium">共有を作成して公開設定</div>
                  <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    共有を作成し、公開/非公開を設定します（あとから変更できます）。
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <SmallLabel>STEP 3</SmallLabel>
                  <div className="mt-1 font-medium">URLをコピーして送る</div>
                  <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    URLを相手に送れば完了です。開けない場合はURL欠けや公開設定を確認します。
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">運用のコツ（迷わせない）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                <ul className="list-inside list-disc space-y-2">
                  <li>相手には「このリンクは読むだけでOK」と一言添える</li>
                  <li>公開/非公開を切り替えたら、相手に開けるか確認してもらう</li>
                  <li>内容を更新したら、最新URLを再送する</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">共有の管理へ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  共有の作成・公開/非公開の切り替えは、ダッシュボード内の「共有一覧」から行えます（ログインが必要です）。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary">
                    <Link href="/writer">Writerに戻る</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/dashboard/share">共有一覧へ</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="mt-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">よくある困りごと</h2>
          <span className="text-xs text-muted-foreground">クリックで展開</span>
        </div>

        <div className="grid gap-2">
          <FAQItem title="共有ページが開けない">
            URLが間違っているか、作成者が「非公開」にしている可能性があります。
            作成者に「再送」または「公開設定の確認」をお願いしてください。
          </FAQItem>
          <FAQItem title="404 が出る">
            URLの貼り間違い（末尾が欠けている/途中で改行）が多いです。まずはURLを再送してもらうのが最短です。
          </FAQItem>
          <FAQItem title="内容が古い気がする">
            作成者が更新後に再共有していない可能性があります。最新の共有URLを送ってもらってください。
          </FAQItem>
        </div>
      </section>
    </main>
  );
}
