import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { association, feedback, aliasConfidence, applyDialect } from './dialect';
import { db, InternadoDB, updateLoop, createFollowUpAndClose } from './db';
import { teachAlias, rejectAlias } from './dialectStore';
import { parseCapture } from './parser';
function trained(alias = 'eco', meaning = 'ecocardiograma', context = 'cardio') {
  let r = association(alias, meaning, context);
  for (let i = 0; i < 3; i++) r = feedback(r, true, String(i));
  return r;
}
afterEach(async () => { await db.aliases.clear(); await db.loops.clear(); });
describe('personal dialect', () => {
  it('records negative evidence atomically when an applied interpretation is corrected', async () => {
    const rule = trained('creat', 'creatinina', '');
    await db.aliases.put(rule);
    const loop = parseCapture('12 creat 6h', new Date(), [rule]).loop;
    await db.loops.add(loop);
    await updateLoop(loop.id, { title: 'otro laboratorio' });
    expect((await db.aliases.get(rule.id))?.rejections).toBe(1);
    expect((await db.loops.get(loop.id))?.title).toBe('otro laboratorio');
  });
  it('never chains learned replacements', () => {
    const a = trained('foo', 'bar', ''); const b = trained('bar', 'urgente', '');
    expect(applyDialect('foo bar', [a, b]).title).toBe('bar urgente');
  });
  it('requires repeated explicit confirmations and deduplicates retries', () => {
    let r = association('creat', 'creatinina', '');
    r = feedback(r, true, 'one');
    expect(feedback(r, true, 'one')).toEqual(r);
    expect(applyDialect('creat', [r]).title).toBe('creat');
    const learned = trained('creat', 'creatinina', '');
    expect(aliasConfidence(learned)).toBe(.8);
    expect(applyDialect('creat', [learned]).title).toBe('creatinina');
  });
  it('reduces confidence after rejection, including a previously confirmed capture', () => {
    const r = trained();
    const rejected = feedback(r, false, '0');
    expect(aliasConfidence(rejected)).toBeLessThan(aliasConfidence(r));
    expect(applyDialect('eco cardio', [rejected]).title).toBe('eco cardio');
  });
  it('separates contexts, requires all context words, and refuses contradictions', () => {
    const a = trained(); const b = trained('eco', 'ecografia abdominal', 'abd');
    expect(applyDialect('eco cardio', [a, b]).title).toBe('ecocardiograma cardio');
    expect(applyDialect('eco abd', [a, b]).title).toBe('ecografia abdominal abd');
    expect(applyDialect('eco', [a, b]).title).toBe('eco');
    expect(applyDialect('eco cardio abd', [a, b]).explanations[0].applied).toBe(false);
    expect(applyDialect('ecografia cardio', [a]).explanations).toEqual([]);
  });
  it('prefers specific contexts over generic rules and honors disable', () => {
    const a = trained(); const b = trained('eco', 'ecografia', '');
    expect(applyDialect('eco cardio', [a, b]).title).toBe('ecocardiograma cardio');
    expect(applyDialect('eco cardio', [{ ...a, disabled: true }]).title).toBe('eco cardio');
  });
  it('keeps original capture and structural safety fields unchanged, explains uncertainty', () => {
    const raw = '12 creat 6h si baja avisar'; const now = new Date();
    const baseline = parseCapture(raw, now).loop;
    const learned = parseCapture(raw, now, [trained('creat', 'creatinina', '')]).loop;
    for (const field of ['rawCapture', 'patientId', 'type', 'status', 'priority', 'reviewAt', 'condition', 'nextAction'] as const) expect(learned[field]).toEqual(baseline[field]);
    expect(learned.title).toBe('creatinina');
    expect(learned.dialect?.[0]).toMatchObject({ applied: true, confidence: .8 });
    expect(parseCapture('12 eco cardio', now, [association('eco', 'ecocardiograma', 'cardio')]).loop.needsReview).toBe(true);
  });
  it('rejects structural injection', () => {
    expect(() => association('eco', '12 mañana 6am', '')).toThrow();
    expect(() => association('e.*', 'ecografia', '')).toThrow();
  });
  it('persists learning, negative feedback, disable and forget across database reopen', async () => {
    for (let i = 0; i < 3; i++) await db.transaction('rw', db.aliases, () => teachAlias('eco', 'ecocardiograma', 'cardio', String(i)));
    const id = trained().id;
    db.close(); await db.open();
    expect(applyDialect('eco cardio', await db.aliases.toArray()).title).toBe('ecocardiograma cardio');
    await rejectAlias(id, 'wrong');
    db.close(); await db.open();
    expect((await db.aliases.get(id))?.rejections).toBe(1);
    await db.aliases.update(id, { disabled: true });
    db.close(); await db.open();
    expect((await db.aliases.get(id))?.disabled).toBe(true);
    await db.aliases.delete(id);
    db.close(); await db.open();
    expect(await db.aliases.count()).toBe(0);
  });
  it('upgrades a version 1 database without losing loops', async () => {
    const Dexie = (await import('dexie')).default;
    const name = 'dialect-upgrade-test';
    const old = new Dexie(name); old.version(1).stores({ loops: 'id, patientId, status, type, priority, dueAt, reviewAt, createdAt, updatedAt' });
    await old.table('loops').add(parseCapture('12 Hb 6h').loop); old.close();
    const upgraded = new InternadoDB(name);
    expect(await upgraded.loops.count()).toBe(1);
    expect(await upgraded.aliases.count()).toBe(0);
    await upgraded.delete();
  });
  it('learns no implicit evidence from saves or previews and uses rules in followups', async () => {
    await db.aliases.put(trained('creat', 'creatinina', ''));
    const parent = parseCapture('12 Hb salio').loop;
    await db.loops.add(parent);
    const child = (await createFollowUpAndClose(parent.id, 'creat 6h')).child;
    expect(child.title).toBe('creatinina');
    expect((await db.aliases.toArray())[0].confirmations).toBe(3);
  });
});
