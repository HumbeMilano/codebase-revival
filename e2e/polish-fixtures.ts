import { HOME_ID, USER_ID, HouseholdBackend } from "./backend";

export const schoolListId = "10000000-0000-4000-8000-000000000071";
export const noteOneId = "10000000-0000-4000-8000-000000000072";
export const noteTwoId = "10000000-0000-4000-8000-000000000073";
export const eventOneId = "10000000-0000-4000-8000-000000000074";
export const missingRecordId = "10000000-0000-4000-8000-000000000079";
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function seedPolishHome(backend: HouseholdBackend) {
  const today = localDay();
  const tomorrow = localDay(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
  );
  backend.rows["chores"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Preparar la cena",
      member_key: "m_ana",
      done: false,
      due_date: today,
      when_label: "",
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Regar plantas",
      member_key: "m_nico",
      done: false,
      due_date: today,
      when_label: "",
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Sacar basura",
      member_key: "m_ana",
      done: true,
      due_date: today,
      completed_at: new Date().toISOString(),
      when_label: "",
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Limpiar mañana",
      member_key: "m_ana",
      done: false,
      due_date: tomorrow,
      when_label: "",
      revision: 1,
    },
  ];
  const archived = "10000000-0000-4000-8000-000000000078";
  backend.rows["shopping_lists"]!.push(
    {
      id: schoolListId,
      household_id: HOME_ID,
      name: "School",
      archived: false,
      position: 1,
      revision: 1,
    },
    {
      id: archived,
      household_id: HOME_ID,
      name: "Archivo",
      archived: true,
      position: 2,
      revision: 1,
    },
  );
  backend.rows["shopping_items"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Milk",
      done: false,
      position: 0,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Bread",
      done: true,
      position: 1,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: schoolListId,
      name: "Pencils",
      done: false,
      position: 0,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: archived,
      name: "Invisible",
      done: false,
      position: 0,
      revision: 1,
    },
  ];
  backend.rows["events"] = [
    {
      id: eventOneId,
      household_id: HOME_ID,
      title: "Cita de familia",
      date: today,
      time: "",
      note: "Llegar juntos",
      member_key: "m_ana",
      kind: "event",
      completed: false,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Colegio mañana",
      date: tomorrow,
      time: "16:00",
      note: "",
      member_key: "m_nico",
      kind: "event",
      completed: false,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Ya terminado",
      date: today,
      time: "",
      note: "",
      member_key: "m_ana",
      kind: "reminder",
      completed: true,
      revision: 1,
    },
  ];
  backend.rows["notes"] = [
    {
      id: noteOneId,
      household_id: HOME_ID,
      title: "Llaves",
      body: "Junto a la puerta",
      member_key: "m_ana",
      pinned: false,
      revision: 1,
    },
    {
      id: noteTwoId,
      household_id: HOME_ID,
      title: "Colegio",
      body: "Llevar uniforme",
      member_key: "m_nico",
      pinned: false,
      revision: 1,
    },
  ];
  const billId = "10000000-0000-4000-8000-000000000075";
  backend.rows["bills"] = [
    {
      id: billId,
      household_id: HOME_ID,
      name: "Factura privada",
      category: "Casa",
      base: 45,
      due_day: new Date().getDate(),
      auto_pay: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: billId, person_key: "m_ana", type: "equal", value: 0 }];
  backend.dashboardPreference = {
    user_id: USER_ID,
    revision: 8,
    layout: {
      version: 4,
      widgets: [
        { id: "notes", key: "my-notes", size: "wide" },
        { id: "shopping", key: "my-list", size: "column", listId: schoolListId },
        { id: "month-calendar", key: "my-calendar", size: "portrait" },
      ],
    },
  };
}
