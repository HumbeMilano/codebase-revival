import { Link } from "@tanstack/react-router";
import { PrivacyRequests } from "./PrivacyRequests";
import { useCallback, useEffect, useState } from "react";
import { Camera, LogOut, RefreshCw, Trash2, Unlink, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { clearFinanceAccess, db } from "@/lib/db";
import { personalPreferences } from "@/lib/account-validation";
import { PasskeySettings } from "./PasskeySettings";

const field = "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base";
export function PersonalProfile({
  onSaved,
  onHouseholdLeft,
  onSignOut,
}: {
  onSaved: () => void;
  onHouseholdLeft?: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [photo, setPhoto] = useState("");
  const [photoRetry, setPhotoRetry] = useState(0);
  const [view, setView] = useState<"auto" | "mobile" | "tablet">("auto");
  const [time, setTime] = useState<"12" | "24">("24");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Vuelve a entrar para cargar tu perfil.");
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profileError) throw new Error("No se pudo cargar tu perfil. Comprueba la conexión.");
      const prefs = personalPreferences.safeParse(data);
      if (!prefs.success) throw new Error("Tus preferencias no son válidas. Contacta con soporte.");
      setId(user.id);
      setView(prefs.data.preferred_view);
      setTime(prefs.data.time_format);
      setPath(data.avatar_path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar tu perfil.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!path) {
        setPhoto("");
        return;
      }
      try {
        const { data, error: imageError } = await supabase.storage
          .from("personal-avatars")
          .createSignedUrl(path, 3600);
        if (imageError || !data) throw imageError;
        if (active) setPhoto(data.signedUrl);
      } catch {
        if (active) {
          setPhoto("");
          setError("Tu foto no está disponible. Puedes volver a subirla o reintentar.");
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 50 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, photoRetry]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ preferred_view: view, time_format: time })
        .eq("id", id)
        .select("id")
        .single();
      if (saveError) throw saveError;
      toast.success("Preferencias guardadas");
      onSaved();
    } catch {
      setError("No se pudo guardar tu perfil. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!id || !file || busy) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Elige una imagen JPG, PNG o WebP de hasta 2 MB");
      return;
    }
    setBusy(true);
    setError("");
    const next = `${id}/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
    let uploaded = false;
    let attached = false;
    try {
      const { error: uploadError } = await supabase.storage
        .from("personal-avatars")
        .upload(next, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ avatar_path: next })
        .eq("id", id)
        .select("id")
        .single();
      if (saveError) throw saveError;
      attached = true;
      if (path) {
        const { error: removeError } = await supabase.storage
          .from("personal-avatars")
          .remove([path]);
        if (removeError)
          toast.warning("La foto se guardó, pero no se pudo eliminar el archivo privado anterior.");
      }
      setPath(next);
      window.dispatchEvent(new Event("homehub-avatars-changed"));
      toast.success("Foto actualizada");
      onSaved();
    } catch {
      if (uploaded && !attached)
        await supabase.storage
          .from("personal-avatars")
          .remove([next])
          .catch(() => undefined);
      setError("No se pudo actualizar la foto. Tu foto anterior se conserva.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!id || !path || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", id)
        .select("id")
        .single();
      if (saveError) throw saveError;
      const { error: removeError } = await supabase.storage.from("personal-avatars").remove([path]);
      setPath(null);
      setPhoto("");
      onSaved();
      window.dispatchEvent(new Event("homehub-avatars-changed"));
      if (removeError)
        toast.warning("La foto se quitó del perfil, pero no se pudo eliminar el archivo privado.");
      else toast.success("Foto eliminada");
    } catch {
      setError("No se pudo quitar la foto. Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    if (busy || !understood) return;
    const client = db();
    setBusy(true);
    setError("");
    try {
      await clearFinanceAccess();
      const { error: leaveError } = await client.rpc("leave_household");
      if (leaveError) {
        if (leaveError.message.includes("last adult"))
          throw new Error("Vincula otra cuenta adulta antes de desvincular la tuya del hogar.");
        throw leaveError;
      }
      setLeaving(false);
      toast.success("Tu cuenta se ha desvinculado del hogar");
      onHouseholdLeft?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo desvincular tu cuenta. Revisa la conexión.",
      );
      setLeaving(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-md space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || loading}
            onClick={() => {
              setPhotoRetry((attempt) => attempt + 1);
              void load();
            }}
            className="mt-2"
          >
            <RefreshCw className="size-4" />
            Reintentar
          </Button>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando perfil…
        </p>
      )}
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          {photo ? (
            <img
              src={photo}
              alt="Tu foto"
              onError={() => {
                setPhoto("");
                setError("No se pudo mostrar tu foto. Vuelve a cargar tu perfil.");
              }}
              className="size-20 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-20 place-items-center rounded-full bg-success">
              <UserRound className="size-8" />
            </span>
          )}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <Camera className="size-4" />
              Cambiar foto
              <input
                aria-label="Foto personal"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || !id}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void upload(file);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              JPG, PNG o WebP · hasta 2 MB · visible en tu hogar
            </p>
            {path && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void remove()}
                disabled={busy}
              >
                <Trash2 />
                Quitar foto
              </Button>
            )}
          </div>
        </div>
        <label className="block text-sm font-semibold">
          Vista preferida
          <select
            disabled={busy || !id}
            className={field}
            value={view}
            onChange={(event) =>
              setView(personalPreferences.shape.preferred_view.parse(event.target.value))
            }
          >
            <option value="auto">Automática</option>
            <option value="mobile">Móvil</option>
            <option value="tablet">Tablet</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Formato de hora
          <select
            disabled={busy || !id}
            className={field}
            value={time}
            onChange={(event) =>
              setTime(personalPreferences.shape.time_format.parse(event.target.value))
            }
          >
            <option value="24">24 horas</option>
            <option value="12">12 horas</option>
          </select>
        </label>
        <Button type="submit" disabled={busy || !id} className="w-full">
          {busy ? "Guardando…" : "Guardar preferencias"}
        </Button>
      </form>
      <Link to="/subscription" className="block rounded-2xl border bg-card p-4 font-semibold">
        Mi plan · Skendal
      </Link>
      <PrivacyRequests />
      <PasskeySettings />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => void onSignOut()}
      >
        <LogOut /> Cerrar sesión
      </Button>
      <section className="rounded-2xl border p-4">
        <h2 className="font-display font-semibold">Desvincular mi cuenta</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Puedes desvincular tu cuenta. Tus tareas, notas y aportes permanecen en el hogar para
          conservar su historial.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={busy || !id}
          onClick={() => {
            setUnderstood(false);
            setLeaving(true);
          }}
        >
          <Unlink />
          Desvincular mi cuenta
        </Button>
      </section>
      <AlertDialog
        open={leaving}
        onOpenChange={(open) => {
          if (!busy) {
            setLeaving(open);
            if (!open) setUnderstood(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular tu cuenta del hogar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu cuenta perderá el acceso a este hogar. Necesitarás una nueva invitación para
              volver. El historial del hogar se conserva. Para cerrar sesión y mantener tu acceso,
              cancela y utiliza «Cerrar sesión».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-0.5 size-4 shrink-0"
            />
            Entiendo que necesitaré una nueva invitación para volver.
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !understood}
              onClick={(event) => {
                event.preventDefault();
                void leave();
              }}
            >
              Desvincular mi cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
