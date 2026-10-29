export interface LearnedAlias {
  id: string;
  alias: string;
  meaning: string;
  context: string[];
  confirmations: number;
  rejections: number;
  evidence: string[];
  disabled: boolean;
}
export interface AliasExplanation {
  id: string;
  alias: string;
  meaning: string;
  confidence: number;
  applied: boolean;
  reason: string;
}
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
export const words = (text: string): string[] => normalize(text).match(/[a-z]+/g) ?? [];
export const aliasConfidence = (rule: LearnedAlias) => (rule.confirmations + 1) / (rule.confirmations + rule.rejections * 3 + 2);
export function association(alias: string, meaning: string, context: string): LearnedAlias {
  alias = normalize(alias);
  meaning = meaning.trim();
  const tokens = [...new Set(words(context))].sort();
  // Lexical learning cannot inject patient IDs, times, conditions or actions.
  if (!/^[a-z]+$/.test(alias) || !/^[\p{L} ]+$/u.test(meaning) || !meaning || words(meaning).length > 6) throw new Error('Usá una abreviatura y un significado de hasta seis palabras, sin números.');
  if (tokens.includes(alias)) throw new Error('El contexto debe ser otra palabra de la captura.');
  return { id: JSON.stringify([alias, normalize(meaning), tokens]), alias, meaning, context: tokens, confirmations: 0, rejections: 0, evidence: [], disabled: false };
}
export function feedback(rule: LearnedAlias, positive: boolean, evidence: string): LearnedAlias {
  evidence = `${positive ? "confirm" : "reject"}:${evidence}`;
  if (rule.evidence.includes(evidence)) return rule;
  return { ...rule, confirmations: rule.confirmations + Number(positive), rejections: rule.rejections + Number(!positive), evidence: [...rule.evidence, evidence] };
}
export function applyDialect(title: string, rules: LearnedAlias[]) {
  const tokens = words(title);
  const explanations: AliasExplanation[] = [];
  const replacements = new Map<string, string>();
  for (const alias of new Set(tokens)) {
    const candidates = rules.filter(r => !r.disabled && r.alias === alias && r.context.every(c => tokens.includes(c)));
    if (!candidates.length) {
      const known = rules.find(r => !r.disabled && r.alias === alias);
      if (known) explanations.push({ id: known.id, alias, meaning: known.meaning, confidence: aliasConfidence(known), applied: false, reason: 'Falta contexto para esta abreviatura personal.' });
      continue;
    }
    const specificity = Math.max(...candidates.map(r => r.context.length));
    const scoped = candidates.filter(r => r.context.length === specificity);
    const winner = [...scoped].sort((a, b) => aliasConfidence(b) - aliasConfidence(a))[0];
    // Contradictory associations stay unresolved, regardless of confidence.
    const ambiguous = new Set(scoped.map(r => normalize(r.meaning))).size > 1;
    const applied = !ambiguous && winner.confirmations >= 3 && aliasConfidence(winner) >= .8;
    explanations.push({ id: winner.id, alias, meaning: winner.meaning, confidence: aliasConfidence(winner), applied,
      reason: ambiguous ? 'Asociaciones contradictorias: corregí el contexto.' : applied ? `Regla personal confirmada; contexto: ${winner.context.join(', ') || 'general'}.` : 'Asociación en aprendizaje; requiere confirmación.' });
    if (applied) replacements.set(alias, winner.meaning);
  }
  return { title: title.replace(/\b[a-z]+\b/gi, token => replacements.get(normalize(token)) ?? token), explanations };
}
