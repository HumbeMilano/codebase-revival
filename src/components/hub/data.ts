import type { Contribution, LedgerBill } from "@/lib/ledger";

export type Role = "admin" | "member";
export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string; // tailwind token class suffix
  pin: string; // demo only — the real app verifies PINs on the server
}

export const MEMBERS: Member[] = [
  { id: "papa", name: "Papá", role: "admin", color: "member-1", pin: "1234" },
  { id: "mama", name: "Mamá", role: "admin", color: "member-2", pin: "5678" },
  { id: "lucas", name: "Lucas", role: "member", color: "member-3", pin: "1111" },
  { id: "sofia", name: "Sofía", role: "member", color: "member-4", pin: "2222" },
];

export const memberBg: Record<string, string> = {
  "member-1": "bg-member-1",
  "member-2": "bg-member-2",
  "member-3": "bg-member-3",
  "member-4": "bg-member-4",
};
export const memberText: Record<string, string> = {
  "member-1": "text-member-1",
  "member-2": "text-member-2",
  "member-3": "text-member-3",
  "member-4": "text-member-4",
};

export interface Chore {
  id: string;
  title: string;
  memberId: string;
  done: boolean;
  when: string;
}
export const CHORES: Chore[] = [
  { id: "c1", title: "Sacar la basura", memberId: "lucas", done: false, when: "Hoy" },
  { id: "c2", title: "Poner el lavaplatos", memberId: "sofia", done: true, when: "Hoy" },
  { id: "c3", title: "Regar las plantas", memberId: "mama", done: false, when: "Hoy" },
  { id: "c4", title: "Aspirar la sala", memberId: "papa", done: false, when: "Mañana" },
  { id: "c5", title: "Ordenar el cuarto", memberId: "lucas", done: false, when: "Mañana" },
];

export interface ShopItem {
  id: string;
  name: string;
  aisle: string;
  done: boolean;
}
export const AISLES = ["Frutas y verduras", "Lácteos y nevera", "Despensa", "Limpieza"];
export const SHOPPING: ShopItem[] = [
  { id: "s1", name: "Tomates (1 kg)", aisle: "Frutas y verduras", done: false },
  { id: "s2", name: "Plátanos", aisle: "Frutas y verduras", done: false },
  { id: "s3", name: "Leche entera", aisle: "Lácteos y nevera", done: true },
  { id: "s4", name: "Queso rallado", aisle: "Lácteos y nevera", done: false },
  { id: "s5", name: "Arroz", aisle: "Despensa", done: false },
  { id: "s6", name: "Detergente de platos", aisle: "Limpieza", done: false },
];

export const CATEGORIES: Record<string, string> = {
  Vivienda: "🏠",
  Teléfono: "📱",
  Utilidades: "💡",
  Auto: "🚗",
  Suscripciones: "📺",
  Internet: "🌐",
};

const two = [{ personId: "papa", type: "equal" as const, value: 0 }, { personId: "mama", type: "equal" as const, value: 0 }];

export const BILLS: LedgerBill[] = [
  { id: "b1", name: "Renta", category: "Vivienda", base: 2168.59, dueDay: 2, autoPay: true, splits: two, overrides: {} },
  { id: "b2", name: "T-Mobile", category: "Teléfono", base: 170, dueDay: 12, autoPay: true, overrides: {},
    splits: [...two, { personId: "lucas", type: "equal", value: 0 }] },
  { id: "b3", name: "FPL", category: "Utilidades", base: 95, dueDay: 14, autoPay: true, splits: two, overrides: { "2026-10": { amount: 102.33 } } },
  { id: "b4", name: "State Farm", category: "Auto", base: 119.22, dueDay: 15, autoPay: true, splits: two, overrides: {} },
  { id: "b5", name: "YouTube Premium", category: "Suscripciones", base: 30.54, dueDay: 16, autoPay: true, splits: two, overrides: {} },
  { id: "b6", name: "Amazon", category: "Suscripciones", base: 7.08, dueDay: 23, autoPay: true, splits: two, overrides: {} },
  { id: "b7", name: "Quantum Fiber", category: "Internet", base: 75.32, dueDay: 27, autoPay: true, splits: two, overrides: {} },
  { id: "b8", name: "Toyota", category: "Auto", base: 489.4, dueDay: 29, autoPay: false,
    splits: [{ personId: "papa", type: "percent", value: 60 }, { personId: "mama", type: "percent", value: 40 }], overrides: {} },
];

export const CONTRIBUTIONS: Contribution[] = [
  { id: "a1", personId: "papa", amount: 765.12, month: "2026-10", note: "Quincena 1" },
  { id: "a2", personId: "mama", amount: 800, month: "2026-10", note: "Quincena 1" },
  { id: "a3", personId: "lucas", amount: 56.67, month: "2026-10", note: "Teléfono" },
];

export const EVENTS = [
  { id: "e1", title: "Revisión del coche", when: "Mañana · 10:00", memberId: "papa" },
  { id: "e2", title: "Cumpleaños de la abuela", when: "Viernes", memberId: "mama" },
  { id: "e3", title: "Partido de fútbol", when: "Sábado · 9:30", memberId: "lucas" },
];
