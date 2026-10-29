import { describe, expect, it } from "vitest";
import cases from "./fixtures/ward-round.json";
import { parseCapture } from "./parser";
import { deriveAttentionBucket, transitionLoop } from "./stateMachine";
import { orderByAttention } from "./attention";
const now = new Date(2026, 9, 27, 8);
const parsed = () => cases.map(c => parseCapture(c.input, now).loop);
describe("simulated ward round: 10 patients, 40 loops", () => {
 it.each(cases)("interprets $input", c => {
  const l = parseCapture(c.input, now).loop;
  expect(l.patientId).toBe(c.patient);
  expect(l.type).toBe(c.type); expect(l.status).toBe(c.status);
  expect(l.priority).toBe(c.priority);
  expect(l.condition ?? null).toBe(c.condition);
  expect(l.nextAction ?? null).toBe(c.action);
  const trigger = l.reviewAt ?? l.dueAt;
  expect(trigger ? (trigger.getTime()-now.getTime())/60000 : null).toBe(c.minutes);
 });
 it("conserves all loops, resurfaces waiting, preserves history and excludes closed", () => {
  const loops = parsed(); expect(new Set(loops.map(l=>l.patientId)).size).toBe(10);
  for (const minutes of [0,30,120,240,1320]) {
   const at = new Date(+now + minutes*60000);
   const groups = loops.map(l=>deriveAttentionBucket(l,at));
   expect(groups.length).toBe(40);
   loops.forEach((l,i)=>{
    const trigger=l.reviewAt??l.dueAt;
    if(l.status==='blocked') expect(groups[i]).toBe('blocked');
    else if(trigger && +trigger <= +at) expect(groups[i]).toBe('now');
    else if(l.status==='waiting' && !trigger && minutes>=240) expect(groups[i]).toBe('now');
   });
  }
  const active=orderByAttention(loops.filter(l=>deriveAttentionBucket(l,now)==='now'),now);
  expect(active[0].priority).toBe('urgent');
  for(const l of loops) {
   const closed=transitionLoop(l,'closed',new Date(+now+3600000));
   expect(deriveAttentionBucket(closed,new Date(+now+86400000))).toBe('closed');
   expect(closed.history).toHaveLength(2);
   expect(l.history).toHaveLength(1);
  }
 });
 it("honors tomorrow before and after the named hour",()=>{
  for(const hour of [1,8,20]) {
   const l=parseCapture('12 creatinina mañana 6am revisar',new Date(2026,9,27,hour)).loop;
   expect(l.reviewAt).toEqual(new Date(2026,9,28,6));
  }
 });
});
