import type { ClinicalLoop } from "./types";
const HOUR = 3_600_000;
export const WAITING_RESURFACE_HOURS = 4;
const hours = (at: Date, now: Date) => Math.max(0, (now.getTime() - at.getTime()) / HOUR);
export function isStaleWaiting(loop: ClinicalLoop, now: Date): boolean {
 return loop.status === "waiting" && !loop.reviewAt && !loop.dueAt && hours(loop.updatedAt, now) >= WAITING_RESURFACE_HOURS;
}
export function attention(loop: ClinicalLoop, now = new Date()) {
 if (loop.status === "closed") return { score: 0, reasons: [] as string[] };
 const reasons: string[] = [];
 let score = { routine: 0, important: 100, urgent: 1000 }[loop.priority];
 if (loop.priority !== "routine") reasons.push(loop.priority === "urgent" ? "Urgencia explícita" : "Importancia explícita");
 score += { todo: 10, waiting: 0, review: 60, act: 70, blocked: 20 }[loop.status];
 if (loop.status === "review") reasons.push("Resultado por revisar");
 if (loop.status === "act") reasons.push("Acción pendiente");
 if (loop.status === "blocked") reasons.push("Bloqueado");
 const trigger = loop.reviewAt ?? loop.dueAt;
 if (trigger && trigger.getTime() <= now.getTime()) {
  score += 80 + Math.min(120, hours(trigger, now) * 10);
  reasons.push("Hora de revisión vencida");
 }
 score += Math.min(60, hours(loop.updatedAt, now) * 12);
 if (isStaleWaiting(loop, now)) reasons.push("Espera sin hora >= 4 h");
 return { score: Math.round(score), reasons };
}
export function orderByAttention(loops: readonly ClinicalLoop[], now: Date): ClinicalLoop[] {
 return [...loops].sort((a,b) => attention(b,now).score-attention(a,now).score || a.createdAt.getTime()-b.createdAt.getTime() || a.id.localeCompare(b.id));
}
