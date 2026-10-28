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
  "member-summary",
  "month-calendar",
  "bills",
  "specific-note",
  "member-tasks",
  "reminders",
  "next-bill",
  "shopping-summary",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export const WIDGET_SIZES = [
  "compact",
  "wide",
  "large",
  "small",
  "tall",
  "column",
  "short",
  "square",
  "portrait",
  "banner",
  "panorama",
  "full",
] as const;
export const widgetDimensions = {
  small: [1, 1],
  compact: [1, 2],
  tall: [1, 3],
  column: [1, 4],
  short: [2, 1],
  wide: [2, 2],
  square: [2, 3],
  portrait: [2, 4],
  banner: [3, 1],
  panorama: [3, 2],
  large: [3, 3],
  full: [3, 4],
} as const;
export type WidgetSize = keyof typeof widgetDimensions;
export const widgetSizeFor = (columns: number, rows: number): WidgetSize =>
  WIDGET_SIZES.find(
    (size) => widgetDimensions[size][0] === columns && widgetDimensions[size][1] === rows,
  ) ?? "compact";
export const widgetSchema = z
  .object({
    id: z.enum(WIDGET_IDS),
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    size: z.enum(WIDGET_SIZES),
    memberId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    noteId: z.string().uuid().optional(),
    listId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (w) =>
      (!w.memberId || ["member-summary", "member-tasks"].includes(w.id)) &&
      (!w.noteId || w.id === "specific-note") &&
      (!w.listId || w.id === "shopping"),
  );
const currentLayout = z
  .object({
    version: z.literal(3),
    widgets: z
      .array(widgetSchema)
      .max(WIDGET_IDS.length)
      .refine(
        (xs) =>
          new Set(xs.map((w) => w.key)).size === xs.length &&
          new Set(xs.map((w) => w.id)).size === xs.length,
      ),
  })
  .strict();
const previousLayout = z
  .object({
    version: z.literal(2),
    widgets: z
      .array(
        z
          .object({
            id: z.enum(WIDGET_IDS.slice(0, 16) as [WidgetId, ...WidgetId[]]),
            key: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
            size: z.enum(WIDGET_SIZES),
            memberId: z
              .string()
              .regex(/^[a-zA-Z0-9_-]{1,100}$/)
              .optional(),
            noteId: z.string().uuid().optional(),
          })
          .strict()
          .refine(
            (w) =>
              (!w.memberId || w.id === "member-summary") && (!w.noteId || w.id === "specific-note"),
          ),
      )
      .max(36)
      .refine((xs) => new Set(xs.map((w) => w.key)).size === xs.length),
  })
  .strict();
const legacyLayout = z
  .object({
    version: z.literal(1),
    widgets: z
      .array(
        z
          .object({
            id: z.enum(WIDGET_IDS.slice(0, 12) as [WidgetId, ...WidgetId[]]),
            size: z.enum(["compact", "wide", "large"]),
          })
          .strict(),
      )
      .max(12)
      .refine((xs) => new Set(xs.map((w) => w.id)).size === xs.length),
  })
  .strict();
export const dashboardLayoutSchema = z
  .union([currentLayout, previousLayout, legacyLayout])
  .transform((layout): z.infer<typeof currentLayout> => {
    const seen = new Set<string>();
    return {
      version: 3,
      widgets: layout.widgets
        .filter((widget) => {
          if (seen.has(widget.id)) return false;
          seen.add(widget.id);
          return true;
        })
        .map((w) => ({ ...w, key: "key" in w ? w.key : w.id })),
    };
  });
export type DashboardLayout = z.output<typeof dashboardLayoutSchema>;
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
  version: 3,
  widgets: [
    { id: "tasks", key: "tasks", size: "tall" },
    { id: "specific-note", key: "specific-note", size: "column" },
    { id: "shopping", key: "shopping", size: "tall" },
    { id: "notes", key: "notes", size: "wide" },
    { id: "finance", key: "finance", size: "wide" },
    { id: "calendar", key: "calendar", size: "compact" },
  ],
});
export const defaultMobileDashboardLayout = (): DashboardLayout => ({
  version: 3,
  widgets: [
    { id: "tasks", key: "tasks", size: "short" },
    { id: "shopping-summary", key: "shopping-summary", size: "small" },
    { id: "shopping", key: "shopping", size: "panorama" },
    { id: "calendar", key: "calendar", size: "panorama" },
    { id: "notes", key: "notes", size: "panorama" },
    { id: "month-calendar", key: "month-calendar", size: "full" },
  ],
});

export const initialDashboardSnapshot = (): DashboardSnapshot => ({
  layout: defaultDashboardLayout(),
  revision: 0,
});
export const dashboardScopeKey = (scope: DashboardScope) =>
  scope.kind === "account"
    ? `account:${scope.accountId}`
    : `homehub-dashboard-device:v3:${scope.householdId}:${scope.memberId}`;
export function moveDashboardWidget(
  layout: DashboardLayout,
  key: string,
  direction: -1 | 1,
): DashboardLayout {
  const index = layout.widgets.findIndex((w) => w.key === key),
    next = index + direction;
  if (index < 0 || next < 0 || next >= layout.widgets.length) return layout;
  const widgets = [...layout.widgets];
  [widgets[index], widgets[next]] = [widgets[next]!, widgets[index]!];
  return { ...layout, widgets };
}
export function placeDashboardWidget(
  layout: DashboardLayout,
  key: string,
  target: string,
): DashboardLayout {
  const from = layout.widgets.findIndex((w) => w.key === key),
    to = layout.widgets.findIndex((w) => w.key === target);
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
