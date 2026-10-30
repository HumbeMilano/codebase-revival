import { lazy, Suspense, useMemo, useState } from "react";
import { Check, LayoutGrid, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useToday } from "@/hooks/use-today";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dashboardLayoutSchema,
  dashboardWidgetIdentity,
  MAX_DASHBOARD_WIDGETS,
  widgetReferenceField,
  widgetReferenceId,
  defaultDashboardLayout,
  defaultMobileDashboardLayout,
  sameDashboardLayout,
  WIDGET_IDS,
  WIDGET_SIZES,
  widgetDimensions,
  type DashboardLayout,
  type DashboardScope,
  type DashboardSnapshot,
  type DashboardWidget,
  type WidgetId,
} from "@/lib/dashboard-layout";
import {
  dashboardLists,
  dashboardList,
  isFinancialWidget,
  widgetSection,
} from "@/lib/dashboard-data";
import { db } from "@/lib/db";
import { canViewFinances } from "@/lib/finance-visibility";
import { cn } from "@/lib/utils";
import { MEMBERS, type Member } from "./data";
import { WidgetGrid } from "./WidgetGrid";
import { DashboardWidgetContent } from "./DashboardWidgets";
import { MobileDaySummary } from "./MobileDaySummary";
import { MaskedFinancialWidget } from "./MaskedFinancialWidget";
import { describeWidget, widgetCatalogue } from "./widget-catalogue";
import type { HubState } from "./Screens";

const CalendarDay = lazy(() => import("./Planner").then((m) => ({ default: m.FamilyCalendar })));

