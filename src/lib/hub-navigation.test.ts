import { describe, expect, it } from "vitest";
import { hubSearch } from "./hub-navigation";

describe("household navigation references", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  it("preserves invitation and signup intent while accepting a section", () => {
    expect(
      hubSearch({ section: "shopping", record: id, invite: "INVITATION", registro: "1" }),
    ).toEqual({ section: "shopping", record: id, invite: "INVITATION", registro: "1" });
  });
  it("never uses arbitrary text or references on the wrong section", () => {
    expect(hubSearch({ section: "notes", record: "private-note-title" })).toEqual({
      section: "notes",
    });
    expect(hubSearch({ section: "profile", record: id })).toEqual({ section: "profile" });
    expect(hubSearch({ section: "unknown", record: id })).toEqual({});
  });
  it("supports calendar dates and bill references without financial values", () => {
    expect(hubSearch({ section: "calendar", record: `bill:${id}:2026-10` }).record).toBe(
      `bill:${id}:2026-10`,
    );
    expect(hubSearch({ section: "calendar", record: "date:2026-10-29" }).record).toBe(
      "date:2026-10-29",
    );
    expect(
      hubSearch({ section: "notes", record: `<script>${id}</script>` }).record,
    ).toBeUndefined();
  });
  it("rejects impossible dates, bill months and references for another section", () => {
    for (const record of [
      "date:2026-02-29",
      "date:2026-02-31",
      "date:2026-13-01",
      "date:0000-01-01",
      `bill:${id}:2026-00`,
      `bill:${id}:2026-13`,
    ])
      expect(hubSearch({ section: "calendar", record }).record).toBeUndefined();
    expect(hubSearch({ section: "calendar", record: "date:2028-02-29" }).record).toBe(
      "date:2028-02-29",
    );
    for (const section of ["notes", "shopping"])
      expect(hubSearch({ section, record: "date:2026-10-30" }).record).toBeUndefined();
  });
  it("normalizes UUID casing without touching invitation or recovery intent", () => {
    const upper = "ABCDEF00-0000-4000-8000-000000000001";
    expect(
      hubSearch({ section: "notes", record: upper, invite: "KeepCase", recovery: "1" }),
    ).toEqual({ section: "notes", record: upper.toLowerCase(), invite: "KeepCase", recovery: "1" });
  });
});
