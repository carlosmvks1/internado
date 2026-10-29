import { db } from './db';
import { association, feedback } from './dialect';
export async function teachAlias(alias: string, meaning: string, context: string, evidence: string) {
  const proposed = association(alias, meaning, context);
  const current = await db.aliases.get(proposed.id) ?? proposed;
  await db.aliases.put(feedback(current, true, evidence));
}
export async function rejectAlias(id: string, evidence: string) {
  const current = await db.aliases.get(id);
  if (current) await db.aliases.put(feedback(current, false, evidence));
}