type Section = "chores" | "shopping" | "calendar" | "notes" | "finance";
type Choice = { id: string; name: string; disabled?: boolean };
const sortedSizes = [...WIDGET_SIZES].sort(
  (a, b) =>
    widgetDimensions[a][0] - widgetDimensions[b][0] ||
    widgetDimensions[a][1] - widgetDimensions[b][1],
);
function ReferenceSelect({
  label,
  value,
  choices,
  onChange,
  emptyDisabled = false,
}: {
  label: string;
  value: string | undefined;
  choices: Choice[];
  onChange: (value: string | undefined) => void;
  emptyDisabled?: boolean;
}) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <select
        aria-label={`${label} del widget`}
        className="mt-2 w-full rounded-xl border bg-background p-3"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="" disabled={emptyDisabled}>
          Elegir {label.toLocaleLowerCase("es")}
        </option>
        {value && !choices.some((choice) => choice.id === value) && (
          <option value={value}>Ya no está disponible</option>
        )}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id} disabled={choice.disabled}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Dashboard({
  s,
  user,
  scope,
  go,
  onCreate,
  onOpenRecord,
  onRequestFinance,
  now: clock,
  adultAuthorized = false,
}: {
  s: HubState;
  user: Member;
  compact: boolean;
  scope: DashboardScope;
  go: (section: Section) => void;
  onCreate: (section: Section) => void;
  onOpenRecord?: (section: "calendar" | "notes" | "shopping", id: string) => void;
  onRequestFinance?: () => void;
  now: Date | null;
  adultAuthorized?: boolean;
}) {
  const today = useToday(),
    now = clock ?? today;
  const phone = useIsMobile() && scope.kind === "account";
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [client] = useState(db);
  const preference = useDashboardLayout(scope, client);
  const [editor, setEditor] = useState<DashboardSnapshot | null>(null);
  const [catalog, setCatalog] = useState(false);
  const [group, setGroup] = useState("Todos");
  const [selecting, setSelecting] = useState<WidgetId | null>(null);
  const [configuration, setConfiguration] = useState<string | null>(null);
  const financialAccess =
    canViewFinances(user.role, adultAuthorized) && (scope.kind === "account" || adultAuthorized);
  const displayState =
    financialAccess && !s.financesLoading ? s : { ...s, bills: [], contributions: [] };
  const allowed = (id: WidgetId) => !isFinancialWidget(id) || financialAccess;
  const displayed = (id: WidgetId) => allowed(id) || scope.kind === "device";
  const baseLayout = useMemo(
    () =>
      phone &&
      preference.revision === 0 &&
      sameDashboardLayout(preference.layout, defaultDashboardLayout())
        ? defaultMobileDashboardLayout()
        : preference.layout,
    [phone, preference.revision, preference.layout],
  );
  const source = editor?.layout ?? baseLayout;
  const visible = useMemo(
    () => ({
      ...source,
      widgets: source.widgets.filter(
        (widget) => !isFinancialWidget(widget.id) || financialAccess || scope.kind === "device",
      ),
    }),
    [source, financialAccess, scope.kind],
  );
  const lists = dashboardLists(s);
  const choices = (id: WidgetId): Choice[] =>
    id === "shopping"
      ? lists.map((list) => ({ id: list.id, name: list.name }))
      : id === "specific-note"
        ? s.notes.map((note) => ({ id: note.id, name: note.title }))
        : ["member-summary", "member-tasks"].includes(id)
          ? MEMBERS
          : [];
  const reference = (id: WidgetId, value: string) =>
    id === "shopping"
      ? { listId: value }
      : id === "specific-note"
        ? { noteId: value }
        : { memberId: value };
  const resolved = (entry: DashboardWidget): DashboardWidget =>
    entry.id === "shopping" && !entry.listId && lists.length === 1
      ? { ...entry, listId: lists[0]!.id }
      : entry;
  const normalize = (layout: DashboardLayout): DashboardLayout => ({
    ...layout,
    widgets: layout.widgets.map(resolved),
  });
  const duplicate = (entry: DashboardWidget, except?: string) =>
    (editor?.layout.widgets ?? source.widgets).some(
      (old) =>
        old.key !== except &&
        dashboardWidgetIdentity(resolved(old)) === dashboardWidgetIdentity(resolved(entry)),
    );
  const available = (id: WidgetId, except?: string) =>
    choices(id).map((choice) => ({
      ...choice,
      disabled: duplicate(
        { id, key: "candidate", size: "compact", ...reference(id, choice.id) },
        except,
      ),
    }));
  const placeholder = (id: WidgetId) =>
    editor?.layout.widgets.find((entry) => entry.id === id && !widgetReferenceId(resolved(entry)));
  const canAdd = (id: WidgetId) => {
    if (!editor || !allowed(id)) return false;
    if (editor.layout.widgets.length >= MAX_DASHBOARD_WIDGETS && !placeholder(id)) return false;
    return widgetReferenceField(id) && choices(id).length
      ? available(id).some((choice) => !choice.disabled)
      : !editor.layout.widgets.some((entry) => entry.id === id);
  };
  const instanceTitle = (entry: DashboardWidget) => {
    const same = visible.widgets.filter((candidate) => candidate.id === entry.id);
    const title = describeWidget(entry.id).title;
    if (same.length < 2) return title;
    const selected = choices(entry.id).find(
      (choice) => choice.id === widgetReferenceId(resolved(entry)),
    );
    if (!selected)
      return `${title} · No disponible ${same.findIndex((candidate) => candidate.key === entry.key) + 1}`;
    const namesakes = same.filter((candidate) =>
      choices(candidate.id).some(
        (choice) =>
          choice.id === widgetReferenceId(resolved(candidate)) && choice.name === selected.name,
      ),
    );
    const suffix =
      namesakes.length > 1
        ? ` (${namesakes.findIndex((candidate) => candidate.key === entry.key) + 1})`
        : "";
    return `${title} · ${selected.name}${suffix}`;
  };
  const open = () => {
    setCalendarDay(null);
    if (!editor && !preference.loading)
      setEditor({ layout: baseLayout, revision: preference.revision });
  };
  const close = () => {
    setEditor(null);
    setCatalog(false);
    setSelecting(null);
    setConfiguration(null);
  };
  // Preserve genuinely hidden preferences; masked tablet cards remain visible and editable.
  const updateDraft = (layout: DashboardLayout) =>
    setEditor((current) => {
      if (!current) return null;
      const queue = layout.widgets.filter((widget) => displayed(widget.id));
      const widgets: DashboardWidget[] = [];
      for (const old of current.layout.widgets) {
        if (!displayed(old.id)) widgets.push(old);
        else if (queue.length) widgets.push(queue.shift()!);
      }
      widgets.push(...queue);
      return { ...current, layout: { ...layout, widgets } };
    });
  const add = (id: WidgetId, value?: string) => {
    if (!editor || !canAdd(id)) return;
    if (value && !choices(id).some((choice) => choice.id === value)) return;
    const vacant = widgetReferenceField(id) ? placeholder(id) : undefined;
    const entry: DashboardWidget = {
      ...(vacant ?? {
        id,
        key: crypto.randomUUID(),
        size: id === "month-calendar" ? "square" : "compact",
      }),
      ...(value ? reference(id, value) : {}),
    };
    if (duplicate(entry, vacant?.key)) return;
    updateDraft(
      normalize({
        ...visible,
        widgets: vacant
          ? visible.widgets.map((old) => (old.key === vacant.key ? entry : old))
          : [...visible.widgets, entry],
      }),
    );
    setSelecting(null);
  };
  const beginAdd = (id: WidgetId) => {
    const options = available(id).filter((choice) => !choice.disabled);
    if (options.length > 1) setSelecting(id);
    else add(id, options[0]?.id);
  };
  const save = async () => {
    if (!editor) return;
    const saved = await preference.save(normalize(editor.layout), editor.revision);
    if (saved) {
      close();
      toast.success(
        scope.kind === "account" ? "Tu inicio se guardó" : "Tu inicio se guardó en esta tablet",
      );
    }
  };
  const browseShopping = (id?: string) => {
    if (id && onOpenRecord) onOpenRecord("shopping", id);
    else go("shopping");
  };
  const browseWidget = (entry: DashboardWidget) => {
    if (editor || entry.id === "quick-add") return;
    if (isFinancialWidget(entry.id)) {
      if (!financialAccess) {
        onRequestFinance?.();
        return;
      }
      if (s.financesLoading) return;
    }
    if (entry.id === "shopping") {
      browseShopping(dashboardList(s, entry)?.id);
      return;
    }
    if (["specific-note", "pinned-note"].includes(entry.id)) {
      const note =
        entry.id === "specific-note"
          ? s.notes.find((n) => n.id === entry.noteId)
          : s.notes.find((n) => n.pinned);
      if (note && onOpenRecord) {
        onOpenRecord("notes", note.id);
        return;
      }
    }
    go(widgetSection(entry.id));
  };
  const widget = visible.widgets.find((entry) => entry.key === configuration);
  const change = (value: Partial<DashboardWidget>) => {
    if (!widget || !editor) return;
    const candidate = { ...widget, ...value };
    const proposed = normalize({
      ...editor.layout,
      widgets: editor.layout.widgets.map((entry) => (entry.key === widget.key ? candidate : entry)),
    });
    if (!dashboardLayoutSchema.safeParse(proposed).success) {
      toast.info("Ya tienes este widget para esa selección.");
      return;
    }
    updateDraft(
      normalize({
        ...visible,
        widgets: visible.widgets.map((entry) => (entry.key === widget.key ? candidate : entry)),
      }),
    );
  };
  return (
    <div
      className={cn("dashboard-home space-y-4 pb-5 md:space-y-6", editor && "dashboard-editing")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground md:text-sm first-letter:uppercase">
            {now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h2 className="break-words font-display text-3xl font-extrabold">Hola, {user.name}</h2>
        </div>
        {!editor && (
          <Button
            variant="outline"
            aria-label="Personalizar"
            className={cn("h-10 shrink-0 rounded-full bg-card sm:h-11", phone && "size-10 p-0")}
            disabled={preference.loading}
            onClick={open}
          >
            <SlidersHorizontal className="size-4" />
            <span className={phone ? "sr-only" : "hidden min-[380px]:inline"}>Personalizar</span>
          </Button>
        )}
      </div>
      {phone && !editor && (
        <MobileDaySummary
          s={displayState}
          now={now}
          go={go}
          onCreate={onCreate}
          onOpenRecord={onOpenRecord}
          financialAccess={financialAccess}
        />
      )}
      {editor && (
        <section aria-label="Personalizar inicio" className="widget-edit-rail">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Widgets"
            title="Añadir widgets"
            disabled={preference.saving}
            onClick={() => {
              setSelecting(null);
              setCatalog(true);
            }}
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            aria-label="Guardar inicio"
            title="Guardar inicio"
            disabled={preference.saving}
            onClick={() => void save()}
          >
            <Check />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Restablecer diseño"
            title="Restablecer diseño"
            disabled={preference.saving}
            onClick={() =>
              updateDraft(phone ? defaultMobileDashboardLayout() : defaultDashboardLayout())
            }
          >
            <RotateCcw />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Cancelar"
            title="Cancelar"
            disabled={preference.saving}
            onClick={close}
          >
            <X />
          </Button>
        </section>
      )}
      {preference.error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-card p-4 text-sm text-destructive"
        >
          <p>{preference.error}</p>
          <button
            type="button"
            className="mt-2 underline"
            disabled={preference.saving}
            onClick={() =>
              void preference.reload().then((fresh) => {
                if (fresh && editor) setEditor(fresh);
              })
            }
          >
            {editor ? "Cargar versión actual" : "Reintentar"}
          </button>
        </div>
      )}
      {preference.loading ? (
        <div role="status" className="grid grid-cols-2 gap-4">
          <span className="sr-only">Cargando tu inicio…</span>
          {[0, 1].map((id) => (
            <div
              key={id}
              className="h-64 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <>
          <WidgetGrid
            layout={visible}
            editing={!!editor}
            disabled={preference.saving || !!preference.error}
            onChange={updateDraft}
            describe={describeWidget}
            label={instanceTitle}
            onConfigure={setConfiguration}
            onOpen={browseWidget}
          >
            {(entry) =>
              isFinancialWidget(entry.id) && (!financialAccess || s.financesLoading) ? (
                <MaskedFinancialWidget
                  widget={entry}
                  member={
                    entry.id === "member-summary"
                      ? MEMBERS.find((member) => member.id === entry.memberId)
                      : undefined
                  }
                  loading={financialAccess && !!s.financesLoading}
                  onUnlock={editor ? undefined : onRequestFinance}
                />
              ) : (
                <DashboardWidgetContent
                  widget={entry}
                  s={displayState}
                  now={now}
                  user={user}
                  configure={() => {
                    open();
                    setConfiguration(entry.key);
                  }}
                  onCreate={onCreate}
                  onBrowseShopping={browseShopping}
                  onBrowse={() => browseWidget(entry)}
                  onOpenDay={(date) => {
                    if (!editor) setCalendarDay(date);
                  }}
                  onBrowseNotes={() => go("notes")}
                  onOpenNote={(id) => {
                    if (onOpenRecord) onOpenRecord("notes", id);
                    else go("notes");
                  }}
                />
              )
            }
          </WidgetGrid>
          {!visible.widgets.length && (
            <div className="rounded-3xl border border-dashed bg-card px-6 py-14 text-center">
              <LayoutGrid className="mx-auto mb-4 size-9 text-muted-foreground" />
              <h3 className="font-display text-xl font-bold">Tu inicio, a tu manera</h3>
              <Button
                className="mt-5 rounded-full"
                onClick={() => {
                  open();
                  setCatalog(true);
                }}
              >
                Añadir widgets
              </Button>
            </div>
          )}
        </>
      )}
      {calendarDay && !editor && (
        <Suspense fallback={<p role="status">Abriendo agenda…</p>}>
          <CalendarDay
            key={calendarDay}
            dayDialog
            onDayClose={() => setCalendarDay(null)}
            initialEventId={`date:${calendarDay}`}
            compact
            events={s.events}
            setEvents={s.setEvents}
            bills={financialAccess ? s.bills : []}
            setBills={s.setBills}
            financialAccess={financialAccess}
            user={user}
          />
        </Suspense>
      )}
      <Dialog
        open={!!widget && !!editor}
        onOpenChange={(value) => {
          if (!value) setConfiguration(null);
        }}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto rounded-3xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Configurar widget</DialogTitle>
          </DialogHeader>
          {widget && (
            <div className="space-y-5">
              {["member-summary", "member-tasks"].includes(widget.id) && (
                <ReferenceSelect
                  label="Miembro"
                  value={widget.memberId}
                  choices={available(widget.id, widget.key)}
                  emptyDisabled={duplicate({ ...widget, memberId: undefined }, widget.key)}
                  onChange={(memberId) => change({ memberId })}
                />
              )}
              {widget.id === "specific-note" && (
                <ReferenceSelect
                  label="Nota"
                  value={widget.noteId}
                  choices={available(widget.id, widget.key)}
                  emptyDisabled={duplicate({ ...widget, noteId: undefined }, widget.key)}
                  onChange={(noteId) => change({ noteId })}
                />
              )}
              {widget.id === "shopping" && (
                <ReferenceSelect
                  label="Lista"
                  value={resolved(widget).listId}
                  choices={available(widget.id, widget.key)}
                  emptyDisabled={visible.widgets.some(
                    (entry) => entry.id === "shopping" && entry.key !== widget.key,
                  )}
                  onChange={(listId) => change({ listId })}
                />
              )}
              <fieldset>
                <legend className="mb-3 text-sm font-bold">Tamaño</legend>
                <div className="grid grid-cols-3 gap-2">
                  {sortedSizes.map((size) => {
                    const [columns, rows] = widgetDimensions[size];
                    return (
                      <button
                        type="button"
                        key={size}
                        aria-label={`Tamaño ${columns} por ${rows}`}
                        aria-pressed={widget.size === size}
                        onClick={() => change({ size })}
                        className={cn(
                          "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-sm",
                          widget.size === size ? "border-primary bg-accent" : "bg-background",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          style={{ width: columns * 13, height: rows * 9 }}
                          className="rounded border-2 border-current"
                        />
                        {columns} × {rows}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Button className="w-full rounded-full" onClick={() => setConfiguration(null)}>
                Listo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={catalog && !!editor}
        onOpenChange={(value) => {
          setCatalog(value);
          if (!value) setSelecting(null);
        }}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto rounded-3xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              {selecting
                ? selecting === "shopping"
                  ? "Elegir lista"
                  : selecting === "specific-note"
                    ? "Elegir nota"
                    : "Elegir miembro"
                : "Añadir widgets"}
            </DialogTitle>
          </DialogHeader>
          {selecting ? (
            <div className="grid gap-2">
              {available(selecting).map((choice) => (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 justify-start rounded-xl"
                  key={choice.id}
                  disabled={choice.disabled}
                  onClick={() => add(selecting, choice.id)}
                >
                  {choice.name}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setSelecting(null)}>
                Volver
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" aria-label="Tipos de widgets">
                {["Todos", "Casa", "Agenda", "Finanzas"]
                  .filter((name) => name !== "Finanzas" || financialAccess)
                  .map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={group === name}
                      onClick={() => setGroup(name)}
                      className={cn(
                        "rounded-full px-3 py-2 text-sm",
                        group === name ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {name}
                    </button>
                  ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {WIDGET_IDS.filter(
                  (id) => allowed(id) && (group === "Todos" || widgetCatalogue[id].group === group),
                ).map((id) => {
                  const { title, Icon, tone } = describeWidget(id),
                    added = !canAdd(id);
                  return (
                    <button
                      type="button"
                      key={id}
                      disabled={added || preference.saving}
                      aria-label={`Añadir ${title.toLocaleLowerCase("es")}`}
                      className={cn(
                        "flex min-h-28 flex-col items-start justify-between gap-3 rounded-2xl p-4 text-left transition hover:scale-[1.02] disabled:opacity-45 motion-reduce:transform-none",
                        tone,
                      )}
                      onClick={() => beginAdd(id)}
                    >
                      <span className="flex w-full items-center justify-between">
                        <Icon className="size-6" />
                        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                      </span>
                      <span className="text-sm font-bold">{title}</span>
                    </button>
                  );
                })}
              </div>
              <Button className="rounded-full" onClick={() => setCatalog(false)}>
                Listo
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
