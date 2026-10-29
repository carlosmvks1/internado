import Dexie, { type EntityTable } from "dexie";
import { parseCapture } from "./parser";
import {
  editLoop,
  recordLoopResult,
  transitionLoop,
} from "./stateMachine";
import type {
  ClinicalLoop,
  LoopStatus,
} from "./types";

class InternadoDB extends Dexie {
  loops!: EntityTable<ClinicalLoop, "id">;

  constructor() {
    super("internado-db");

    this.version(1).stores({
      loops:
        "id, parentLoopId, patientId, status, type, priority, dueAt, reviewAt, createdAt, updatedAt",
    });
  }
}

export const db = new InternadoDB();

export async function moveLoop(
  id: string,
  status: LoopStatus,
  now = new Date(),
) {
  return db.transaction("rw", db.loops, async () => {
    const current = await db.loops.get(id);
    if (!current) throw new Error("Ciclo no encontrado.");
    const updated = transitionLoop(current, status, now);
    await db.loops.put(updated);
    return updated;
  });
}

export async function saveLoopResult(
  id: string,
  result: string,
  now = new Date(),
) {
  return db.transaction("rw", db.loops, async () => {
    const current = await db.loops.get(id);
    if (!current) throw new Error("Ciclo no encontrado.");
    const updated = recordLoopResult(current, result, now);
    await db.loops.put(updated);
    return updated;
  });
}

export async function updateLoop(
  id: string,
  patch: Parameters<typeof editLoop>[1],
  detail = "Corrección manual",
  now = new Date(),
) {
  return db.transaction("rw", db.loops, async () => {
    const current = await db.loops.get(id);
    if (!current) throw new Error("Ciclo no encontrado.");
    const updated = editLoop(current, patch, detail, now);
    await db.loops.put(updated);
    return updated;
  });
}

function hasPatientPrefix(value: string): boolean {
  return /^(?:(?:cama|bed|c)\s*)?#?\s*\d{1,3}\b/i.test(value.trim());
}

export function followUpCaptureFor(
  parent: ClinicalLoop,
  rawCapture: string,
): string {
  const raw = rawCapture.trim();
  if (!raw) throw new Error("El siguiente paso no puede estar vacío.");
  if (!parent.patientId || hasPatientPrefix(raw)) return raw;
  return `C${parent.patientId} ${raw}`;
}

export async function createFollowUpAndClose(
  parentId: string,
  rawCapture: string,
  now = new Date(),
) {
  return db.transaction("rw", db.loops, async () => {
    const parent = await db.loops.get(parentId);
    if (!parent) throw new Error("Ciclo no encontrado.");
    if (parent.status !== "review" && parent.status !== "act") {
      throw new Error(
        "El siguiente ciclo se crea después de revisar el resultado o definir una acción.",
      );
    }

    const normalized = followUpCaptureFor(parent, rawCapture);
    const child = {
      ...parseCapture(normalized, now).loop,
      parentLoopId: parent.id,
    };

    const closed = transitionLoop(parent, "closed", now);
    const closedWithSpawn: ClinicalLoop = {
      ...closed,
      history: [
        ...(closed.history ?? []),
        {
          kind: "spawn",
          at: new Date(now),
          to: "closed",
          detail: `Siguiente ciclo: ${child.rawCapture}`,
        },
      ],
    };

    await db.loops.put(closedWithSpawn);
    await db.loops.add(child);

    return { parent: closedWithSpawn, child };
  });
}
