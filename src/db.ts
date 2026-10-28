import Dexie, { type EntityTable } from "dexie";
import { transitionLoop } from "./stateMachine";
import type { LoopStatus, ClinicalLoop } from "./types";

class InternadoDB extends Dexie {
  loops!: EntityTable<ClinicalLoop, "id">;

  constructor() {
    super("internado-db");

    this.version(1).stores({
      loops:
        "id, patientId, status, type, priority, dueAt, reviewAt, createdAt, updatedAt",
    });
  }
}

export const db = new InternadoDB();

export async function moveLoop(id: string, status: LoopStatus, now = new Date()) {
 return db.transaction("rw", db.loops, async () => {
  const current = await db.loops.get(id);
  if (!current) throw new Error("Ciclo no encontrado.");
  await db.loops.put(transitionLoop(current, status, now));
 });
}
