export function Separator({ className = "" }: { className?: string }) {
  return <div className={["shrink-0 bg-border", "h-px w-full", className].join(" ")} />;
}


