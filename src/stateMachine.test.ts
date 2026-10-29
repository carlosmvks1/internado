import { describe, expect, it } from "vitest";
import {
  deriveAttentionBucket,
  recordLoopResult,
  transitionLoop,
} from "./stateMachine";
import type { ClinicalLoop } from "./types";

const baseNow = new Date(2026, 9, 27, 10, 0, 0);

function loop(overrides: Partial<ClinicalLoop> = {}): ClinicalLoop {
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
    history: [{ kind: "created", at: baseNow, to: "waiting" }],
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

  it("limpia recordatorios viejos al cambiar de estado", () => {
    const scheduled = loop({
      reviewAt: new Date(2026, 9, 27, 12, 0, 0),
    });
    const reviewed = transitionLoop(scheduled, "review", baseNow);
    expect(reviewed.reviewAt).toBeUndefined();
    expect(reviewed.dueAt).toBeUndefined();

    const waitingAgain = transitionLoop(reviewed, "waiting", baseNow);
    expect(waitingAgain.reviewAt).toBeUndefined();
    expect(waitingAgain.dueAt).toBeUndefined();
  });

  it("registra el valor observado y deja el ciclo en revisión", () => {
    const item = loop({ reviewAt: new Date(2026, 9, 27, 12, 0, 0) });
    const updated = recordLoopResult(item, "K 2.8", baseNow);

    expect(updated.status).toBe("review");
    expect(updated.lastResult).toBe("K 2.8");
    expect(updated.reviewAt).toBeUndefined();
    expect(updated.history?.at(-1)).toMatchObject({
      kind: "result",
      detail: "K 2.8",
      to: "review",
    });
  });

  it("cerrar registra la hora de cierre y reabrir la elimina", () => {
    const closed = transitionLoop(loop({ status: "act" }), "closed", baseNow);
    expect(closed.closedAt?.getTime()).toBe(baseNow.getTime());

    const reopened = transitionLoop(
      closed,
      "todo",
      new Date(baseNow.getTime() + 60_000),
    );
    expect(reopened.status).toBe("todo");
    expect(reopened.closedAt).toBeUndefined();
  });

  it("rechaza una transición inválida", () => {
    expect(() =>
      transitionLoop(loop({ status: "waiting" }), "todo", baseNow),
    ).toThrow(/Transición inválida/);
  });
});
