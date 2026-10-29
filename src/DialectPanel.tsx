import { useState } from 'react';
import { db } from './db';
import { aliasConfidence, words, type LearnedAlias } from './dialect';
import { teachAlias, rejectAlias } from './dialectStore';
import type { ClinicalLoop } from './types';
export function DialectFeedback({ loop }: { loop: ClinicalLoop }) {
  const [alias, setAlias] = useState('');
  const [meaning, setMeaning] = useState('');
  const [context, setContext] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function teach() {
    setBusy(true);
    try {
      if (!words(loop.rawCapture).includes(alias.toLowerCase()) || !words(context).every(c => words(loop.rawCapture).includes(c))) throw new Error('La abreviatura y el contexto deben aparecer en la captura original.');
      await db.transaction('rw', db.aliases, async () => {
        for (const e of loop.dialect ?? []) if (e.alias === alias.toLowerCase() && e.meaning !== meaning) await rejectAlias(e.id, loop.id);
        await teachAlias(alias, meaning, context, loop.id);
      });
      setMessage('Confirmación guardada en este dispositivo. Cada captura cuenta una sola vez.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo aprender.'); }
    finally { setBusy(false); }
  }
  return <details><summary>Corregir / enseñar mi dialecto</summary>
    <p>Enseñá únicamente el significado del asunto. Requiere 3 capturas confirmadas; guardar sin corregir no enseña. No cambia horas, acciones ni estados.</p>
    <label>Abreviatura <input value={alias} onChange={e => setAlias(e.target.value)} /></label>
    <label>Significado <input value={meaning} onChange={e => setMeaning(e.target.value)} /></label>
    <label>Contexto opcional (palabras de la captura) <input value={context} onChange={e => setContext(e.target.value)} placeholder="cardio o abd" /></label>
    <button type="button" disabled={busy || !alias || !meaning} onClick={teach}>Confirmar asociación corregida</button>
    <p role="status">{message}</p>
  </details>;
}
export function DialectExplanation({ loop }: { loop: ClinicalLoop }) {
  return <>{loop.dialect?.map(e => <p key={e.id}>{e.applied ? 'Aplicado' : 'Sin aplicar'}: {e.alias} → {e.meaning} · {Math.round(e.confidence * 100)}% · {e.reason}</p>)}</>;
}
export function DialectManager({ rules, refresh }: { rules: LearnedAlias[]; refresh: () => Promise<void> }) {
  const [error, setError] = useState('');
  async function change(rule: LearnedAlias, forget: boolean) {
    try {
      if (forget) await db.aliases.delete(rule.id);
      else await db.aliases.update(rule.id, { disabled: !rule.disabled });
      await refresh();
    } catch { setError('No se pudo cambiar la asociación.'); }
  }
  return <details onToggle={e => { if (e.currentTarget.open) void refresh(); }}><summary>Mi dialecto · solo en este dispositivo</summary>
    <p>Las asociaciones se guardan localmente. Confianza de aprendizaje, no certeza clínica. Borrar datos del navegador las elimina.</p>
    {rules.map(r => <div key={r.id}><p>{r.alias} → {r.meaning} · contexto: {r.context.join(', ') || 'general'} · {Math.round(aliasConfidence(r) * 100)}% · {r.confirmations} confirmaciones / {r.rejections} correcciones</p>
      <button type="button" onClick={() => change(r, false)}>{r.disabled ? 'Habilitar' : 'Desactivar'}</button>
      <button type="button" onClick={() => change(r, true)}>Olvidar</button></div>)}<p role="status">{error}</p>
  </details>;
}
