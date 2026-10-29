export const HUB_SECTIONS = [
  "home",
  "chores",
  "shopping",
  "finance",
  "calendar",
  "notes",
  "photos",
  "household",
  "profile",
] as const;
export type HubSection = (typeof HUB_SECTIONS)[number];
export type HubSearch = Record<string, unknown> & { section?: HubSection; record?: string };
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const recordId = new RegExp(
  `^(?:${uuid}|bill:${uuid}:\\d{4}-\\d{2}|date:\\d{4}-\\d{2}-\\d{2})$`,
  "i",
);

/** URLs contain section/reference IDs, never private titles, amounts or drafts.
 * Keep invitation and recovery parameters intact for their own handlers. */
export function hubSearch(search: Record<string, unknown>): HubSearch {
  const { section, record, ...rest } = search;
  const tab =
    typeof section === "string" && (HUB_SECTIONS as readonly string[]).includes(section)
      ? (section as HubSection)
      : undefined;
  const id =
    typeof record === "string" &&
    recordId.test(record) &&
    ["notes", "shopping", "calendar"].includes(tab ?? "")
      ? record
      : undefined;
  return { ...rest, ...(tab ? { section: tab } : {}), ...(id ? { record: id } : {}) };
}
