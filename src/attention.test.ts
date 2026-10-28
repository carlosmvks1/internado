import { describe, it, expect } from "vitest";
import { parseCapture } from "./parser";
import { attention, orderByAttention } from "./attention";
import { deriveAttentionBucket, transitionLoop } from "./stateMachine";
const start = new Date("2026-10-27T10:00:00Z");
const later = (h: number) => new Date(+start + h * 3600000);
const fresh = () => parseCapture("12 Hb pendiente", start).loop;
describe("attention", () => {
 it("resurfaces exactly at four hours", () => {
  expect(deriveAttentionBucket(fresh(), later(3.99))).toBe("waiting");
  expect(deriveAttentionBucket(fresh(), later(4))).toBe("now");
 });
 it("honors future schedules even after long waits", () => {
  expect(deriveAttentionBucket({...fresh(), reviewAt: later(12)}, later(8))).toBe("upcoming");
 });
 it("ages waits above fresh routine tasks", () => {
  const task = {...fresh(), id: "task", status: "todo" as const, updatedAt: later(5)};
  const waiting = fresh();
  expect(orderByAttention([task, waiting], later(5))[0]).toBe(waiting);
  expect(attention(fresh(), later(5)).score).toBeGreaterThan(attention(task, later(5)).score);
 });
 it("preserves explicit urgency despite capped aging", () => {
  expect(attention({...fresh(), priority: "urgent"}, start).score).toBeGreaterThan(attention({...fresh(), reviewAt: start, status: "act"}, later(1000)).score);
 });
 it("ranks overdue and results above fresh waiting", () => {
  expect(attention({...fresh(), reviewAt: start}, start).score).toBeGreaterThan(attention(fresh(), start).score);
  expect(attention({...fresh(), status: "review"}, start).score).toBeGreaterThan(attention(fresh(), start).score);
 });
 it("keeps blocked and closed separate", () => {
  expect(deriveAttentionBucket({...fresh(), status: "blocked"}, later(20))).toBe("blocked");
  expect(deriveAttentionBucket({...fresh(), status: "closed"}, later(20))).toBe("closed");
  expect(attention({...fresh(), status: "closed"}, later(20)).score).toBe(0);
 });
 it("breaks ties deterministically without mutating input", () => {
  const a = {...fresh(), id: "a"}, b = {...fresh(), id: "b"};
  const input = [b,a]; expect(orderByAttention(input,start)).toEqual([a,b]); expect(input).toEqual([b,a]);
 });
 it("resets wait age on re-entry and clamps future timestamps", () => {
  const reviewed = transitionLoop(fresh(), "review", later(5));
  const waiting = transitionLoop(reviewed, "waiting", later(6));
  expect(deriveAttentionBucket(waiting,later(7))).toBe("waiting");
  expect(attention({...fresh(), updatedAt: later(2)},start).score).toBe(0);
 });
});
describe("history", () => {
 it("captures creation and immutable transitions through closure and reopening", () => {
  const item = fresh();
  const reviewed = transitionLoop(item,"review",later(1));
  const closed = transitionLoop(reviewed,"closed",later(2));
  const reopened = transitionLoop(closed,"todo",later(3));
  expect(item.history).toHaveLength(1); expect(reviewed.history).toHaveLength(2);
  expect(reopened.history?.map(e=>e.to)).toEqual(["waiting","review","closed","todo"]);
  expect(reopened.closedAt).toBeUndefined();
  expect(reviewed.history?.[1]).toEqual({kind:"transition",at:later(1),from:"waiting",to:"review"});
 });
 it("records an honest baseline for legacy records", () => {
  const item = {...fresh(), history: undefined};
  const moved = transitionLoop(item,"review",later(1));
  expect(moved.history?.[0]).toEqual({kind:"baseline",at:start,to:"waiting"});
 });
 it("rejects invalid transitions without adding history", () => {
  const item = fresh(); expect(()=>transitionLoop(item,"todo",later(1))).toThrow(); expect(item.history).toHaveLength(1);
 });
});
