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

function legacyHistory(loop: ClinicalLoop) {
  return loop.history ?? [
    {
      kind: "baseline" as const,
      at: loop.updatedAt,
      to: loop.status,
    },
  ];
}

export function transitionLoop(
  loop: ClinicalLoop,
  to: LoopStatus,
  now = new Date(),
): ClinicalLoop {
  if (!canTransition(loop.status, to)) {
    throw new Error(`Transición inválida: ${loop.status} → ${to}`);
  }

  // A trigger belongs to the state that created it. Re-entering another state
  // must not inherit an already-expired reminder.
  const clearTrigger = to !== loop.status;

  return {
    ...loop,
    history: [
      ...legacyHistory(loop),
      {
        kind: "transition",
        at: new Date(now),
        from: loop.status,
        to,
      },
    ],
    status: to,
    updatedAt: new Date(now),
    closedAt: to === "closed" ? new Date(now) : undefined,
    dueAt: clearTrigger ? undefined : loop.dueAt,
    reviewAt: clearTrigger ? undefined : loop.reviewAt,
    waitingFor: to === "waiting" ? loop.waitingFor : undefined,
  };
}

export function recordLoopResult(
  loop: ClinicalLoop,
  result: string,
  now = new Date(),
): ClinicalLoop {
  const detail = result.trim();
  if (!detail) throw new Error("El resultado no puede estar vacío.");

  const moved =
    loop.status === "review"
      ? { ...loop, dueAt: undefined, reviewAt: undefined }
      : transitionLoop(loop, "review", now);

  return {
    ...moved,
    lastResult: detail,
    updatedAt: new Date(now),
    history: [
      ...legacyHistory(moved),
      {
        kind: "result",
        at: new Date(now),
        to: "review",
        detail,
      },
    ],
  };
}

export function editLoop(
  loop: ClinicalLoop,
  patch: Partial<
    Pick<
      ClinicalLoop,
      | "patientId"
      | "title"
      | "type"
      | "status"
      | "priority"
      | "condition"
      | "nextAction"
      | "dueAt"
      | "reviewAt"
      | "waitingFor"
      | "needsReview"
      | "reviewReason"
    >
  >,
  detail = "Corrección manual",
  now = new Date(),
): ClinicalLoop {
  return {
    ...loop,
    ...patch,
    updatedAt: new Date(now),
    history: [
      ...legacyHistory(loop),
      {
        kind: "edited",
        at: new Date(now),
        to: patch.status ?? loop.status,
        detail,
      },
    ],
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
