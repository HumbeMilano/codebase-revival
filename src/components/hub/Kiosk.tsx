import { useEffect, useRef, useState } from "react";
import { CalendarDays, Delete, Lock } from "lucide-react";
import photo from "@/assets/kiosk-photo.jpg";
import { HOUSEHOLD, MEMBERS, memberBg, type Chore, type Member } from "./data";
import { db, isDeviceMode, setFinanceToken } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dateKey, eventWhen, upcomingEvents, type FamilyEvent } from "./planner-data";

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Avatar({ m, size = "md" }: { m: Member; size?: "sm" | "md" | "lg" }) {
  const classes =
    size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-7 text-xs" : "size-10 text-sm";
  return (
    <span
      aria-label={m.name}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-display font-bold text-foreground",
        classes,
        memberBg[m.color] ?? "bg-secondary",
      )}
    >
      {m.name.trim()[0]?.toLocaleUpperCase() ?? "?"}
    </span>
  );
}

function pinError(error: { message?: string } | null): Error {
  if (error?.message?.includes("suspended"))
    return new Error("Este hogar está suspendido. Consulta con quien administra el servicio.");
  return new Error("No se pudo verificar el PIN. Comprueba la conexión y vuelve a intentarlo.");
}

/** Every verification and financial grant is checked by Postgres, never by client role. */
export async function findByPin(
  pin: string,
  adminOnly = false,
  signal?: AbortSignal,
): Promise<Member | undefined> {
  const client = db();
  const { data, error } = await client.rpc("verify_pin", { _pin: pin, _admin_only: adminOnly });
  if (error) throw pinError(error);
  if (signal?.aborted || client !== db()) return undefined;
  const found = data?.[0];
  if (!found) {
    const { data: status, error: statusError } = await client.rpc("pin_lock_status");
    if (statusError) throw pinError(statusError);
    if (
      status &&
      typeof status === "object" &&
      !Array.isArray(status) &&
      status["locked"] === true
    ) {
      const seconds = typeof status["retry_after"] === "number" ? status["retry_after"] : 300;
      throw new Error(
        `Demasiados intentos. Vuelve a intentarlo en ${Math.max(1, Math.ceil(seconds / 60))} min.`,
      );
    }
    return undefined;
  }
  if (adminOnly || (isDeviceMode() && found.role === "admin")) {
    const { data: token, error: authorizationError } = await client.rpc("authorize_finances", {
      _pin: pin,
    });
    if (authorizationError) throw pinError(authorizationError);
    if (!token) throw new Error("No se pudo autorizar el acceso financiero. Vuelve a intentarlo.");
    if (signal?.aborted || client !== db()) {
      await client.rpc("revoke_finance_session", { _token: token });
      return undefined;
    }
    setFinanceToken(token);
  }
  const meta = MEMBERS.find((member) => member.id === found.key);
  // Metadata can arrive later than a newly created member; identity still comes from the server.
  return {
    id: found.key,
    name: found.name,
    role: found.role === "admin" ? "admin" : "member",
    color: meta?.color ?? "member-1",
  };
}

