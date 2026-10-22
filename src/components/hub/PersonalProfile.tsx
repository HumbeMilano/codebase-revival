import { useEffect, useState } from "react";
import { Camera, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { personalPreferences } from "@/lib/account-validation";

const field = "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base";
export function PersonalProfile({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [photo, setPhoto] = useState("");
  const [view, setView] = useState<"auto" | "mobile" | "tablet">("auto");
  const [time, setTime] = useState<"12" | "24">("24");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!active) return;
      if (error) { toast.error("No se pudo cargar tu perfil"); return; }
      setId(user.id);
      const prefs = personalPreferences.parse(data);
      setView(prefs.preferred_view); setTime(prefs.time_format); setPath(data.avatar_path);
      if (data.avatar_path) {
        const { data: image } = await supabase.storage.from("personal-avatars").createSignedUrl(data.avatar_path, 3600);
        if (active) setPhoto(image?.signedUrl ?? "");
      }
    })();
    return () => { active = false; };
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ preferred_view: view, time_format: time }).eq("id", id);
    setBusy(false);
    if (error) { toast.error("No se pudo guardar tu perfil"); return; }
    toast.success("Preferencias guardadas"); onSaved();
  };
  const upload = async (file: File | undefined) => {
    if (!id || !file || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("Elige una imagen JPG, PNG o WebP de hasta 2 MB"); return;
    }
    setBusy(true);
    const next = `${id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("personal-avatars").upload(next, file);
    if (error) { toast.error("No se pudo subir la foto"); setBusy(false); return; }
    const { error: saveError } = await supabase.from("profiles").update({ avatar_path: next }).eq("id", id);
    if (saveError) {
      await supabase.storage.from("personal-avatars").remove([next]);
      toast.error("No se pudo guardar la foto"); setBusy(false); return;
    }
    if (path) await supabase.storage.from("personal-avatars").remove([path]);
    const { data } = await supabase.storage.from("personal-avatars").createSignedUrl(next, 3600);
    setPhoto(data?.signedUrl ?? ""); setPath(next); setBusy(false); onSaved();
  };
  const remove = async () => {
    if (!id || !path || busy) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", id);
    if (!error) {
      await supabase.storage.from("personal-avatars").remove([path]);
      setPath(null); setPhoto(""); onSaved();
    } else toast.error("No se pudo quitar la foto");
    setBusy(false);
  };
  return <form onSubmit={save} className="mx-auto max-w-md space-y-5">
    <div className="flex items-center gap-4">
      {photo ? <img src={photo} alt="Tu foto" className="size-20 rounded-full object-cover" /> : <span className="grid size-20 place-items-center rounded-full bg-success"><UserRound className="size-8" /></span>}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Camera className="size-4" /> Cambiar foto<input aria-label="Foto personal" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !id} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} /></label>
        {path && <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}><Trash2 /> Quitar foto</Button>}
      </div>
    </div>
    <label className="block text-sm font-semibold">Vista preferida<select className={field} value={view} onChange={(e) => setView(personalPreferences.shape.preferred_view.parse(e.target.value))}><option value="auto">Automática</option><option value="mobile">Móvil</option><option value="tablet">Tablet</option></select></label>
    <label className="block text-sm font-semibold">Formato de hora<select className={field} value={time} onChange={(e) => setTime(personalPreferences.shape.time_format.parse(e.target.value))}><option value="24">24 horas</option><option value="12">12 horas</option></select></label>
    <Button type="submit" disabled={busy || !id} className="w-full">Guardar preferencias</Button>
  </form>;
}