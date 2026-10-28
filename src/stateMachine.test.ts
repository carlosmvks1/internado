import { describe, expect, it } from "vitest";
import { deriveAttentionBucket, transitionLoop } from "./stateMachine";
import type { ClinicalLoop } from "./types";

const baseNow = new Date(2026, 9, 27, 10, 0, 0);

function loop(overrides: Partial<ClinicalLoop>): ClinicalLoop {
  return {
    id: "x",
    patientId: "12",
    rawCapture: "12 Hb 2h",
    title: "Hb",
    type: "result",
    status: "waiting",
    priority: "routine",
    confidence: 0.9,
    needsReview: false,
    createdAt: baseNow,
    updatedAt: baseNow,
    ...overrides,
  };
}

describe("state machine", () => {
  it("mantiene una espera futura fuera de Ahora", () => {
    const item = loop({ reviewAt: new Date(2026, 9, 27, 12, 0, 0) });
    expect(deriveAttentionBucket(item, baseNow)).toBe("upcoming");
  });

  it("hace reaparecer un ciclo cuando vence", () => {
    const item = loop({ reviewAt: new Date(2026, 9, 27, 9, 59, 0) });
    expect(deriveAttentionBucket(item, baseNow)).toBe("now");
  });

  it("mantiene esperas sin hora en Esperando", () => {
    expect(deriveAttentionBucket(loop({ reviewAt: undefined }), baseNow)).toBe("waiting");
  });

  it("resultado disponible siempre exige atención", () => {
    expect(deriveAttentionBucket(loop({ status: "review" }), baseNow)).toBe("now");
  });

  it("conducta pendiente siempre exige atención", () => {
    expect(deriveAttentionBucket(loop({ status: "act" }), baseNow)).toBe("now");
  });

  it("separa los bloqueos", () => {
    expect(deriveAttentionBucket(loop({ status: "blocked" }), baseNow)).toBe("blocked");
  });

  it("no resucita ciclos cerrados", () => {
    expect(deriveAttentionBucket(loop({ status: "closed" }), baseNow)).toBe("closed");
  });

  it("permite pasar de esperando a revisar", () => {
    const updated = transitionLoop(loop({ status: "waiting" }), "review", baseNow);
    expect(updated.status).toBe("review");
  });

  it("cerrar registra la hora de cierre", () => {
    const updated = transitionLoop(loop({ status: "act" }), "closed", baseNow);
    expect(updated.status).toBe("closed");
    expect(updated.closedAt?.getTime()).toBe(baseNow.getTime());
  });

  it("rechaza una transición inválida", () => {
    expect(() =>
      transitionLoop(loop({ status: "waiting" }), "todo", baseNow),
    ).toThrow(/Transición inválida/);
  });
});
