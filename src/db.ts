import Dexie, { type EntityTable } from "dexie";
import type { ClinicalLoop } from "./types";

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
