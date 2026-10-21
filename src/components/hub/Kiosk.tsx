import { useEffect, useState } from "react";
import { CloudSun, Delete, Lock, X } from "lucide-react";
import photo from "@/assets/kiosk-photo.jpg";
import { MEMBERS, memberBg, type Member } from "./data";
import { cn } from "@/lib/utils";

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Avatar({ m, size = "md" }: { m: Member; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-20 text-2xl" : size === "sm" ? "size-7 text-xs" : "size-10 text-sm";
  return (
    <span className={cn("grid place-items-center rounded-full font-display font-bold text-background", s, memberBg[m.color])}>
      {m.name[0]}
    </span>
  );
}

export function PinPad({
  member,
  title,
  onSuccess,
  onCancel,
}: {
  member: Member;
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length < 4) return;
    if (pin === member.pin) onSuccess();
    else {
      setError(true);
      setTimeout(() => {
        setPin("");
        setError(false);
      }, 600);
    }
  }, [pin, member, onSuccess]);

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 backdrop-blur-xl animate-in fade-in">
      <div className="relative w-[300px] rounded-3xl border bg-card p-6 shadow-card">
        <button onClick={onCancel} aria-label="Cerrar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </button>
        <div className="flex flex-col items-center gap-2">
          <Avatar m={member} size="lg" />
          <p className="font-display text-lg font-semibold">{title ?? `Hola, ${member.name}`}</p>
          <p className="text-xs text-muted-foreground">PIN demo: {member.pin}</p>
        </div>
        <div className={cn("my-5 flex justify-center gap-3", error && "animate-[shake_0.4s]")}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 transition-colors",
                error ? "border-destructive bg-destructive" : i < pin.length ? "border-primary bg-primary" : "border-muted-foreground/40",
              )}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => press(d)} className="h-14 rounded-2xl bg-secondary font-display text-xl font-semibold transition active:scale-95 hover:bg-muted">
              {d}
            </button>
          ))}
          <span />
          <button onClick={() => press("0")} className="h-14 rounded-2xl bg-secondary font-display text-xl font-semibold transition active:scale-95 hover:bg-muted">
            0
          </button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Borrar" className="grid h-14 place-items-center rounded-2xl text-muted-foreground transition active:scale-95 hover:bg-secondary">
            <Delete className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Kiosk({ compact, onUnlock }: { compact: boolean; onUnlock: (m: Member) => void }) {
  const now = useClock();
  const [picked, setPicked] = useState<Member | null>(null);
  const time = now?.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) ?? "--:--";
  const date = now?.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) ?? "";

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img src={photo} alt="Foto familiar" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover animate-[kenburns_30s_ease-in-out_infinite_alternate]" />
      <div className="absolute inset-0 bg-scrim" />
      <div className={cn("relative flex h-full flex-col justify-between", compact ? "p-6" : "p-10")}>
        <div className="flex items-center justify-between text-sm text-foreground/80">
          <span className="font-display font-semibold tracking-wide">Familia Pérez</span>
          <span className="flex items-center gap-2 rounded-full bg-surface-glass px-3 py-1.5 backdrop-blur-md">
            <CloudSun className="size-4 text-accent" /> 22° Soleado
          </span>
        </div>

        <div>
          <p className={cn("font-display font-bold leading-none tracking-tighter tabular", compact ? "text-7xl" : "text-[9rem]")}>{time}</p>
          <p className="mt-2 text-lg capitalize text-foreground/80">{date}</p>
        </div>

        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-foreground/70">
            <Lock className="size-4" /> ¿Quién está aquí? Toca tu foto
          </p>
          <div className={cn("grid gap-3", compact ? "grid-cols-4" : "grid-cols-4 max-w-2xl")}>
            {MEMBERS.map((m) => (
              <button
                key={m.id}
                onClick={() => setPicked(m)}
                className="flex flex-col items-center gap-2 rounded-2xl border bg-surface-glass p-3 backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-glow active:scale-95"
              >
                <Avatar m={m} size={compact ? "md" : "lg"} />
                <span className="text-sm font-semibold">{m.name}</span>
                {!compact && <span className="text-[11px] text-muted-foreground">{m.role === "admin" ? "Adulto" : "Miembro"}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {picked && <PinPad member={picked} onCancel={() => setPicked(null)} onSuccess={() => onUnlock(picked)} />}
    </div>
  );
}
