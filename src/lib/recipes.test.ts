import { describe, expect, it } from "vitest";
import { emptyRecipe, importRecipe, recipeContentSchema, RECIPE_CHATGPT_PROMPT } from "./recipes";

const content = () => ({
  ...emptyRecipe(),
  name: "Picadillo",
  ingredients: [{ name: "Carne", quantity: "1/2", unit: "kg" }],
  steps: ["Cocinar la carne."],
  nutrition: { calories_kcal: 450, protein_g: 30 },
});
describe("recipe interchange", () => {
  it("accepts plain and fenced ChatGPT JSON as a draft without changing portion nutrition", () => {
    for (const input of [
      JSON.stringify(content()),
      "```json\n" + JSON.stringify(content()) + "\n```",
    ]) {
      const parsed = importRecipe(input);
      expect(parsed).toEqual(content());
      expect(parsed.ingredients[0]?.quantity).toBe("1/2");
      expect(parsed.nutrition.calories_kcal).toBe(450);
    }
  });
  it("keeps unknown nutrition null instead of pretending it has zero calories or protein", () => {
    const value = { ...content(), nutrition: { calories_kcal: null, protein_g: null } };
    expect(importRecipe(JSON.stringify(value)).nutrition).toEqual({
      calories_kcal: null,
      protein_g: null,
    });
  });
  it("rejects incomplete text, unsupported versions, image URLs and extra nested fields", () => {
    for (const input of [
      "Aquí está la receta",
      JSON.stringify({ ...content(), version: 2 }),
      JSON.stringify({ ...content(), photos: ["https://untrusted.invalid/x.jpg"] }),
      JSON.stringify({ ...content(), nutrition: { ...content().nutrition, basis: "total" } }),
      JSON.stringify({ ...content(), ingredients: [] }),
      JSON.stringify({ ...content(), steps: [""] }),
    ])
      expect(() => importRecipe(input)).toThrow();
  });
  it("rejects negative nutrition and non-integer or missing portions", () => {
    for (const value of [
      { ...content(), servings: 0 },
      { ...content(), servings: 1.5 },
      { ...content(), nutrition: { calories_kcal: -1, protein_g: 30 } },
      { ...content(), prep_minutes: -2 },
    ])
      expect(recipeContentSchema.safeParse(value).success).toBe(false);
  });
  it("bounds actual UTF-8 bytes as well as list and field sizes", () => {
    expect(() => importRecipe("🙂".repeat(17000))).toThrow("demasiado larga");
    expect(
      recipeContentSchema.safeParse({
        ...content(),
        ingredients: Array.from({ length: 101 }, () => content().ingredients[0]),
      }).success,
    ).toBe(false);
    expect(recipeContentSchema.safeParse({ ...content(), steps: ["x".repeat(3001)] }).success).toBe(
      false,
    );
  });
  it("provides a copyable JSON contract and explicitly distinguishes whole-recipe ingredients from per-portion estimates", () => {
    const json = RECIPE_CHATGPT_PROMPT.slice(
      RECIPE_CHATGPT_PROMPT.indexOf("{"),
      RECIPE_CHATGPT_PROMPT.indexOf("\n}") + 2,
    );
    expect(importRecipe(json).version).toBe(1);
    expect(RECIPE_CHATGPT_PROMPT).toContain("ESTIMACIONES POR UNA PORCIÓN");
    expect(RECIPE_CHATGPT_PROMPT).toContain("TODA la receta");
  });
});
