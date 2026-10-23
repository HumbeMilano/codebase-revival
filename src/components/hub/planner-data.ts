export interface FamilyEvent {
  revision?: number;
  id: string;
  title: string;
  date: string;
  time: string;
  memberId: string;
  note: string;
  kind?: "event" | "reminder";
  completed?: boolean;
  endTime?: string;
}
export interface FamilyNote {
  revision?: number;
  id: string;
  title: string;
  body: string;
  memberId: string;
  pinned: boolean;
}
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const parseDate = (date: string) => new Date(`${date}T12:00:00`);
export const eventWhen = (event: Pick<FamilyEvent, "date" | "time">) =>
  `${parseDate(event.date).toLocaleDateString("es", { day: "numeric", month: "short" })}${event.time ? ` · ${event.time}` : ""}`;

/** Sort and filter date-only events in the household browser's local time. */
export function upcomingEvents(events: FamilyEvent[], now: Date, limit = 3): FamilyEvent[] {
  const today = dateKey(now);
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return events
    .filter(
      (event) =>
        !event.completed &&
        ((event.kind === "reminder" && event.date < today) ||
          event.date > today ||
          (event.date === today && (!event.time || event.time >= clock))),
    )
    .sort((a, b) => `${a.date}${a.time || "00:00"}`.localeCompare(`${b.date}${b.time || "00:00"}`))
    .slice(0, limit);
}
