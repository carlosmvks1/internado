import { describe, expect, it } from "vitest";
import { parseCapture } from "./parser";
import { followUpCaptureFor } from "./workflow";

const now = new Date(2026, 9, 27, 10);

describe("follow-up capture", () => {
  it("hereda la cama si el usuario no la repite", () => {
    const parent = parseCapture("12 K 2h", now).loop;
    expect(followUpCaptureFor(parent, "repetir K 6h")).toBe(
      "C12 repetir K 6h",
    );
  });

  it("respeta una cama explícita", () => {
    const parent = parseCapture("12 K 2h", now).loop;
    expect(followUpCaptureFor(parent, "C14 revisar Hb")).toBe(
      "C14 revisar Hb",
    );
  });

  it("rechaza un siguiente paso vacío", () => {
    const parent = parseCapture("12 K 2h", now).loop;
    expect(() => followUpCaptureFor(parent, "   ")).toThrow();
  });
});
