import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { documents, legalVersion, plans, documentState } from "../legal/documents.mjs";
const root = resolve(process.env.SKENDAL_LEGAL_OUTPUT || "/workspace/outputs/skendal-legal-drafts");
await mkdir(root, { recursive: true });
for (const [kind, languages] of Object.entries(documents))
  for (const [language, doc] of Object.entries(languages)) {
    const text =
      `# ${doc.title}\n\n**${doc.notice}**\n\nVersión / Version: ${legalVersion}\n\n` +
      doc.sections.map(([heading, body]) => `## ${heading}\n\n${body}\n`).join("\n");
    await writeFile(resolve(root, `${kind}-${language}.md`), text);
  }
await writeFile(
  resolve(root, "plan-proposal.json"),
  JSON.stringify(
    {
      status: "prelaunch-draft",
      billingUnit: "household",
      limitsEnforced: false,
      prices: { monthlyUSD: 2.99, annualUSD: 5.99, editable: true },
      plans,
      legal: documentState,
    },
    null,
    2,
  ) + "\n",
);
console.log("Exported six bilingual legal drafts and the editable plan proposal.");
