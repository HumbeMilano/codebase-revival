import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const minutes = z.number().int().min(0).max(10080).nullable().default(null);
export const recipeContentSchema = z
  .object({
    version: z.literal(1),
    name: text(150).min(1, "Escribe el nombre de la receta."),
    description: text(2000).default(""),
    servings: z.number().int().min(1).max(1000),
    prep_minutes: minutes,
    cook_minutes: minutes,
    ingredients: z
      .array(
        z
          .object({
            name: text(200).min(1, "Completa el nombre de cada ingrediente."),
            quantity: text(80).default(""),
            unit: text(40).default(""),
          })
          .strict(),
      )
      .min(1, "Añade al menos un ingrediente.")
      .max(100),
    steps: z
      .array(text(3000).min(1, "Completa cada paso de la preparación."))
      .min(1, "Añade al menos un paso.")
      .max(60),
    nutrition: z
      .object({
        calories_kcal: z.number().min(0).max(100000).nullable().default(null),
        protein_g: z.number().min(0).max(10000).nullable().default(null),
      })
      .strict()
      .default({ calories_kcal: null, protein_g: null }),
    source: text(500).default(""),
  })
  .strict();
export type RecipeContent = z.infer<typeof recipeContentSchema>;
export const recipeRowSchema = z.object({
  id: z.uuid(),
  household_id: z.uuid(),
  content: recipeContentSchema,
  archived: z.boolean(),
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Recipe = z.infer<typeof recipeRowSchema>;
export type RecipePhoto = {
  id: string;
  recipe_id: string;
  path: string;
  position: number;
  url: string | null;
};

export function emptyRecipe(): RecipeContent {
  return {
    version: 1,
    name: "",
    description: "",
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    ingredients: [{ name: "", quantity: "", unit: "" }],
    steps: [""],
    nutrition: { calories_kcal: null, protein_g: null },
    source: "",
  };
}

export const RECIPE_CHATGPT_PROMPT = `Prepara la receta que te describiré para importarla en Skendal.
Devuelve únicamente un objeto JSON válido, sin comentarios ni texto antes o después, con esta estructura exacta:
{
  "version": 1,
  "name": "Nombre de la receta",
  "description": "Descripción breve",
  "servings": 4,
  "prep_minutes": 15,
  "cook_minutes": 25,
  "ingredients": [
    { "name": "Nombre del ingrediente", "quantity": "200", "unit": "g" }
  ],
  "steps": ["Primer paso completo", "Segundo paso completo"],
  "nutrition": { "calories_kcal": 450, "protein_g": 30 },
  "source": ""
}
Los ingredientes y sus cantidades corresponden a TODA la receta para el número de porciones indicado. Las calorías (kcal) y proteínas (gramos) son ESTIMACIONES POR UNA PORCIÓN, no del total. Usa números para porciones, minutos y nutrición; quantity y unit son texto y admiten fracciones. Si no puedes estimar un valor nutricional o tiempo, usa null, nunca inventes precisión. Explica cada paso de forma clara. No incluyas imágenes, URLs de imágenes, HTML ni campos adicionales. Las fotos las subiré después. No copies textos protegidos; si adaptas una fuente que te proporcione, indica su atribución en source. Redacta en español salvo que te pida otro idioma.

La receta que quiero es: [ESCRIBE AQUÍ TU IDEA, PORCIONES Y PREFERENCIAS].`;

/** Only structured data becomes an editable draft. No remote URLs or markup run. */
export function importRecipe(value: string): RecipeContent {
  if (new TextEncoder().encode(value).length > 65536)
    throw new Error("La respuesta es demasiado larga. Importa una receta cada vez.");
  const trimmed = value.trim();
  const json = trimmed.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new Error("Pega el JSON completo que generó ChatGPT.");
  }
  const parsed = recipeContentSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".");
    throw new Error(`Revisa ${path || "el formato"} de la receta. Usa la plantilla de Skendal.`);
  }
  return parsed.data;
}

export function recipeError(reason: unknown): string {
  const error = reason as { code?: string; message?: string } | null;
  if (error?.code === "54000")
    return "El recetario alcanzó el límite de 200 recetas de esta versión. Conservamos tu borrador.";
  if (error?.code === "40001")
    return "Esta receta cambió en otro dispositivo. Conservamos tu borrador; abre la versión actual antes de volver a editar.";
  if (error?.code === "42501") return "Tu acceso cambió. Abre de nuevo el hogar para continuar.";
  return "No se pudo confirmar el cambio. Conservamos tu borrador; comprueba la conexión y reintenta.";
}
