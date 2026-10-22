import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tourSteps, type TourProgress, type TourStep } from "@/hooks/use-guided-tour";

const copy: Record<TourStep, { title: string; text: string }> = {
  home: {
    title: "Tu hogar, de un vistazo",
    text: "Explora las secciones a tu ritmo. Te mostraremos una ayuda breve la primera vez que las visites.",
  },
  chores: {
    title: "Crea tu primera tarea",
    text: "Pulsa aquí para asignar una tarea a alguien del hogar.",
  },
  shopping: {
    title: "Empieza tu lista de compras",
    text: "Añade un producto aquí. Puedes marcarlo cuando lo tengas en el carrito.",
  },
  finance: {
    title: "Organiza los gastos",
    text: "Añade una factura y elige cómo repartirla entre las personas del hogar.",
  },
  calendar: {
    title: "Añade un evento",
    text: "Guarda una cita, un cumpleaños o un plan para compartirlo con el hogar.",
  },
  notes: {
    title: "Escribe tu primera nota",
    text: "Pulsa aquí para dejar un recordatorio o compartir algo con tu familia.",
  },
  household: {
    title: "Añade a tu familia",
    text: "Crea una persona con su PIN. Para que use su propia cuenta, envíale una invitación por correo.",
  },
};
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

/** A non-modal coachmark: navigation and the highlighted control remain usable. */
export function GuidedTour({
  tab,
  enabled,
  progress,
  onSeen,
  onDismiss,
}: {
  tab: string;
  enabled: boolean;
  progress: TourProgress | null;
  onSeen: (step: TourStep) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState<TourStep | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [closed, setClosed] = useState(false);
  const latest = useRef(progress);
  latest.current = progress;
  const callbacks = useRef({ onSeen, onDismiss });
  callbacks.current = { onSeen, onDismiss };
  const ready = !!progress;
  const dismissed = progress?.dismissed ?? true;
  const titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    setClosed(false);
    setBounds(null);
    const candidate = tourSteps.find((value) => value === tab);
    setStep(
      enabled && !dismissed && candidate && !latest.current?.seen.includes(candidate)
        ? candidate
        : null,
    );
  }, [tab, enabled, ready, dismissed]);
  useEffect(() => {
    if (!step || closed || !enabled || dismissed) return;
    let frame = 0,
      observed: Element | null = null,
      presented = false;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
      const dialog = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (dialog || !target) {
        setBounds(null);
        return;
      }
      if (observed !== target) {
        resize.disconnect();
        resize.observe(target);
        observed = target;
      }
      const rect = target.getBoundingClientRect();
      const width = window.innerWidth,
        height = window.innerHeight;
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= height ||
        rect.right <= 0 ||
        rect.left >= width
      ) {
        setBounds(null);
        return;
      }
      const x = Math.max(6, rect.left - 6),
        y = Math.max(6, rect.top - 6);
      const next = {
        x,
        y,
        width: Math.max(1, Math.min(width - 6, rect.right + 6) - x),
        height: Math.max(1, Math.min(height - 6, rect.bottom + 6) - y),
        viewportWidth: width,
        viewportHeight: height,
      };
      setBounds((previous) =>
        previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      if (!presented) {
        presented = true;
        callbacks.current.onSeen(step);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("main-content") ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "style"],
    });
    // Dialog portals live outside main-content.
    const dialogs = new MutationObserver(schedule);
    dialogs.observe(document.body, { childList: true });
    const closeFromTarget = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(`[data-tour="${step}"]`))
        setClosed(true);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosed(true);
    };
    const delay = setTimeout(schedule, 400);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("click", closeFromTarget);
    document.addEventListener("focusin", closeFromTarget);
    document.addEventListener("keydown", escape);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(frame);
      observer.disconnect();
      dialogs.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("click", closeFromTarget);
      document.removeEventListener("focusin", closeFromTarget);
      document.removeEventListener("keydown", escape);
    };
  }, [step, closed, enabled, dismissed]);
  if (!step || !bounds || closed || !enabled || dismissed) return null;
  const cardWidth = Math.min(328, bounds.viewportWidth - 24);
  const left = Math.max(12, Math.min(bounds.x, bounds.viewportWidth - cardWidth - 12));
  const below = bounds.y + bounds.height + 12;
  const top = below + 210 < bounds.viewportHeight ? below : Math.max(12, bounds.y - 222);
  const { title, text } = copy[step];
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40" data-guided-tour="">
      <svg aria-hidden="true" className="absolute inset-0 size-full">
        <path
          fill="rgb(0 0 0 / .52)"
          fillRule="evenodd"
          d={`M0 0H${bounds.viewportWidth}V${bounds.viewportHeight}H0Z M${bounds.x} ${bounds.y}h${bounds.width}v${bounds.height}h-${bounds.width}Z`}
        />
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx="10"
          fill="none"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="pointer-events-auto fixed max-h-[min(80dvh,320px)] overflow-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-xl"
        style={{ left, top, width: cardWidth }}
      >
        <div className="flex items-start gap-2">
          <h2 id={titleId} className="flex-1 font-display text-lg font-bold">
            {title}
          </h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="-mr-2 -mt-2 size-9"
            aria-label="Cerrar esta ayuda"
            onClick={() => setClosed(true)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          {text}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Omitir recorrido
          </Button>
          <Button size="sm" onClick={() => setClosed(true)}>
            Entendido
          </Button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
