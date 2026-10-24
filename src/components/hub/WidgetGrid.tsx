import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Grip, Maximize2, Minus, Settings2 } from "lucide-react";
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
  over: string;
  capture: HTMLElement;
  frame?: number;
};
type Props = {
  layout: DashboardLayout;
  editing: boolean;
  disabled: boolean;
  onChange: (layout: DashboardLayout) => void;
  describe: (id: WidgetId) => { title: string; tone: string };
  onConfigure: (key: string) => void;
  children: (widget: DashboardWidget) => React.ReactNode;
};

/** Only the drag and resize handles capture pointers; the cards scroll natively.
 * Layout preferences contain only IDs and sizes; gestures never mutate records. */
export function WidgetGrid({
  layout,
  editing,
  disabled,
  onChange,
  describe,
  children,
  onConfigure,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const props = useRef({ layout, editing, disabled, onChange });
  props.current = { layout, editing, disabled, onChange };
  const gesture = useRef<Gesture | null>(null);
  const cancelGesture = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);
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
      node.getAnimations?.().forEach((animation) => animation.cancel());
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
      if (g.frame) cancelAnimationFrame(g.frame);
      gesture.current = null;
      if (g.capture.hasPointerCapture?.(g.pointer)) g.capture.releasePointerCapture(g.pointer);
      const node = card(g.id);
      if (node) {
        const from = node.getBoundingClientRect();
        node.removeAttribute("style");
        if (g.kind === "move" && !cancel && node.animate && !reduced()) {
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
      if (g.kind === "move" || Math.hypot(g.lastX - g.x, g.lastY - g.y) > 10)
        suppressClickUntil.current = Date.now() + 350;
      resized.current =
        g.kind === "resize" && (cancel || Math.hypot(g.lastX - g.x, g.lastY - g.y) > 10);
      setActive(null);
      if (cancel) props.current.onChange(g.original);
      setAnnouncement(cancel ? "Movimiento cancelado" : "Widget colocado");
    };
    cancelGesture.current = () => finish(true);
    const paint = () => {
      const g = gesture.current;
      if (!g) return;
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
      event.preventDefault();
      if (!g.frame) g.frame = requestAnimationFrame(paint);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId === gesture.current?.pointer) finish(event.type !== "pointerup");
    };
    // A second touch cancels editing that pointer; it never synthesizes page scrolling.
    const extraContact = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" &&
        gesture.current &&
        event.pointerId !== gesture.current.pointer
      )
        finish(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        finish(true);
      }
    };
    const blur = () => finish(true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerdown", extraContact, true);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("lostpointercapture", end);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      const g = gesture.current;
      if (g?.frame) cancelAnimationFrame(g.frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", extraContact, true);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("lostpointercapture", end);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [describe]);

  useEffect(() => {
    if (!editing || disabled) cancelGesture.current();
  }, [editing, disabled]);

  const begin = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
    kind: Gesture["kind"],
  ) => {
    if (!editing || disabled || gesture.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const source = event.currentTarget;
    source.focus({ preventScroll: true });
    const rect = source.closest<HTMLElement>("[data-grid-widget]")!.getBoundingClientRect();
    const capture = kind === "resize" ? source : root.current!;
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
      over: id,
      capture,
    };
    gesture.current = g;
    resized.current = false;
    capture.setPointerCapture?.(g.pointer);
    if (kind === "move") {
      const node = root.current?.querySelector<HTMLElement>(`[data-widget-card="${g.id}"]`);
      if (node)
        Object.assign(node.style, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          zIndex: "60",
          pointerEvents: "none",
          transform: "scale(1.03)",
        });
    }
    setActive(id);
    setAnnouncement(
      `${describe(layout.widgets.find((w) => w.key === id)?.id ?? "notes").title}: arrastra para mover`,
    );
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
        onClickCapture={(event) => {
          if (Date.now() < suppressClickUntil.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {layout.widgets.map((widget) => {
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
              onContextMenu={(event) => event.preventDefault()}
              onClickCapture={(event) => {
                if (
                  (editing || !!gesture.current) &&
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
                    title="Arrastrar para mover"
                    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                    onPointerDown={(event) => begin(event, widget.key, "move")}
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
                  </button>
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
