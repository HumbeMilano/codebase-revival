export type Role = "admin" | "member";
export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string; // tailwind token class suffix
}

export const MEMBERS: Member[] = [];

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
  dueDate?: string | null;
  completedAt?: string | null;
  revision?: number;
}

export interface ShopItem {
  listId?: string;
  revision?: number;
  position?: number;
  id: string;
  name: string;
  done: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  archived: boolean;
  position?: number;
  revision?: number;
}

export const CATEGORIES: Record<string, string> = {
  Vivienda: "🏠",
  Teléfono: "📱",
  Utilidades: "💡",
  Auto: "🚗",
  Suscripciones: "📺",
  Internet: "🌐",
};

/** Household context loaded at sign-in/pairing. MEMBERS is mutated in place so existing imports stay live. */
export const HOUSEHOLD = { id: "", name: "" };
export function setMembers(rows: { key: string; name: string; role: string }[]) {
  MEMBERS.splice(
    0,
    MEMBERS.length,
    ...rows.map((r, i): Member => ({
      id: r.key,
      name: r.name,
      role: r.role === "admin" ? "admin" : "member",
      color: `member-${(i % 4) + 1}`,
    })),
  );
}
