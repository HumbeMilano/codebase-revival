import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Grip, Maximize2, Minus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  moveDashboardWidget,
  placeDashboardWidget,
  type DashboardLayout,
  type DashboardWidget,
  type WidgetId,
  widgetDimensions,
  WIDGET_SIZES,
  widgetSizeFor,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

type Gesture = {
  id: string;
  pointer: number;
  kind: "move" | "resize";
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  rect: DOMRect;
  original: DashboardLayout;
  activated: boolean;
  over: string;
  timer?: ReturnType<typeof setTimeout>;
  frame?: number;
};
type Props = {
  layout: DashboardLayout;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onChange: (layout: DashboardLayout) => void;
  describe: (id: WidgetId) => { title: string; tone: string };
  onConfigure: (key: string) => void;
  children: (widget: DashboardWidget) => React.ReactNode;
};

/** Native pointer gestures keep the normal page scroll until a deliberate hold.
 * Layout preferences contain only IDs and sizes; gestures never mutate records. */
export function WidgetGrid({
  layout,
  editing,
  disabled,
  onEdit,
  onChange,
  describe,
  children,
  onConfigure,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const props = useRef({ layout, editing, disabled, onEdit, onChange });
  props.current = { layout, editing, disabled, onEdit, onChange };
  const gesture = useRef<Gesture | null>(null);
  const resized = useRef(false);
  const previous = useRef(
    new Map<string, { left: number; top: number; width: number; height: number }>(),
  );
  const [active, setActive] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    const next = new Map<string, { left: number; top: number; width: number; height: number }>();
    root.current?.querySelectorAll<HTMLElement>("[data-grid-widget]").forEach((node) => {
      const id = node.dataset["gridWidget"]!;
      const bounds = node.getBoundingClientRect();
      // Scroll changes viewport coordinates, not the widget's layout position.
      const rect = {
        left: bounds.left + window.scrollX,
        top: bounds.top + window.scrollY,
        width: bounds.width,
        height: bounds.height,
      };
      next.set(id, rect);
      const old = previous.current.get(id);
      if (!old || reduced() || !node.animate || (id === active && gesture.current?.kind === "move"))
        return;
      const x = old.left - rect.left;
      const y = old.top - rect.top;
      if (
        Math.abs(x) +
          Math.abs(y) +
          Math.abs(old.width - rect.width) +
          Math.abs(old.height - rect.height) >
        1
      ) {
        node.animate(
          [
            {
              transformOrigin: "top left",
              transform: `translate(${x}px,${y}px) scale(${old.width / rect.width},${old.height / rect.height})`,
            },
            { transformOrigin: "top left", transform: "none" },
          ],
          {
            duration: 260,
            easing: "cubic-bezier(.2,.8,.2,1)",
          },
        );
      }
    });
    previous.current = next;
  }, [layout, active]);

  useEffect(() => {
    const card = (id: string) =>
      root.current?.querySelector<HTMLElement>(`[data-widget-card="${id}"]`);
    const finish = (cancel = false) => {
      const g = gesture.current;
      if (!g) return;
      if (g.timer) clearTimeout(g.timer);
      if (g.frame) cancelAnimationFrame(g.frame);
      const node = card(g.id);
      if (node) {
        const from = node.getBoundingClientRect();
        node.removeAttribute("style");
        if (g.activated && g.kind === "move" && !cancel && node.animate && !reduced()) {
          const to = node.getBoundingClientRect();
          node.animate(
            [
              {
                transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(1.03)`,
              },
              { transform: "none" },
            ],
            { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
        }
      }
      gesture.current = null;
      resized.current =
        g.kind === "resize" && (cancel || Math.hypot(g.lastX - g.x, g.lastY - g.y) > 10);
      setActive(null);
      if (cancel && g.activated) props.current.onChange(g.original);
      if (g.activated) setAnnouncement(cancel ? "Movimiento cancelado" : "Widget colocado");
    };
    const paint = () => {
      const g = gesture.current;
      if (!g?.activated) return;
      const node = card(g.id);
      if (g.kind === "move" && node) {
        Object.assign(node.style, {
          position: "fixed",
          left: `${g.rect.left}px`,
          top: `${g.rect.top}px`,
          width: `${g.rect.width}px`,
          height: `${g.rect.height}px`,
          zIndex: "60",
          pointerEvents: "none",
          transform: `translate(${g.lastX - g.x}px,${g.lastY - g.y}px) scale(1.03)`,
        });
        // The lifted card has no hit target; the grid beneath determines placement.
        const target = document
          .elementFromPoint(g.lastX, g.lastY)
          ?.closest<HTMLElement>("[data-grid-widget]");
        const id = target?.dataset["gridWidget"] as string | undefined;
        if (id === g.id) g.over = id;
        if (id && id !== g.id && id !== g.over && root.current?.contains(target!)) {
          g.over = id;
          props.current.onChange(placeDashboardWidget(props.current.layout, g.id, id));
          setAnnouncement(
            `Nueva posición de ${describe(props.current.layout.widgets.find((w) => w.key === g.id)?.id ?? "notes").title}`,
          );
        }
        // Scroll the page while moving to the edge, including long dashboards.
        const margin = 70;
        const amount = g.lastY < margin ? -10 : g.lastY > window.innerHeight - margin ? 10 : 0;
        if (amount) window.scrollBy(0, amount);
      } else if (g.kind === "resize") {
        const dx = g.lastX - g.x;
        const dy = g.lastY - g.y;
        const original = g.original.widgets.find((w) => w.key === g.id)!;
        const [cols, rows] = widgetDimensions[original.size];
        const styles = getComputedStyle(root.current!);
        const gap = parseFloat(styles.columnGap) || 0;
        const unit = (root.current!.clientWidth - gap * 2) / 3;
        const row = parseFloat(styles.gridAutoRows) || 120;
        const columns = Math.max(
          1,
          Math.min(3, Math.round((g.rect.width + dx + gap) / (unit + gap))),
        );
        const height = Math.max(
          1,
          Math.min(4, Math.round((g.rect.height + dy + gap) / (row + gap))),
        );
        const size =
          Math.abs(dx) + Math.abs(dy) < 12
            ? original.size
            : widgetSizeFor(columns || cols, height || rows);
        if (props.current.layout.widgets.find((w) => w.key === g.id)?.size !== size)
          props.current.onChange({
            ...props.current.layout,
            widgets: props.current.layout.widgets.map((w) => (w.key === g.id ? { ...w, size } : w)),
          });
      }
      g.frame = requestAnimationFrame(paint);
    };
    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointer) return;
      g.lastX = event.clientX;
      g.lastY = event.clientY;
      if (!g.activated && Math.hypot(g.lastX - g.x, g.lastY - g.y) > 10) finish();
      else if (g.activated) {
        event.preventDefault();
        if (!g.frame) g.frame = requestAnimationFrame(paint);
      }
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId === gesture.current?.pointer) finish(event.type === "pointercancel");
    };
    const touch = (event: TouchEvent) => {
      if (gesture.current?.activated) event.preventDefault();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        finish(true);
      }
    };
    const blur = () => finish(true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", touch, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      const g = gesture.current;
      if (g?.timer) clearTimeout(g.timer);
      if (g?.frame) cancelAnimationFrame(g.frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [describe]);

  const begin = (
    event: React.PointerEvent<HTMLElement>,
    id: string,
    kind: Gesture["kind"] = "move",
  ) => {
    if (disabled || gesture.current || event.button !== 0 || !event.isPrimary) return;
    if (!editing && (event.target as HTMLElement).closest("button,input,textarea,a,select")) return;
    if (
      editing &&
      (event.target as HTMLElement).closest("[data-widget-control]") &&
      !(event.target as HTMLElement).closest("[data-widget-drag]") &&
      kind !== "resize"
    )
      return;
    const rect = event.currentTarget
      .closest<HTMLElement>("[data-grid-widget]")!
      .getBoundingClientRect();
    const g: Gesture = {
      id,
      kind,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      rect,
      original: layout,
      activated: false,
      over: id,
    };
    gesture.current = g;
    resized.current = false;
    const source = event.currentTarget;
    const activate = () => {
      if (gesture.current !== g) return;
      g.activated = true;
      if (g.kind === "resize") source.setPointerCapture?.(g.pointer);
      if (g.kind === "move") {
        const node = root.current?.querySelector<HTMLElement>(`[data-widget-card="${g.id}"]`);
        if (node)
          Object.assign(node.style, {
            position: "fixed",
            left: `${g.rect.left}px`,
            top: `${g.rect.top}px`,
            width: `${g.rect.width}px`,
            height: `${g.rect.height}px`,
            zIndex: "60",
            pointerEvents: "none",
            transform: "scale(1.03)",
          });
      }
      props.current.onEdit();
      setActive(id);
      setAnnouncement(
        `${describe(props.current.layout.widgets.find((w) => w.key === id)?.id ?? "notes").title}: arrastra para mover`,
      );
    };
    if (editing) {
      event.preventDefault();
      activate();
    } else g.timer = setTimeout(activate, 480);
  };
  const cycleSize = (id: string) => {
    const sizes = WIDGET_SIZES;
    onChange({
      ...layout,
      widgets: layout.widgets.map((w) =>
        w.key === id ? { ...w, size: sizes[(sizes.indexOf(w.size) + 1) % sizes.length]! } : w,
      ),
    });
  };

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div
        ref={root}
        aria-label="Widgets de inicio"
        className={cn("dashboard-grid", editing && "is-editing")}
      >
        {layout.widgets.map((widget, index) => {
          const { title, tone } = describe(widget.id);
          return (
            <section
              key={widget.key}
              aria-label={title}
              data-widget={widget.id}
              data-widget-key={widget.key}
              data-grid-widget={widget.key}
              data-size={widget.size}
              className={cn(
                "dashboard-widget",
                widgetDimensions[widget.size][0] > 1 && "widget-wide",
                active === widget.key && "widget-lifted",
              )}
              style={{
                gridColumn: `span ${widgetDimensions[widget.size][0]}`,
                gridRow: `span ${widgetDimensions[widget.size][1]}`,
              }}
              onPointerDown={(event) => begin(event, widget.key)}
              onContextMenu={(event) => event.preventDefault()}
              onClickCapture={(event) => {
                if (
                  (editing || gesture.current?.activated) &&
                  !(event.target as HTMLElement).closest("[data-widget-control]")
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              <div data-widget-card={widget.key} className={cn("widget-card shadow-card", tone)}>
                <div className="widget-content" inert={editing || undefined}>
                  {children(widget)}
                </div>
              </div>
              {editing && (
                <div className="widget-controls">
                  <button
                    type="button"
                    data-widget-control
                    className="widget-settings"
                    disabled={disabled}
                    aria-label={`Configurar ${title.toLocaleLowerCase("es")}`}
                    onClick={() => onConfigure(widget.key)}
                  >
                    <Settings2 className="size-4" />
                  </button>
                  <Button
                    data-widget-control
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="widget-remove"
                    disabled={disabled}
                    aria-label={`Ocultar ${title.toLocaleLowerCase("es")}`}
                    onClick={() =>
                      onChange({
                        ...layout,
                        widgets: layout.widgets.filter((w) => w.key !== widget.key),
                      })
                    }
                  >
                    <Minus className="size-4" />
                  </Button>
                  <button
                    type="button"
                    data-widget-control
                    data-widget-drag
                    className="widget-drag-label"
                    disabled={disabled}
                    aria-label={`Mover ${title.toLocaleLowerCase("es")}`}
                    onKeyDown={(event) => {
                      if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) {
                        event.preventDefault();
                        onChange(
                          moveDashboardWidget(
                            layout,
                            widget.key,
                            ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1,
                          ),
                        );
                      }
                    }}
                  >
                    <Grip className="size-4" />
                    {title}
                  </button>
                  <div data-widget-control className="widget-order-controls">
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Subir ${title.toLocaleLowerCase("es")}`}
                      onClick={() => onChange(moveDashboardWidget(layout, widget.key, -1))}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === layout.widgets.length - 1}
                      aria-label={`Bajar ${title.toLocaleLowerCase("es")}`}
                      onClick={() => onChange(moveDashboardWidget(layout, widget.key, 1))}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    data-widget-control
                    className="widget-resize"
                    disabled={disabled}
                    aria-label={`Cambiar tamaño de ${title.toLocaleLowerCase("es")}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      begin(event, widget.key, "resize");
                    }}
                    onClick={(event) => {
                      if (event.detail === 0 || !resized.current) cycleSize(widget.key);
                      resized.current = false;
                    }}
                  >
                    <Maximize2 className="size-4" />
                    <span className="sr-only">
                      {widgetDimensions[widget.size][0]} por {widgetDimensions[widget.size][1]}
                    </span>
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
