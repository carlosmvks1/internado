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

export interface ClinicalLoop {
  id: string;
  patientId?: string;
  rawCapture: string;
  title: string;
  type: LoopType;
  status: LoopStatus;
  dueAt?: Date;
  reviewAt?: Date;
  waitingFor?: string;
  condition?: string;
  nextAction?: string;
  priority: Priority;
  confidence: number;
  needsReview: boolean;
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
