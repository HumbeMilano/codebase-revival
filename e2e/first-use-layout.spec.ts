import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";

for (const role of ["admin", "member"])
  for (const filled of [false, true]) {
    test(`${role} first-use layout remains useful and keyboard-accessible with ${filled ? "household records" : "an empty household"} at five widths`, async ({
      page,
    }, info) => {
      const backend = new HouseholdBackend();
      backend.members[0]!.role = role;
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (filled) {
        backend.rows["chores"] = [
          {
            id: crypto.randomUUID(),
            household_id: HOME_ID,
            title: "Preparar la mochila y revisar los materiales de clase",
            member_key: "m_ana",
            done: false,
            when_label: "Hoy",
            due_date: day,
            completed_at: null,
            position: 0,
            revision: 1,
          },
        ];
        backend.rows["shopping_items"] = [
          {
            id: crypto.randomUUID(),
            household_id: HOME_ID,
            list_id: HOME_ID,
            name: "Pan integral",
            done: false,
            position: 0,
            revision: 1,
          },
        ];
        backend.rows["events"] = [
          {
            id: crypto.randomUUID(),
            household_id: HOME_ID,
            title: "Reunión familiar",
            date: day,
            time: "23:59",
            end_time: "",
            member_key: "m_ana",
            note: "",
            kind: "event",
            completed: false,
            revision: 1,
          },
        ];
      }
      await backend.install(page);
      await page.setViewportSize({ width: 320, height: 839 });
      await signIn(page);
      for (const width of [320, 390, 412, 768, 1024]) {
        await page.setViewportSize({ width, height: 839 });
        const tasks = page.locator('[data-widget="tasks"]');
        await expect(tasks).toBeVisible();
        await expect(tasks).toHaveAttribute("data-size", width < 768 ? "banner" : "tall");
        await expect(page.locator("[data-grid-widget]")).toHaveCount(
          width < 768 ? 3 : 6 - (role === "member" ? 1 : 0),
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (width < 768 && filled) {
          await expect(tasks).toContainText("Preparar la mochila");
          const clipped = await tasks
            .locator(".dw-tiny")
            .evaluate((node) => node.scrollHeight > node.clientHeight + 1);
          expect(clipped).toBe(false);
        }
        if (!filled) {
          const add = tasks.getByRole("button", { name: "Añadir tarea", exact: true });
          await expect(add).toBeInViewport();
          await add.focus();
          await expect(add).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(page.getByLabel("Título de la tarea", { exact: true })).toBeVisible();
          await page.keyboard.press("Escape");
          await page.goBack();
          await expect(tasks).toBeVisible();
        } else {
          await tasks.getByRole("button", { name: "Ver tareas de hoy", exact: true }).focus();
          await page.keyboard.press("Enter");
          await expect(
            page.getByRole("button", { name: "Nueva tarea", exact: true }),
          ).toBeVisible();
          await page.goBack();
          await expect(tasks).toBeVisible();
        }
        const agenda = page.locator('[data-widget="calendar"]');
        const accessible = await agenda.ariaSnapshot();
        expect(accessible).toContain("Próximos eventos");
        expect(accessible).toContain(filled ? "Reunión familiar" : "Añadir evento");
        if (width === 390)
          await page.screenshot({
            path: info.outputPath(`first-use-${role}-${filled}.png`),
            fullPage: true,
          });
      }
      await section(page, "Notas");
      await expect(page.getByRole("button", { name: "Nueva nota", exact: true })).toBeVisible();
      expect(backend.dashboardSaveRequests).toBe(0);
      expect(backend.financialReadsWithoutGrant).toBe(0);
      expect(backend.unexpectedRequests).toEqual([]);
    });
  }
