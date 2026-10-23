import { z } from "zod";

export const WIDGET_IDS = [
  "tasks",
  "shopping",
  "calendar",
  "notes",
  "family",
  "finance",
  "clock",
  "my-tasks",
  "week",
  "pinned-note",
  "progress",
  "quick-add",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const dashboardLayoutSchema = z
  .object({
    version: z.literal(1),
    widgets: z
      .array(
        z.object({ id: z.enum(WIDGET_IDS), size: z.enum(["compact", "wide", "large"]) }).strict(),
      )
      .max(WIDGET_IDS.length)
      .refine((widgets) => new Set(widgets.map((widget) => widget.id)).size === widgets.length),
  })
  .strict();
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;
export type DashboardWidget = DashboardLayout["widgets"][number];
export const dashboardSnapshotSchema = z.object({
  layout: dashboardLayoutSchema,
  revision: z.number().int().min(1).max(2147483647),
});
export type DashboardSnapshot = { layout: DashboardLayout; revision: number };
export type DashboardScope =
  | { kind: "account"; accountId: string }
  | { kind: "device"; householdId: string; memberId: string };

export const defaultDashboardLayout = (): DashboardLayout => ({
  version: 1,
  // New widgets stay in the catalogue; existing choices remain unchanged.
  widgets: WIDGET_IDS.slice(0, 6).map((id) => ({ id, size: "compact" })),
});
export const initialDashboardSnapshot = (): DashboardSnapshot => ({
  layout: defaultDashboardLayout(),
  revision: 0,
});

/** Device PINs do not establish an Auth identity. Keep their layout local and
 * separate for each household/member, without caching any household records. */
export const dashboardScopeKey = (scope: DashboardScope) =>
  scope.kind === "account"
    ? `account:${scope.accountId}`
    : `homehub-dashboard-device:v1:${scope.householdId}:${scope.memberId}`;

export function moveDashboardWidget(
  layout: DashboardLayout,
  id: WidgetId,
  direction: -1 | 1,
): DashboardLayout {
  const widgets = [...layout.widgets];
  const index = widgets.findIndex((widget) => widget.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= widgets.length) return layout;
  [widgets[index], widgets[next]] = [widgets[next]!, widgets[index]!];
  return { ...layout, widgets };
}

export function placeDashboardWidget(layout: DashboardLayout, id: WidgetId, target: WidgetId) {
  const from = layout.widgets.findIndex((widget) => widget.id === id);
  const to = layout.widgets.findIndex((widget) => widget.id === target);
  if (from < 0 || to < 0 || from === to) return layout;
  const widgets = [...layout.widgets];
  const [widget] = widgets.splice(from, 1);
  widgets.splice(to, 0, widget!);
  return { ...layout, widgets };
}

export class DashboardConflict extends Error {
  constructor() {
    super(
      "Tu inicio cambió en otra ventana o dispositivo. Carga la versión actual para continuar.",
    );
  }
}

export const sameDashboardLayout = (a: DashboardLayout, b: DashboardLayout) =>
  JSON.stringify(a) === JSON.stringify(b);

export function dashboardErrorMessage(error: unknown): string {
  if (error instanceof DashboardConflict) return error.message;
  if (error && typeof error === "object" && "code" in error && error.code === "40001")
    return new DashboardConflict().message;
  return "No se pudo guardar o cargar tu inicio. Comprueba la conexión y vuelve a intentarlo.";
}
