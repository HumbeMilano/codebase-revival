import { useEffect, useState } from "react";
import { CloudSun, Delete, Lock, X } from "lucide-react";
import photo from "@/assets/kiosk-photo.jpg";
import { MEMBERS, memberBg, type Member } from "./data";
import { verifyPin } from "./hub.functions";
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
  const s = size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-7 text-xs" : "size-10 text-sm";
  return (
    <span className={cn("grid place-items-center rounded-full font-display font-bold text-foreground", s, memberBg[m.color])}>
      {m.name[0]}
    </span>
  );
}

/** PIN-only entry: the PIN itself identifies who is logging in (PINs are unique). Verified on the server. */
export async function findByPin(pin: string, adminOnly = false): Promise<Member | undefined> {
  const found = await verifyPin({ data: { pin, adminOnly } });
  if (!found) return undefined;
  const meta = MEMBERS.find((m) => m.id === found.id);
  return meta ? { ...meta, name: found.name, role: found.role } : undefined;
}

export function PinPad({
  title,
  adminOnly,
  onSuccess,
  onCancel,
}: {
  title?: string;
  adminOnly?: boolean;
  onSuccess: (m: Member) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [who, setWho] = useState<Member | null>(null);

  useEffect(() => {
    if (pin.length < 4) return;
    let active = true;
    setChecking(true);
    void findByPin(pin, adminOnly).then((m) => {
      if (!active) return;
      setChecking(false);
      if (m) {
        setWho(m);
        setTimeout(() => onSuccess(m), 350);
        return;
      }
      setError(true);
      setTimeout(() => { setPin(""); setError(false); }, 600);
    });
    return () => { active = false; };
  }, [pin, adminOnly, onSuccess]);

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-foreground/20 backdrop-blur-md animate-in fade-in">
      <div className="relative w-[300px] rounded-[2rem] bg-card p-6 shadow-card">
        {onCancel && <button onClick={onCancel} aria-label="Cerrar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </button>}
        <div className="flex flex-col items-center gap-2">
          {who ? <Avatar m={who} size="lg" /> : <span className="grid size-16 place-items-center rounded-full bg-secondary"><Lock className="size-6" /></span>}
          <p className="font-display text-lg font-semibold">{who ? `Hola, ${who.name}` : title ?? "Escribe tu PIN"}</p>
          <p className="text-xs text-muted-foreground">{error ? "PIN incorrecto" : checking ? "Verificando…" : "Tu PIN dice quién eres"}</p>
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
  const [entering, setEntering] = useState(false);
  const time = now?.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) ?? "--:--";
  const date = now?.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) ?? "";
  const next = [
    { t: "18:00", label: "Regar las plantas" },
    { t: "19:30", label: "Cena en familia" },
    { t: "Mañ.", label: "Revisión del coche" },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden text-primary-foreground">
      <img src={photo} alt="Foto familiar" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover animate-[kenburns_30s_ease-in-out_infinite_alternate]" />
      <div className="absolute inset-0 bg-gradient-to-b from-foreground/40 via-foreground/10 to-foreground/75" />

      <div className={cn("relative flex h-full flex-col justify-between", compact ? "p-5" : "p-10")}>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary-foreground/15 px-4 py-2 font-display text-sm font-bold backdrop-blur-xl">Familia Pérez</span>
          <span className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-sm font-semibold backdrop-blur-xl"><CloudSun className="size-4" /> 22° · Soleado</span>
        </div>

        <div>
          <p className={cn("font-display font-extrabold leading-[0.8] tracking-[-0.07em] tabular drop-shadow-lg", compact ? "text-[6.5rem]" : "text-[13rem]")}>{time}</p>
          <p className={cn("mt-2 font-display font-semibold first-letter:uppercase opacity-90", compact ? "text-xl" : "text-3xl")}>{date}</p>
        </div>

        <div className={cn("flex gap-3", compact ? "flex-col" : "items-end justify-between")}>
          <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-3")}>
            {next.map((n) => (
              <div key={n.label} className="rounded-2xl bg-primary-foreground/15 px-4 py-3 backdrop-blur-xl">
                <p className="truncate text-sm font-semibold"><span className="mr-2 font-display font-bold tabular opacity-70">{n.t}</span>{n.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setEntering(true)} className="flex shrink-0 items-center justify-between gap-3 rounded-full bg-card p-2 pl-6 text-foreground shadow-card transition active:scale-95">
            <span className="font-display font-bold">Entrar con PIN</span>
            <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><Lock className="size-5" /></span>
          </button>
        </div>
      </div>
      {entering && <PinPad onCancel={() => setEntering(false)} onSuccess={onUnlock} />}
    </div>
  );
}
