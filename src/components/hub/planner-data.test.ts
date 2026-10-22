import { describe, expect, it } from "vitest";
import { dateKey, parseDate, upcomingEvents, type FamilyEvent } from "./planner-data";

const event = (id: string, date: string, time = ""): FamilyEvent => ({
  id,
  date,
  time,
  title: id,
  memberId: "person",
  note: "",
});

describe("local family agenda", () => {
  it("keeps date-only values on the same local day", () => {
    expect(dateKey(parseDate("2027-03-14"))).toBe("2027-03-14");
  });
  it("excludes past events and sorts upcoming real dates and times", () => {
    const now = new Date(2027, 5, 9, 13, 0);
    const events = [
      event("tomorrow", "2027-06-10", "09:00"),
      event("past day", "2027-06-08"),
      event("past time", "2027-06-09", "12:59"),
      event("later", "2027-06-09", "17:00"),
      event("all day", "2027-06-09"),
    ];
    expect(upcomingEvents(events, now).map((item) => item.id)).toEqual([
      "all day",
      "later",
      "tomorrow",
    ]);
  });
});
