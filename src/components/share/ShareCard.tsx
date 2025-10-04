import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShareCardProps = {
  id?: string;
  title?: string;
  description?: string;
  status?: "Public" | "Draft";
  createdAtISO?: string;
  updatedAtISO?: string;
  className?: string;
  children?: React.ReactNode;
  onCopy?: () => void;
  onShare?: () => void;
};

const ShareCardBase: React.FC<ShareCardProps> = ({
  id,
  title = "Share",
  description = "共有カード（プレースホルダー）",
  status = "Draft",
  createdAtISO,
  updatedAtISO,
  className,
  children,
  onCopy,
  onShare,
}) => {
  return (
    <Card
      className={cn(className)}
      style={{ borderRadius: "var(--ui-radius-lg)" }}
    >
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent
        className="text-sm"
        style={{ rowGap: "var(--spacing-3)", display: "flex", flexDirection: "column" }}
      >
        {id ? <p className="text-muted-foreground">ID: {id}</p> : null}
        <p className="text-muted-foreground">Status: {status}</p>
        {createdAtISO ? <p className="text-muted-foreground">作成: {createdAtISO}</p> : null}
        {updatedAtISO ? <p className="text-muted-foreground">更新: {updatedAtISO}</p> : null}
        {children ?? (
          <p className="text-muted-foreground">本実装は後続ステップで置換します。</p>
        )}
      </CardContent>
      <CardFooter style={{ gap: "var(--spacing-2)" }}>
        {onCopy ? (
          <Button type="button" variant="secondary" onClick={onCopy}>
            コピー
          </Button>
        ) : null}
        {onShare ? (
          <Button type="button" onClick={onShare}>
            共有
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export { ShareCardBase as ShareCard };
export default ShareCardBase;
