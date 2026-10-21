export type Role = "admin" | "member";
export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string; // tailwind token class suffix
}

export const MEMBERS: Member[] = [
  { id: "papa", name: "Papá", role: "admin", color: "member-1" },
  { id: "mama", name: "Mamá", role: "admin", color: "member-2" },
  { id: "lucas", name: "Lucas", role: "member", color: "member-3" },
  { id: "sofia", name: "Sofía", role: "member", color: "member-4" },
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

export interface ShopItem {
  id: string;
  name: string;
  done: boolean;
}

export const CATEGORIES: Record<string, string> = {
  Vivienda: "🏠",
  Teléfono: "📱",
  Utilidades: "💡",
  Auto: "🚗",
  Suscripciones: "📺",
  Internet: "🌐",
};
