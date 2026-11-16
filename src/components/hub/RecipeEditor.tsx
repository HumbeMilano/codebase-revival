import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { recipeContentSchema, recipeError, type RecipeContent } from "@/lib/recipes";

const field =
  "block w-full min-w-0 rounded-xl border bg-secondary/60 px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function RecipeEditor({
  initial,
  onSave,
  onClose,
  creating = false,
}: {
  initial: RecipeContent;
  onSave: (recipe: RecipeContent) => Promise<void>;
  onClose: () => void;
  creating?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const titleId = useId(),
    discardTitleId = useId();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, busy]);
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const update = <K extends keyof RecipeContent>(key: K, next: RecipeContent[K]) =>
    setValue((v) => ({ ...v, [key]: next }));
  const number = (input: string) => (input.trim() ? Number(input) : null);
  const save = async () => {
    if (running.current) return;
    const parsed = recipeContentSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos de la receta.");
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(parsed.data);
    } catch (reason) {
      if (mounted.current) setError(recipeError(reason));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          aria-labelledby={titleId}
          aria-describedby={undefined}
          className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-2xl flex-col overflow-hidden rounded-3xl p-4 sm:p-6"
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogTitle id={titleId} className="shrink-0 pr-8 font-display text-xl font-bold">
            {creating ? "Nueva receta" : "Editar receta"}
          </DialogTitle>
          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset
              disabled={busy}
              className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-0.5 pb-1"
            >
              <label className="block space-y-1 text-sm font-medium">
                Nombre
                <input
                  autoFocus
                  required
                  maxLength={150}
                  value={value.name}
                  onChange={(e) => update("name", e.target.value)}
                  className={field}
                />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Descripción
                <textarea
                  aria-label="Descripción"
                  maxLength={2000}
                  rows={2}
                  value={value.description}
                  onChange={(e) => update("description", e.target.value)}
                  className={field}
                />
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <label className="block min-w-0 space-y-1 text-sm font-medium">
                  Porciones
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={value.servings || ""}
                    onChange={(e) => update("servings", Number(e.target.value))}
                    className={field}
                  />
                </label>
                <label className="block min-w-0 space-y-1 text-sm font-medium">
                  Preparación (min)
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    value={value.prep_minutes ?? ""}
                    onChange={(e) => update("prep_minutes", number(e.target.value))}
                    className={field}
                  />
                </label>
                <label className="block min-w-0 space-y-1 text-sm font-medium">
                  Cocción (min)
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    value={value.cook_minutes ?? ""}
                    onChange={(e) => update("cook_minutes", number(e.target.value))}
                    className={field}
                  />
                </label>
              </div>
              <section className="space-y-3" aria-label="Ingredientes de la receta">
                <h3 className="font-display text-lg font-bold">Ingredientes</h3>
                {value.ingredients.map((ingredient, index) => (
                  <div key={index} className="space-y-2 rounded-2xl border p-3">
                    <div className="flex items-center gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">Ingrediente {index + 1}</span>
                        <input
                          required
                          maxLength={200}
                          placeholder="Ingrediente"
                          value={ingredient.name}
                          onChange={(e) =>
                            update(
                              "ingredients",
                              value.ingredients.map((i, n) =>
                                n === index ? { ...i, name: e.target.value } : i,
                              ),
                            )
                          }
                          className={field}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar ingrediente ${index + 1}`}
                        disabled={value.ingredients.length === 1}
                        onClick={() =>
                          update(
                            "ingredients",
                            value.ingredients.filter((_, n) => n !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="min-w-0">
                        <span className="sr-only">Cantidad {index + 1}</span>
                        <input
                          maxLength={80}
                          placeholder="Cantidad · ej. 1/2"
                          value={ingredient.quantity}
                          onChange={(e) =>
                            update(
                              "ingredients",
                              value.ingredients.map((i, n) =>
                                n === index ? { ...i, quantity: e.target.value } : i,
                              ),
                            )
                          }
                          className={field}
                        />
                      </label>
                      <label className="min-w-0">
                        <span className="sr-only">Unidad {index + 1}</span>
                        <input
                          maxLength={40}
                          placeholder="Unidad · ej. taza"
                          value={ingredient.unit}
                          onChange={(e) =>
                            update(
                              "ingredients",
                              value.ingredients.map((i, n) =>
                                n === index ? { ...i, unit: e.target.value } : i,
                              ),
                            )
                          }
                          className={field}
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={value.ingredients.length >= 100}
                  onClick={() =>
                    update("ingredients", [
                      ...value.ingredients,
                      { name: "", quantity: "", unit: "" },
                    ])
                  }
                >
                  <Plus />
                  Ingrediente
                </Button>
              </section>
              <section className="space-y-3" aria-label="Preparación de la receta">
                <h3 className="font-display text-lg font-bold">Preparación</h3>
                {value.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-3 text-sm font-bold">
                      {index + 1}.
                    </span>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Paso {index + 1}</span>
                      <textarea
                        aria-label={`Paso ${index + 1}`}
                        rows={3}
                        required
                        maxLength={3000}
                        value={step}
                        onChange={(e) =>
                          update(
                            "steps",
                            value.steps.map((s, n) => (n === index ? e.target.value : s)),
                          )
                        }
                        className={field}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar paso ${index + 1}`}
                      disabled={value.steps.length === 1}
                      onClick={() =>
                        update(
                          "steps",
                          value.steps.filter((_, n) => n !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={value.steps.length >= 60}
                  onClick={() => update("steps", [...value.steps, ""])}
                >
                  <Plus />
                  Paso
                </Button>
              </section>
              <section className="space-y-2">
                <h3 className="font-display text-lg font-bold">Nutrición por porción</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="min-w-0 space-y-1 text-sm font-medium">
                    Calorías (kcal)
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step="any"
                      value={value.nutrition.calories_kcal ?? ""}
                      onChange={(e) =>
                        update("nutrition", {
                          ...value.nutrition,
                          calories_kcal: number(e.target.value),
                        })
                      }
                      className={field}
                    />
                  </label>
                  <label className="min-w-0 space-y-1 text-sm font-medium">
                    Proteínas (g)
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step="any"
                      value={value.nutrition.protein_g ?? ""}
                      onChange={(e) =>
                        update("nutrition", {
                          ...value.nutrition,
                          protein_g: number(e.target.value),
                        })
                      }
                      className={field}
                    />
                  </label>
                </div>
              </section>
              <label className="block space-y-1 text-sm font-medium">
                Fuente o atribución
                <input
                  maxLength={500}
                  value={value.source}
                  onChange={(e) => update("source", e.target.value)}
                  className={field}
                />
              </label>
            </fieldset>
            {error && (
              <p role="alert" className="shrink-0 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar receta"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent aria-labelledby={discardTitleId}>
          <AlertDialogHeader>
            <AlertDialogTitle id={discardTitleId}>¿Descartar el borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios de esta receta aún no se guardaron.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
