import type { ClinicalLoop } from "./types";

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
