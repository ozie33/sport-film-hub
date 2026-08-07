import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border pb-6 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="label-caps text-xs text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="truncate text-3xl font-semibold uppercase sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
