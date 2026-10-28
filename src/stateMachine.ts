import { isStaleWaiting } from "./attention";
import type {
  AttentionBucket,
  ClinicalLoop,
  LoopStatus,
} from "./types";

const transitions: Record<LoopStatus, LoopStatus[]> = {
  todo: ["waiting", "review", "act", "blocked", "closed"],
  waiting: ["review", "act", "blocked", "closed"],
  review: ["waiting", "act", "blocked", "closed"],
  act: ["waiting", "review", "blocked", "closed"],
  blocked: ["todo", "waiting", "act", "closed"],
  closed: ["todo"],
};

export function canTransition(from: LoopStatus, to: LoopStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionLoop(
  loop: ClinicalLoop,
  to: LoopStatus,
  now = new Date(),
): ClinicalLoop {
  if (!canTransition(loop.status, to)) {
    throw new Error(`Transición inválida: ${loop.status} → ${to}`);
  }

  return {
    ...loop,
    history: [...(loop.history ?? [{ kind: "baseline" as const, at: loop.updatedAt, to: loop.status }]), { kind: "transition", at: new Date(now), from: loop.status, to }],
    status: to,
    updatedAt: now,
    closedAt: to === "closed" ? now : undefined,
  };
}

function triggerTime(loop: ClinicalLoop): Date | undefined {
  return loop.reviewAt ?? loop.dueAt;
}

export function deriveAttentionBucket(
  loop: ClinicalLoop,
  now = new Date(),
): AttentionBucket {
  if (loop.status === "closed") return "closed";
  if (loop.status === "blocked") return "blocked";

  if (loop.status === "review" || loop.status === "act") {
    return "now";
  }

  const trigger = triggerTime(loop);

  if (trigger && trigger.getTime() <= now.getTime()) {
    return "now";
  }

  if (loop.status === "waiting") {
    return trigger ? "upcoming" : isStaleWaiting(loop, now) ? "now" : "waiting";
  }

  return trigger ? "upcoming" : "now";
}
