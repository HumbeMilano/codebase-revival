import { LoaderCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { widgetDimensions, type DashboardWidget } from "@/lib/dashboard-layout";
import { describeWidget } from "./widget-catalogue";
import type { Member } from "./data";

/** Deliberately accepts no balances, bills, percentages or other financial records. */
export function MaskedFinancialWidget({
  widget,
  member,
  loading = false,
  onUnlock,
}: {
  widget: DashboardWidget;
  member?: Member | undefined;
  loading?: boolean;
  onUnlock?: (() => void) | undefined;
}) {
  const { title, Icon } = describeWidget(widget.id);
  const short = widgetDimensions[widget.size][1] === 1;
  const StatusIcon = loading ? LoaderCircle : Lock;
  return (
    <div
      className={cn("dw-finance-mask", short && "dw-finance-mask-short")}
      data-finance-masked="true"
      aria-busy={loading}
    >
      <header className="dw-header">
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
      </header>
      {member && !short && <span className="dw-finance-mask-member">{member.name}</span>}
      {!short && (
        <span className="dw-finance-mask-value" aria-hidden="true">
          ••••
        </span>
      )}
      <button
        type="button"
        className="dw-finance-reveal"
        disabled={loading || !onUnlock}
        aria-label={`${loading ? "Actualizando" : "Mostrar"} importes de ${title.toLocaleLowerCase("es")}`}
        onClick={onUnlock}
      >
        {short && (
          <span className="dw-finance-mask-dots" aria-hidden="true">
            ••••
          </span>
        )}
        <StatusIcon
          className={cn("size-4 shrink-0", loading && "animate-spin motion-reduce:animate-none")}
          aria-hidden="true"
        />
        <span className={short ? "sr-only" : undefined}>
          {loading ? "Actualizando…" : "Mostrar importes"}
        </span>
      </button>
    </div>
  );
}
