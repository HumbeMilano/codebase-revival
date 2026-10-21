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
export const DEMO_EVENTS: FamilyEvent[] = [
  { id: "e1", title: "Revisión del coche", date: "2026-10-22", time: "10:00", memberId: "papa", note: "" },
  { id: "e2", title: "Cumpleaños de la abuela", date: "2026-10-23", time: "", memberId: "mama", note: "" },
  { id: "e3", title: "Partido de fútbol", date: "2026-10-24", time: "09:30", memberId: "lucas", note: "" },
];
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const parseDate = (date: string) => new Date(`${date}T12:00:00`);
export const eventWhen = (event: FamilyEvent) => `${parseDate(event.date).toLocaleDateString("es", { day: "numeric", month: "short" })}${event.time ? ` · ${event.time}` : ""}`;