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
const uuidId = new RegExp(`^${uuid}$`, "i");
function validReference(record: string, section: HubSection) {
  if (uuidId.test(record)) return true;
  if (section !== "calendar" || !recordId.test(record)) return false;
  const parts = record.startsWith("date:")
    ? record.slice(5).split("-")
    : record.slice(-7).split("-");
  const year = Number(parts[0]),
    month = Number(parts[1]);
  if (year < 1 || month < 1 || month > 12) return false;
  if (parts.length === 2) return true;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return Number(parts[2]) >= 1 && Number(parts[2]) <= days[month - 1]!;
}

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
    tab &&
    ["notes", "shopping", "calendar"].includes(tab) &&
    validReference(record.toLowerCase(), tab)
      ? record.toLowerCase()
      : undefined;
  return { ...rest, ...(tab ? { section: tab } : {}), ...(id ? { record: id } : {}) };
}
