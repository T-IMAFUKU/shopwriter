"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * Dialog 可視化テスト
 * - 制御モード(open/onOpenChange)で確実に開閉
 * - Overlay は components/ui/dialog.tsx 側で「bg-black」「z-[1000]」固定済み
 */
export default function DebugDialogPage() {
  const [open, setOpen] = React.useState(false);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Debug: Dialog Visibility</h1>

      <div className="space-x-2">
        <Button onClick={() => setOpen(true)}>開く（強制）</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">開く（Trigger）</Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>ダイアログ可視化テスト</DialogTitle>
              <DialogDescription>黒幕＋中央表示になっているか確認します。</DialogDescription>
            </DialogHeader>

            <p className="text-sm">
              このダイアログが見え、背景が真っ黒で裏の文字が読めなければ OK です。
            </p>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">閉じる</Button>
              </DialogClose>
              <Button onClick={() => setOpen(false)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

