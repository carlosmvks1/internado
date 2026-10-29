import type { AliasExplanation } from "./dialect";
export type LoopType =
  | "action"
  | "result"
  | "external"
  | "scheduled"
  | "surveillance"
  | "decision";

export type LoopStatus =
  | "todo"
  | "waiting"
  | "review"
  | "act"
  | "blocked"
  | "closed";

export type Priority = "routine" | "important" | "urgent";

export interface LoopEvent {
  kind:
    | "created"
    | "baseline"
    | "transition"
    | "result"
    | "edited"
    | "spawn";
  at: Date;
  from?: LoopStatus;
  to: LoopStatus;
  detail?: string;
}

export interface ClinicalLoop {
  history?: readonly LoopEvent[];
  id: string;
  parentLoopId?: string;
  patientId?: string;
  rawCapture: string;
  dialect?: AliasExplanation[];
  title: string;
  type: LoopType;
  status: LoopStatus;
  dueAt?: Date;
  reviewAt?: Date;
  waitingFor?: string;
  condition?: string;
  nextAction?: string;
  lastResult?: string;
  priority: Priority;
  confidence: number;
  needsReview: boolean;
  reviewReason?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface ParsedCapture {
  loop: ClinicalLoop;
  extracted: {
    patient?: string;
    time?: string;
    condition?: string;
    action?: string;
  };
}

export type AttentionBucket =
  | "now"
  | "upcoming"
  | "waiting"
  | "blocked"
  | "closed";
