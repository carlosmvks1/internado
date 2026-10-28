import { describe, expect, it } from "vitest";
import { parseCapture } from "./parser";

describe("parseCapture", () => {
  const now = new Date(2026, 9, 27, 10, 0, 0);

  it("interpreta resultado relativo con condición", () => {
    const { loop } = parseCapture("23 Hb 6h si baja avisar", now);

    expect(loop.patientId).toBe("23");
    expect(loop.title.toLowerCase()).toBe("hb");
    expect(loop.type).toBe("result");
    expect(loop.status).toBe("waiting");
    expect(loop.condition).toBe("baja");
    expect(loop.nextAction?.toLowerCase()).toBe("avisar");
    expect(loop.reviewAt?.getTime()).toBe(
      now.getTime() + 6 * 60 * 60 * 1000,
    );
  });

  it("interpreta espera con hora absoluta", () => {
    const { loop } = parseCapture("C8 TAC pendiente verificar 3pm", now);

    expect(loop.patientId).toBe("8");
    expect(loop.title.toLowerCase()).toBe("tac");
    expect(loop.status).toBe("waiting");
    expect(loop.nextAction?.toLowerCase()).toBe("verificar");
    expect(loop.reviewAt?.getHours()).toBe(15);
  });

  it("reconoce un resultado disponible", () => {
    const { loop } = parseCapture("4 Hb salió revisar", now);

    expect(loop.patientId).toBe("4");
    expect(loop.status).toBe("review");
    expect(loop.nextAction?.toLowerCase()).toBe("revisar");
  });

  it("acepta una captura incompleta sin descartarla", () => {
    const { loop } = parseCapture("14 interconsulta", now);

    expect(loop.patientId).toBe("14");
    expect(loop.type).toBe("external");
    expect(loop.title.toLowerCase()).toContain("interconsulta");
  });

  it("interpreta dependencia externa con condición temporal", () => {
    const { loop } = parseCapture("7 IC cx si no pasan 2pm llamar", now);

    expect(loop.patientId).toBe("7");
    expect(loop.type).toBe("external");
    expect(loop.status).toBe("waiting");
    expect(loop.condition?.toLowerCase()).toBe("no pasan");
    expect(loop.nextAction?.toLowerCase()).toBe("llamar");
    expect(loop.reviewAt?.getHours()).toBe(14);
  });
});
