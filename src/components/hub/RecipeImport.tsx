import { useId, useState } from "react";
import { Copy, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importRecipe, RECIPE_CHATGPT_PROMPT, type RecipeContent } from "@/lib/recipes";

export function RecipeImport({
  onImport,
  onClose,
}: {
  onImport: (recipe: RecipeContent) => void;
  onClose: () => void;
}) {
  const [response, setResponse] = useState("");
  const titleId = useId();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const parse = () => {
    try {
      onImport(importRecipe(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Revisa el formato de la receta.");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl flex-col rounded-3xl"
        aria-describedby="recipe-import-description"
      >
        <DialogHeader>
          <DialogTitle id={titleId}>Crear con ChatGPT</DialogTitle>
          <DialogDescription id="recipe-import-description">
            Copia las instrucciones, añade tu idea en ChatGPT y pega aquí su respuesta.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(RECIPE_CHATGPT_PROMPT);
                  setCopied(true);
                } catch {
                  setError("No se pudo copiar. Abre la plantilla y copia su texto.");
                }
              })();
            }}
          >
            <Copy />
            {copied ? "Instrucciones copiadas" : "Copiar instrucciones para ChatGPT"}
          </Button>
          <details className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer">Ver plantilla</summary>
            <pre className="mt-3 select-text whitespace-pre-wrap break-words font-sans text-sm">
              {RECIPE_CHATGPT_PROMPT}
            </pre>
          </details>
          <label className="block space-y-2">
            <span className="font-medium">Respuesta de ChatGPT</span>
            <textarea
              aria-label="Respuesta de ChatGPT"
              value={response}
              onChange={(e) => {
                setResponse(e.target.value);
                setError("");
              }}
              rows={9}
              maxLength={65536}
              placeholder={'{ "version": 1, "name": "…", … }'}
              className="w-full rounded-xl border bg-secondary/60 p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <FileUp className="size-4" />
            <span>O elegir archivo JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 65536) {
                  setError("El archivo es demasiado grande. Importa una receta cada vez.");
                  return;
                }
                void file
                  .text()
                  .then((value) => {
                    setResponse(value);
                    setError("");
                  })
                  .catch(() => setError("No se pudo abrir el archivo."));
              }}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!response.trim()} onClick={parse}>
            Revisar receta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
