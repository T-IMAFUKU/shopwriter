import EventLogChart, { type EventLogChartPoint } from "@/components/dashboard/EventLogChart";
import EventLogTable from "@/components/dashboard/EventLogTable";
import { type EventLog } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Page() {
  // チャート用ダミーデータ（過去7日）
  const chartData: EventLogChartPoint[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return { date: `${y}-${m}-${day}`, count: Math.floor(Math.random() * 10) + 1 };
  });

  // テーブル用（空配列で空状態メッセージを確認）
  const logs = [] as unknown as EventLog[];

  return (
    <main className="container mx-auto py-8 space-y-8">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">UI Tokens Demo</h1>
        <p className="text-sm text-muted-foreground">
          EventLogChart / EventLogTable / DropdownMenu / Dialog の動作とトークン適用をまとめて確認します。
        </p>
      </section>

      {/* Chart */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">EventLogChart</h2>
        <div className="border" style={{ borderRadius: "var(--ui-radius-lg)", padding: "var(--spacing-4)" }}>
          <EventLogChart data={chartData} variant="bar" height={240} />
        </div>
      </section>

      {/* Table */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">EventLogTable</h2>
        <div className="border" style={{ borderRadius: "var(--ui-radius-lg)", padding: "var(--spacing-4)" }}>
          <EventLogTable logs={logs} />
        </div>
      </section>

      {/* Controls: Dropdown & Dialog */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">UI Controls</h2>
        <div className="flex items-center gap-4">
          {/* Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Dropdown を開く</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>メニュー</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>アクション 1</DropdownMenuItem>
              <DropdownMenuItem>アクション 2</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button>Dialog を開く</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ダイアログ見出し</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                これは UI トークン（角丸・影・余白）適用後の Dialog の表示確認です。
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </main>
  );
}
