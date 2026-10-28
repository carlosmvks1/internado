import { describe, expect, it } from "vitest";
import { parseCapture } from "./parser";
import type { LoopStatus, LoopType, Priority } from "./types";

type Case = {
  input: string;
  patient?: string;
  type?: LoopType;
  status?: LoopStatus;
  priority?: Priority;
  condition?: string;
  action?: string;
  hour?: number;
  minute?: number;
  needsReview?: boolean;
};

const now = new Date(2026, 9, 27, 10, 0, 0);

const cases: Case[] = [
  // Identificación + acciones simples
  { input: "12 canalizar vía", patient: "12", type: "action", status: "todo" },
  { input: "C12 hacer ECG", patient: "12", status: "todo", action: "hacer" },
  { input: "cama 7 pedir gasometría", patient: "7", status: "todo", action: "pedir" },
  { input: "#9 preparar alta", patient: "9", type: "decision", status: "todo", action: "preparar" },
  { input: "bed 4 repetir glucemia", patient: "4", type: "result", status: "todo", action: "repetir" },

  // Resultados / espera
  { input: "23 Hb 6h si baja avisar", patient: "23", type: "result", status: "waiting", condition: "baja", action: "avisar", hour: 16 },
  { input: "8 TAC pendiente verificar 3pm", patient: "8", type: "result", status: "waiting", action: "verificar", hour: 15 },
  { input: "4 Hb salió revisar", patient: "4", type: "result", status: "review", action: "revisar" },
  { input: "4 Hb ya salió revisar", patient: "4", type: "result", status: "review", action: "revisar" },
  { input: "6 creatinina resultó revisar", patient: "6", type: "result", status: "review", action: "revisar" },
  { input: "15 hemocultivos esperando", patient: "15", type: "result", status: "waiting" },
  { input: "18 cultivo cuando salga revisar", patient: "18", type: "result", status: "waiting", action: "revisar" },
  { input: "2 K en 30 min", patient: "2", type: "result", status: "waiting", hour: 10, minute: 30 },
  { input: "3 Na +2h revisar", patient: "3", type: "result", status: "waiting", action: "revisar", hour: 12 },
  { input: "11 troponina 14:30 revisar", patient: "11", type: "result", status: "waiting", action: "revisar", hour: 14, minute: 30 },
  { input: "19 glucemia 2:15pm revisar", patient: "19", type: "result", status: "waiting", action: "revisar", hour: 14, minute: 15 },

  // Dependencias externas
  { input: "14 interconsulta", patient: "14", type: "external", status: "todo" },
  { input: "7 IC cirugía pendiente", patient: "7", type: "external", status: "waiting" },
  { input: "5 cardio esperando", patient: "5", type: "external", status: "waiting" },
  { input: "7 IC cx si no pasan 2pm llamar", patient: "7", type: "external", status: "waiting", condition: "no pasan", action: "llamar", hour: 14 },
  { input: "9 ortopedia si no valora en 2h llamar", patient: "9", type: "external", status: "waiting", condition: "no valora", action: "llamar", hour: 12 },

  // Vigilancia
  { input: "10 vigilar SatO2", patient: "10", type: "surveillance", status: "todo" },
  { input: "10 reevaluar TA en 30 min", patient: "10", type: "surveillance", status: "todo", action: "reevaluar", hour: 10, minute: 30 },
  { input: "17 monitorear diuresis", patient: "17", type: "surveillance", status: "todo" },
  { input: "17 vigilar diuresis si baja avisar", patient: "17", type: "surveillance", condition: "baja", action: "avisar" },

  // Decisiones / prioridad
  { input: "21 alta pendiente", patient: "21", type: "decision", status: "waiting" },
  { input: "21 preparar alta hoy", patient: "21", type: "decision", priority: "important", action: "preparar" },
  { input: "3 ECG urgente", patient: "3", priority: "urgent" },
  { input: "3 revisar ECG ahora", patient: "3", priority: "urgent", action: "revisar" },
  { input: "13 TAC stat", patient: "13", type: "result", priority: "urgent" },

  // Bloqueos
  { input: "16 TAC bloqueado", patient: "16", type: "result", status: "blocked" },
  { input: "16 interconsulta trabada", patient: "16", type: "external", status: "blocked" },

  // Capturas incompletas: deben sobrevivir sin inventar
  { input: "14 interconsulta", patient: "14", needsReview: false },
  { input: "22 potasio", patient: "22", type: "result" },
  { input: "9 alta", patient: "9", type: "decision" },
  { input: "8 pendiente", patient: "8", status: "waiting", needsReview: true },

  // Lenguaje real que queremos soportar
  { input: "12 creatinina mañana 6am revisar", patient: "12", type: "result", status: "waiting", action: "revisar", hour: 6 },
  { input: "4 rx después del pase revisar", patient: "4", type: "result", action: "revisar" },
  { input: "5 glucemia a las 2 pm revisar", patient: "5", type: "result", status: "waiting", action: "revisar", hour: 14 },
  { input: "6 TAC a las 15:00 verificar", patient: "6", type: "result", status: "waiting", action: "verificar", hour: 15 },
  { input: "7 cirugía si no pasan a las 2pm llamar", patient: "7", type: "external", status: "waiting", condition: "no pasan a las", action: "llamar", hour: 14 },

  // Ruido / mayúsculas
  { input: "CAMA 31 HB 2H SI BAJA AVISAR", patient: "31", type: "result", status: "waiting", condition: "BAJA", action: "AVISAR", hour: 12 },
  { input: "c 32 tac PENDIENTE verificar 4PM", patient: "32", type: "result", status: "waiting", action: "verificar", hour: 16 },
  { input: "33 Hb   salió   revisar", patient: "33", type: "result", status: "review", action: "revisar" },

  // Errores razonables: al menos no deben perderse
  { input: "34 Hb pendinte", patient: "34", type: "result" },
  { input: "35 interconsuta cardio", patient: "35" },
  { input: "36 revisar creat mañana", patient: "36", action: "revisar" },
];

describe("parser stress test — pase hospitalario", () => {
  it.each(cases)("$input", (testCase) => {
    const { loop } = parseCapture(testCase.input, now);

    expect(loop.rawCapture).toBe(testCase.input.replace(/\s+/g, " ").trim());

    if (testCase.patient !== undefined) expect(loop.patientId).toBe(testCase.patient);
    if (testCase.type !== undefined) expect(loop.type).toBe(testCase.type);
    if (testCase.status !== undefined) expect(loop.status).toBe(testCase.status);
    if (testCase.priority !== undefined) expect(loop.priority).toBe(testCase.priority);
    if (testCase.condition !== undefined) expect(loop.condition).toBe(testCase.condition);
    if (testCase.action !== undefined) expect(loop.nextAction?.toLowerCase()).toBe(testCase.action.toLowerCase());
    if (testCase.needsReview !== undefined) expect(loop.needsReview).toBe(testCase.needsReview);

    const trigger = loop.reviewAt ?? loop.dueAt;
    if (testCase.hour !== undefined) {
      expect(trigger, "se esperaba una hora interpretada").toBeDefined();
      expect(trigger?.getHours()).toBe(testCase.hour);
    }
    if (testCase.minute !== undefined) {
      expect(trigger?.getMinutes()).toBe(testCase.minute);
    }
  });
});
