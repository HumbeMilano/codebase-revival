import { useId, useRef, useState } from "react";
import { Delete, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Choosing a household PIN is not an account credential form. Keep its digits
 * in memory behind buttons, without password/text/hidden inputs for autofill. */
export function PinEditor({
  label,
  value,
  onChange,
  disabled = false,
  optional = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  optional?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const labelId = useId();
  const statusId = useId();
  const group = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setDraft("");
  };
  const press = (digit: string) => {
    if (disabled) return;
    setDraft((current) => (current + digit).slice(0, 4));
    group.current?.focus();
  };
  return (
    <div className={cn("space-y-1", className)}>
      <span id={labelId} className="text-sm font-semibold">
        {label}
      </span>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setDraft("");
          setOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-labelledby={labelId}
            aria-describedby={statusId}
            className="h-12 w-full justify-between rounded-xl bg-background px-3"
          >
            <span aria-hidden="true" className="tracking-[0.4em]">
              {value ? "••••" : "— — — —"}
            </span>
            <span id={statusId} className="sr-only">
              {value ? "4 números configurados" : "Sin configurar"}
            </span>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-xs rounded-3xl bg-card p-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            group.current?.focus();
          }}
          onKeyDown={(event) => {
            if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
            if (/^[0-9]$/.test(event.key)) {
              event.preventDefault();
              press(event.key);
            } else if (event.key === "Backspace" || event.key === "Delete") {
              event.preventDefault();
              const key = event.key;
              setDraft((current) => (key === "Delete" ? "" : current.slice(0, -1)));
            }
          }}
        >
          <DialogTitle className="text-center font-display text-xl">{label}</DialogTitle>
          <DialogDescription className="sr-only">Elige un PIN de cuatro números.</DialogDescription>
          <div
            ref={group}
            role="group"
            tabIndex={0}
            aria-label="PIN de 4 números"
            aria-disabled={disabled}
            className="flex justify-center gap-4 rounded-xl border bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="sr-only" aria-live="polite">
              {draft.length} de 4 números ingresados
            </span>
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                aria-hidden="true"
                className={cn(
                  "size-3.5 rounded-full border-2 border-primary",
                  index < draft.length && "bg-primary",
                )}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <Button
                type="button"
                key={digit}
                disabled={disabled}
                variant="secondary"
                className="h-12 rounded-xl text-xl"
                onClick={() => press(digit)}
              >
                {digit}
              </Button>
            ))}
            <span />
            <Button
              type="button"
              disabled={disabled}
              variant="secondary"
              className="h-12 rounded-xl text-xl"
              onClick={() => press("0")}
            >
              0
            </Button>
            <Button
              type="button"
              disabled={disabled}
              variant="ghost"
              className="h-12 rounded-xl"
              aria-label="Borrar número"
              onClick={() => {
                setDraft((current) => current.slice(0, -1));
                group.current?.focus();
              }}
            >
              <Delete />
            </Button>
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={disabled || draft.length !== 4}
              onClick={() => {
                onChange(draft);
                close();
              }}
            >
              Usar PIN
            </Button>
          </div>
          {optional && value && (
            <Button
              type="button"
              disabled={disabled}
              variant="ghost"
              onClick={() => {
                onChange("");
                close();
              }}
            >
              Mantener PIN actual
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