export function PinPad({
  title,
  adminOnly,
  onSuccess,
  onCancel,
}: {
  title?: string;
  adminOnly?: boolean;
  onSuccess: (member: Member) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [who, setWho] = useState<Member | null>(null);
  const callback = useRef(onSuccess);
  callback.current = onSuccess;
  useEffect(() => {
    if (pin.length !== 4) return;
    let active = true;
    const controller = new AbortController();
    setChecking(true);
    setError("");
    void findByPin(pin, adminOnly, controller.signal)
      .then((member) => {
        if (!active) return;
        if (member) {
          setWho(member);
          callback.current(member);
        } else {
          setError("PIN incorrecto. Comprueba tus 4 números.");
          setPin("");
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "No se pudo verificar el PIN.");
        setPin("");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pin, adminOnly]);
  const inputRef = useRef<HTMLInputElement>(null);
  const press = (digit: string) => {
    if (checking || who) return;
    setError("");
    setPin((value) => (value.length < 4 ? value + digit : value));
    inputRef.current?.focus();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel?.();
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-xs rounded-3xl bg-card p-6"
        onInteractOutside={(event) => {
          if (!onCancel) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!onCancel) event.preventDefault();
        }}
      >
        <div className="flex flex-col items-center gap-3">
          {who ? (
            <Avatar m={who} size="lg" />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-secondary">
              <Lock className="size-6" />
            </span>
          )}
          <DialogTitle className="text-center font-display text-xl">
            {who ? `Hola, ${who.name}` : (title ?? "Escribe tu PIN")}
          </DialogTitle>
          <DialogDescription className="text-center">
            Usa el teclado o los botones para escribir tus 4 números.
          </DialogDescription>
        </div>
        <input
          ref={inputRef}
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          aria-label="PIN de 4 números"
          aria-invalid={!!error}
          disabled={checking || !!who}
          value={pin}
          onChange={(event) => {
            setError("");
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          className="w-full rounded-xl border bg-background px-4 py-3 text-center font-display text-2xl tracking-[0.65em] outline-none focus:ring-2 focus:ring-ring"
        />
        <p
          role={error ? "alert" : "status"}
          className={cn(
            "min-h-10 text-center text-sm",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error || (checking ? "Verificando…" : "Tu PIN identifica a tu persona del hogar")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <Button
              key={digit}
              variant="secondary"
              disabled={checking || !!who}
              onClick={() => press(digit)}
              className="h-14 rounded-xl font-display text-xl"
            >
              {digit}
            </Button>
          ))}
          <span />
          <Button
            variant="secondary"
            disabled={checking || !!who}
            onClick={() => press("0")}
            className="h-14 rounded-xl font-display text-xl"
          >
            0
          </Button>
          <Button
            variant="ghost"
            disabled={checking || !!who}
            onClick={() => {
              setError("");
              setPin((value) => value.slice(0, -1));
              inputRef.current?.focus();
            }}
            aria-label="Borrar número"
            className="h-14 rounded-xl"
          >
            <Delete />
          </Button>
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Kiosk({
  compact,
  onUnlock,
  events = [],
  chores = [],
  timeFormat = "24",
}: {
  compact: boolean;
  onUnlock: (member: Member) => void;
  events?: FamilyEvent[];
  chores?: Chore[];
  timeFormat?: "12" | "24";
}) {
  const now = useClock();
  const [entering, setEntering] = useState(false);
  const next = now ? upcomingEvents(events, now) : [];
  const pending = now
    ? chores.filter((chore) => !chore.done && chore.dueDate === dateKey(now)).length
    : 0;
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] w-full overflow-hidden rounded-3xl text-primary-foreground">
      <img
        src={photo}
        alt=""
        aria-hidden="true"
        width={1600}
        height={1008}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/80" />
      <div
        className={cn(
          "relative flex min-h-[calc(100dvh-4rem)] flex-col justify-between gap-10",
          compact ? "p-6" : "p-12",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-white/15 px-4 py-2 font-display font-bold backdrop-blur-xl">
            {HOUSEHOLD.name}
          </span>
          <span className="flex items-center gap-2 text-sm text-white/80">
            <Lock className="size-4" /> Tablet del hogar
          </span>
        </div>
        <div>
          <p
            className={cn(
              "font-display font-extrabold leading-none tracking-[-0.06em] tabular drop-shadow-lg",
              compact ? "text-7xl" : "text-[clamp(6rem,15vw,12rem)]",
            )}
          >
            {now?.toLocaleTimeString("es", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: timeFormat === "12",
            }) ?? "--:--"}
          </p>
          <p className="mt-3 text-xl capitalize opacity-90">
            {now?.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) ??
              ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <section aria-label="Próximos eventos" className="min-w-0 flex-1 space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4" /> Próximos eventos
              {pending > 0 && (
                <span className="font-normal opacity-75">· {pending} tareas hoy</span>
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {next.map((event) => (
                <div
                  key={event.id}
                  className="min-w-0 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-xl"
                >
                  <p className="truncate font-semibold">{event.title}</p>
                  <p className="mt-1 text-xs opacity-80">{eventWhen(event)}</p>
                </div>
              ))}
            </div>
            {!next.length && <p className="text-sm text-white/70">No hay eventos próximos.</p>}
          </section>
          <Button
            onClick={() => setEntering(true)}
            size="lg"
            className="h-14 rounded-full bg-card px-6 text-foreground hover:bg-card/90"
          >
            <Lock className="mr-2 size-5" />
            Entrar con PIN
          </Button>
        </div>
      </div>
      {entering && <PinPad onCancel={() => setEntering(false)} onSuccess={onUnlock} />}
    </div>
  );
}
