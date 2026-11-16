import { useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ChefHat,
  Clock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRecipes } from "@/hooks/use-recipes";
import { useRecipePhotos } from "@/hooks/use-recipe-photos";
import { emptyRecipe, recipeError, type Recipe, type RecipeContent } from "@/lib/recipes";
import { RecipeEditor } from "./RecipeEditor";
import { RecipeImport } from "./RecipeImport";
import { RecipePhotos } from "./RecipePhotos";

type Draft = { id: string; revision: number; content: RecipeContent };
export function Recipes({
  canEdit = false,
  initialRecipeId,
  onRecipeChange,
  createRequest = 0,
}: {
  canEdit?: boolean;
  initialRecipeId?: string | undefined;
  onRecipeChange?: (id?: string, replace?: boolean) => void;
  createRequest?: number;
}) {
  const { recipes, loading, error, refresh, save, archive } = useRecipes();
  const [localId, setLocalId] = useState<string>();
  const selectedId = onRecipeChange ? initialRecipeId : localId;
  const select = (id?: string) => {
    if (onRecipeChange) onRecipeChange(id);
    else setLocalId(id);
  };
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<Recipe | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const archiveTitleId = useId();
  const running = useRef(false);
  const lastRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (createRequest && createRequest !== lastRequest.current && canEdit) {
      lastRequest.current = createRequest;
      setEditor({ id: crypto.randomUUID(), revision: 0, content: emptyRecipe() });
    }
  }, [createRequest, canEdit]);
  const normalize = (v: string) =>
    v.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  const visible = recipes.filter(
    (r) =>
      r.archived === (canEdit && archived) && normalize(r.content.name).includes(normalize(query)),
  );
  const { photos: covers } = useRecipePhotos(selectedId ? [] : visible.map((r) => r.id), true);
  const selected = recipes.find((r) => r.id === selectedId);
  const archiveSelected = async () => {
    if (!confirm || running.current) return;
    running.current = true;
    setBusy(true);
    setActionError("");
    try {
      await archive(confirm, !confirm.archived);
      if (mounted.current) {
        setConfirm(null);
        select();
      }
    } catch (reason) {
      if (mounted.current) setActionError(recipeError(reason));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-label="Recetario del hogar">
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-sm">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void refresh()}>
            Reintentar
          </button>
        </p>
      )}
      {loading ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Cargando recetas…
        </p>
      ) : selectedId ? (
        selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => select()}>
                <ArrowLeft />
                Recetas
              </Button>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {!selected.archived && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setEditor({
                          id: selected.id,
                          revision: selected.revision,
                          content: selected.content,
                        })
                      }
                    >
                      <Pencil />
                      Editar receta
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setConfirm(selected);
                      setActionError("");
                    }}
                  >
                    {selected.archived ? <RotateCcw /> : <Archive />}
                    {selected.archived ? "Restaurar receta" : "Archivar receta"}
                  </Button>
                </div>
              )}
            </div>
            <article className="space-y-6 rounded-3xl bg-card p-5 shadow-card sm:p-7">
              <header className="space-y-3">
                <h2 className="break-words font-display text-3xl font-bold">
                  {selected.content.name}
                </h2>
                {selected.content.description && (
                  <p className="whitespace-pre-wrap break-words text-muted-foreground">
                    {selected.content.description}
                  </p>
                )}
                <RecipeMeta content={selected.content} />
                {selected.archived && (
                  <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs">
                    Archivada
                  </span>
                )}
              </header>
              <RecipePhotos
                key={selected.id}
                recipeId={selected.id}
                canEdit={canEdit && !selected.archived}
              />
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <section aria-label="Ingredientes">
                  <h3 className="mb-3 font-display text-xl font-bold">Ingredientes</h3>
                  <ul className="divide-y">
                    {selected.content.ingredients.map((i, index) => (
                      <li key={index} className="flex justify-between gap-4 py-3">
                        <span className="min-w-0 break-words">{i.name}</span>
                        <span className="min-w-0 max-w-[45%] break-words whitespace-pre-wrap text-right font-medium">
                          {[i.quantity, i.unit].filter(Boolean).join(" ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label="Preparación">
                  <h3 className="mb-3 font-display text-xl font-bold">Preparación</h3>
                  <ol className="space-y-4">
                    {selected.content.steps.map((step, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lavender text-sm font-bold">
                          {index + 1}
                        </span>
                        <p className="min-w-0 whitespace-pre-wrap break-words leading-relaxed">
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <section
                aria-label="Nutrición por porción"
                className="rounded-2xl bg-secondary/70 p-4"
              >
                <h3 className="mb-3 font-display text-lg font-bold">Por porción</h3>
                <div className="grid grid-cols-2 gap-4">
                  <p>
                    <strong className="block font-display text-2xl">
                      {selected.content.nutrition.calories_kcal ?? "—"}
                    </strong>
                    <span className="text-sm">kcal</span>
                  </p>
                  <p>
                    <strong className="block font-display text-2xl">
                      {selected.content.nutrition.protein_g ?? "—"}
                    </strong>
                    <span className="text-sm">g de proteínas</span>
                  </p>
                </div>
                {(selected.content.nutrition.calories_kcal !== null ||
                  selected.content.nutrition.protein_g !== null) && (
                  <p className="mt-3 text-xs text-muted-foreground">Valores aproximados.</p>
                )}
              </section>
              {selected.content.source && (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  Fuente: {selected.content.source}
                </p>
              )}
            </article>
          </>
        ) : (
          <div className="space-y-3 rounded-3xl bg-card p-6">
            <p>Esta receta no está disponible.</p>
            <Button type="button" variant="outline" onClick={() => select()}>
              Volver a recetas
            </Button>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border bg-card px-4 py-3">
              <Search className="size-4 shrink-0" />
              <span className="sr-only">Buscar recetas</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar receta"
                maxLength={150}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            {canEdit && (
              <>
                <Button type="button" variant="outline" onClick={() => setImporting(true)}>
                  <Sparkles />
                  Con ChatGPT
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setEditor({ id: crypto.randomUUID(), revision: 0, content: emptyRecipe() })
                  }
                >
                  <Plus />
                  Nueva receta
                </Button>
              </>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={archived ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setArchived(false)}
              >
                Recetas
              </Button>
              <Button
                type="button"
                variant={archived ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setArchived(true)}
              >
                Archivadas
              </Button>
            </div>
          )}
          {visible.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((recipe) => {
                const image = covers.find((photo) => photo.recipe_id === recipe.id);
                return (
                  <button
                    type="button"
                    key={recipe.id}
                    onClick={() => select(recipe.id)}
                    className="group overflow-hidden rounded-3xl bg-card text-left shadow-card outline-none transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="grid aspect-[16/9] place-items-center overflow-hidden bg-secondary/70">
                      <RecipeCover url={image?.url ?? null} />
                    </div>
                    <div className="space-y-3 p-5">
                      <h2 className="break-words font-display text-xl font-bold">
                        {recipe.content.name}
                      </h2>
                      <RecipeMeta content={recipe.content} />
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {recipe.content.nutrition.calories_kcal !== null && (
                          <span>{recipe.content.nutrition.calories_kcal} kcal/porción</span>
                        )}
                        {recipe.content.nutrition.protein_g !== null && (
                          <span>{recipe.content.nutrition.protein_g} g proteína/porción</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid place-items-center gap-3 rounded-3xl bg-card px-5 py-14 text-center">
              <ChefHat className="size-12 text-primary/60" />
              <h2 className="font-display text-xl font-bold">
                {query
                  ? "No hay coincidencias"
                  : archived
                    ? "No hay recetas archivadas"
                    : "Tu recetario empieza aquí"}
              </h2>
              {canEdit && !query && !archived && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setEditor({ id: crypto.randomUUID(), revision: 0, content: emptyRecipe() })
                  }
                >
                  Añadir primera receta
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {editor && canEdit && (
        <RecipeEditor
          key={editor.id}
          initial={editor.content}
          creating={editor.revision === 0}
          onClose={() => setEditor(null)}
          onSave={async (content) => {
            const row = await save(editor.id, editor.revision, content);
            if (mounted.current) {
              setEditor((current) => (current?.id === editor.id ? null : current));
              select(row.id);
            }
          }}
        />
      )}
      {importing && canEdit && (
        <RecipeImport
          onClose={() => setImporting(false)}
          onImport={(content) => {
            setImporting(false);
            setEditor({ id: crypto.randomUUID(), revision: 0, content });
          }}
        />
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent aria-labelledby={archiveTitleId}>
          <AlertDialogHeader>
            <AlertDialogTitle id={archiveTitleId}>
              {confirm?.archived ? "¿Restaurar receta?" : "¿Archivar receta?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.archived
                ? "Volverá al recetario del hogar."
                : "Se conservará en Archivadas y dejará de aparecer en la pantalla bloqueada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={busy} onClick={() => void archiveSelected()}>
              {busy ? "Guardando…" : confirm?.archived ? "Restaurar" : "Archivar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RecipeMeta({ content }: { content: RecipeContent }) {
  const duration = (content.prep_minutes ?? 0) + (content.cook_minutes ?? 0);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Users className="size-4" />
        {content.servings} {content.servings === 1 ? "porción" : "porciones"}
      </span>
      {(content.prep_minutes !== null || content.cook_minutes !== null) && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" />
          {content.prep_minutes === null
            ? "Cocción · "
            : content.cook_minutes === null
              ? "Prep. · "
              : ""}
          {duration} min
        </span>
      )}
    </div>
  );
}

function RecipeCover({ url }: { url: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return url && url !== failed ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(url)}
    />
  ) : (
    <ChefHat aria-hidden="true" className="size-12 text-primary/60" />
  );
}
