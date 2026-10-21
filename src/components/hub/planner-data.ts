export interface FamilyEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  memberId: string;
  note: string;
}
export interface FamilyNote {
  id: string;
  title: string;
  body: string;
  memberId: string;
  pinned: boolean;
}
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const parseDate = (date: string) => new Date(`${date}T12:00:00`);
export const eventWhen = (event: FamilyEvent) => `${parseDate(event.date).toLocaleDateString("es", { day: "numeric", month: "short" })}${event.time ? ` · ${event.time}` : ""}`;