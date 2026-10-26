import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Delete,
  Lock,
  Pause,
  Play,
  LoaderCircle,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudMoon,
  Moon,
  Sun,
} from "lucide-react";
import { HOUSEHOLD, MEMBERS, memberBg, type Chore, type Member } from "./data";
import { db, isDeviceMode, setFinanceToken } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dateKey, eventWhen, upcomingEvents, type FamilyEvent } from "./planner-data";
import { useHouseholdPhotos } from "@/lib/household-photos";
import { useKioskWeather } from "@/hooks/use-kiosk-weather";
import { weatherDescription } from "@/lib/weather";
import { useMemberAvatar } from "@/lib/member-avatars";

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
  const photo = useMemberAvatar(m.id);
  const [failed, setFailed] = useState<string>();
  const classes =
    size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-7 text-xs" : "size-10 text-sm";
  return (
    <span
      aria-label={m.name}
      role="img"
      data-member-avatar={m.id}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-bold text-foreground",
        classes,
        memberBg[m.color] ?? "bg-secondary",
      )}
    >
      {photo && photo !== failed ? (
        <img
          src={photo}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setFailed(photo)}
          className="absolute inset-0 size-full object-cover object-center"
        />
      ) : (
        (m.name.trim()[0]?.toLocaleUpperCase() ?? "?")
      )}
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
  const inputRef = useRef<HTMLDivElement>(null);
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
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || checking || who) return;
          const key = event.key;
          if (/^[0-9]$/.test(key)) {
            event.preventDefault();
            press(key);
          } else if (key === "Backspace" || key === "Delete") {
            event.preventDefault();
            setError("");
            setPin((value) => (key === "Delete" ? "" : value.slice(0, -1)));
          }
        }}
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
          <DialogDescription className="sr-only">
            Introduce tu PIN de cuatro números.
          </DialogDescription>
        </div>
        <div
          ref={inputRef}
          role="group"
          tabIndex={0}
          aria-label="PIN de 4 números"
          aria-disabled={checking || !!who}
          className="flex w-full justify-center gap-4 rounded-xl border bg-background px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="sr-only" aria-live="polite">
            {pin.length} de 4 números ingresados
          </span>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                "size-3.5 rounded-full border-2 border-primary",
                index < pin.length && "bg-primary",
              )}
            />
          ))}
        </div>
        <p
          role={error ? "alert" : "status"}
          className={cn(
            "min-h-10 text-center text-sm",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error || (checking ? "Verificando…" : "")}
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

function LockWeather() {
  const { weather, error } = useKioskWeather();
  if (!weather)
    return (
      <span className="kiosk-weather-pending">
        {error ? "Clima no disponible" : "Cargando clima…"}
      </span>
    );
  const { label, kind, night } = weatherDescription(weather.symbol);
  const Icon =
    kind === "clear"
      ? night
        ? Moon
        : Sun
      : kind === "partly-cloudy"
        ? night
          ? CloudMoon
          : CloudSun
        : kind === "rain"
          ? CloudRain
          : kind === "snow"
            ? CloudSnow
            : kind === "storm"
              ? CloudLightning
              : kind === "fog"
                ? CloudFog
                : Cloud;
  return (
    <section
      className="kiosk-weather"
      aria-label={weather.location ? `Clima cerca de ${weather.location}` : "Clima local"}
    >
      <div>
        <Icon aria-hidden="true" />
        <strong>{Math.round(weather.temperature)}°C</strong>
        <span>{label}</span>
      </div>
      {weather.location && <span className="kiosk-weather-location">{weather.location}</span>}
      <span className="kiosk-weather-credit">
        <a
          href="https://www.met.no/en/free-meteorological-data"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto"
          title="Pronóstico de MET Norway, temperatura redondeada y descripción traducida"
        >
          MET Norway
        </a>{" "}
        ·{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto"
        >
          CC BY 4.0
        </a>
      </span>
    </section>
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
  const [stage, setStage] = useState<"photos" | "info" | "pin">("photos");
  const [interaction, setInteraction] = useState(0);
  const { photos, loading, error, refresh } = useHouseholdPhotos();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const shown = photos.length ? photos[photoIndex % photos.length] : null;
  useEffect(() => {
    if (
      photos.length < 2 ||
      paused ||
      stage === "pin" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden")
        setPhotoIndex((index) => (index + 1) % photos.length);
    }, 20_000);
    return () => clearInterval(timer);
  }, [photos.length, paused, stage]);
  useEffect(() => {
    if (stage !== "info") return;
    const timer = setTimeout(() => setStage("photos"), 10_000);
    return () => clearTimeout(timer);
  }, [stage, interaction]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden")
        setStage((current) => (current === "info" ? "photos" : current));
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const next = now ? upcomingEvents(events, now) : [];
  const pending = now
    ? chores.filter((chore) => !chore.done && chore.dueDate === dateKey(now)).length
    : 0;
  const parts = now
    ? new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat === "12",
      }).formatToParts(now)
    : [];
  const clock =
    parts
      .filter((part) => part.type !== "dayPeriod")
      .map((part) => part.value)
      .join("")
      .trim() || "--:--";
  const period = parts.find((part) => part.type === "dayPeriod")?.value;
  return (
    <div
      className={cn("kiosk-screen", compact && "kiosk-compact")}
      data-testid="tablet-lock-screen"
      data-stage={stage}
    >
      <div className="kiosk-photo-layers" aria-hidden="true">
        {shown && (
          <div
            key={shown.id}
            className="kiosk-photo-frame motion-safe:animate-in motion-safe:fade-in"
            data-photo-id={shown.id}
          >
            <img
              src={shown.url}
              alt=""
              className="kiosk-photo-backdrop"
              data-testid="lock-photo-backdrop"
              draggable={false}
            />
            <img
              src={shown.url}
              alt=""
              className="kiosk-photo-full"
              data-testid="lock-photo"
              draggable={false}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        className="kiosk-surface"
        aria-label={stage === "photos" ? "Mostrar información" : "Entrar con PIN"}
        onClick={() => setStage(stage === "photos" ? "info" : "pin")}
        tabIndex={stage === "pin" ? -1 : 0}
      />
      {loading && !shown && (
        <LoaderCircle
          aria-label="Cargando fotos"
          role="status"
          className="kiosk-photo-loading animate-spin motion-reduce:animate-none"
        />
      )}
      <div
        className="kiosk-info"
        hidden={stage === "photos"}
        aria-hidden={stage === "photos" || undefined}
      >
        <div className="kiosk-info-top">
          <span className="kiosk-household">{HOUSEHOLD.name}</span>
          {photos.length > 1 && (
            <button
              type="button"
              className="kiosk-photo-control"
              aria-label={paused ? "Reanudar fotos" : "Pausar fotos"}
              onClick={() => {
                setPaused((value) => !value);
                setInteraction((value) => value + 1);
              }}
            >
              {paused ? <Play /> : <Pause />}
            </button>
          )}
        </div>
        <div className="kiosk-info-middle">
          <div>
            <p className="kiosk-time">
              <span>{clock}</span>
              {period && <small>{period}</small>}
            </p>
            <p className="kiosk-date">
              {now?.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <LockWeather />
        </div>
        <div className="kiosk-info-bottom">
          <section aria-label="Próximos eventos" className="kiosk-agenda">
            <p className="kiosk-agenda-title">
              <CalendarDays /> Próximos eventos{pending > 0 && <span> · {pending} tareas hoy</span>}
            </p>
            <div className="kiosk-agenda-items">
              {next.map((event) => (
                <div key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{eventWhen(event)}</span>
                </div>
              ))}
            </div>
            {!next.length && <p className="text-sm text-white/70">No hay eventos próximos.</p>}
          </section>
          <span className="kiosk-pin-cue">
            <Lock />
            Entrar con PIN
          </span>
        </div>
        {photos.length > 1 && (
          <div className="kiosk-photo-dots" aria-label="Fotos del hogar">
            {photos.map((item, index) => (
              <button
                type="button"
                key={item.id}
                aria-label={`Mostrar foto ${index + 1}`}
                aria-pressed={shown?.id === item.id}
                onClick={() => {
                  setPhotoIndex(index);
                  setInteraction((value) => value + 1);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {error && (
        <button
          type="button"
          className="kiosk-photo-error"
          onClick={() => {
            refresh();
            setInteraction((value) => value + 1);
          }}
        >
          Reintentar fotos
        </button>
      )}
      {stage === "pin" && <PinPad onCancel={() => setStage("photos")} onSuccess={onUnlock} />}
    </div>
  );
}
