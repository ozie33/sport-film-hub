import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="field-grid flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-6 py-14 text-center">
      {icon ? <div className="mb-4 text-primary">{icon}</div> : null}
      <h3 className="text-xl font-semibold uppercase">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
