import wardRound from "./fixtures/ward-round.json";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  attention,
  orderByAttention,
} from "./attention";
import {
  createFollowUpAndClose,
  db,
  moveLoop,
  saveLoopResult,
  updateLoop,
} from "./db";
import { parseCapture } from "./parser";
import { deriveAttentionBucket } from "./stateMachine";
import type {
  ClinicalLoop,
  LoopStatus,
  LoopType,
  Priority,
} from "./types";
import "./styles.css";

type Tab = "now" | "capture" | "patients";
type CardMode = null | "result" | "followup" | "edit";

const statusLabel: Record<LoopStatus, string> = {
  todo: "POR HACER",
  waiting: "ESPERANDO",
  review: "REVISAR",
  act: "ACTUAR",
  blocked: "BLOQUEADO",
  closed: "CERRADO",
};

const typeLabel: Record<LoopType, string> = {
  action: "Acción",
  result: "Resultado",
  external: "Dependencia externa",
  scheduled: "Programado",
  surveillance: "Vigilancia",
  decision: "Decisión",
};

const priorityLabel: Record<Priority, string> = {
  routine: "Rutina",
  important: "Importante",
  urgent: "Urgente",
};

function formatTime(date?: Date): string | undefined {
  if (!date) return undefined;
  return new Intl.DateTimeFormat("es-HN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDateTimeLocal(date?: Date): string {
  if (!date) return "";
  const d = new Date(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function triggerTime(loop: ClinicalLoop): Date | undefined {
  return loop.reviewAt ?? loop.dueAt;
}

function eventText(loop: ClinicalLoop, index: number): string {
  const event = (loop.history ?? [])[index];
  if (!event) return "";

  if (event.kind === "created") return "Creado";
  if (event.kind === "baseline") {
    return "Registro previo · historial anterior no disponible";
  }
  if (event.kind === "result") {
    return `Resultado · ${event.detail ?? "registrado"}`;
  }
  if (event.kind === "edited") {
    return event.detail ?? "Corregido manualmente";
  }
  if (event.kind === "spawn") {
    return event.detail ?? "Generó un siguiente ciclo";
  }

  const fromStatus = event.from;
  const toStatus = event.to;
  const from = fromStatus ? statusLabel[fromStatus] : "—";
  return `${from} → ${statusLabel[toStatus]}`;
}

interface EditDraft {
  patientId: string;
  title: string;
  type: LoopType;
  status: LoopStatus;
  priority: Priority;
  condition: string;
  nextAction: string;
  trigger: string;
}

function draftFromLoop(loop: ClinicalLoop): EditDraft {
  return {
    patientId: loop.patientId ?? "",
    title: loop.title,
    type: loop.type,
    status: loop.status,
    priority: loop.priority,
    condition: loop.condition ?? "",
    nextAction: loop.nextAction ?? "",
    trigger: formatDateTimeLocal(triggerTime(loop)),
  };
}

function LoopCard({
  loop,
  now = new Date(),
  busy,
  onMove,
  onResult,
  onFollowUp,
  onEdit,
}: {
  loop: ClinicalLoop;
  now?: Date;
  busy: boolean;
  onMove: (loop: ClinicalLoop, status: LoopStatus) => Promise<void>;
  onResult: (loop: ClinicalLoop, result: string) => Promise<void>;
  onFollowUp: (loop: ClinicalLoop, capture: string) => Promise<void>;
  onEdit: (loop: ClinicalLoop, draft: EditDraft) => Promise<void>;
}) {
  const [mode, setMode] = useState<CardMode>(null);
  const [resultText, setResultText] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [draft, setDraft] = useState<EditDraft>(() => draftFromLoop(loop));

  useEffect(() => {
    if (mode !== "edit") setDraft(draftFromLoop(loop));
  }, [loop, mode]);

  const time = formatTime(triggerTime(loop));
  const score = attention(loop, now);

  function openEdit() {
    setDraft(draftFromLoop(loop));
    setMode("edit");
  }

  async function submitResult(event: FormEvent) {
    event.preventDefault();
    if (!resultText.trim()) return;
    await onResult(loop, resultText.trim());
    setResultText("");
    setMode(null);
  }

  async function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!followUp.trim()) return;
    await onFollowUp(loop, followUp.trim());
    setFollowUp("");
    setMode(null);
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    await onEdit(loop, draft);
    setMode(null);
  }

  return (
    <article className={`loop-card priority-${loop.priority}`}>
      <div className="loop-topline">
        <span className="patient-badge">
          {loop.patientId ? `C${loop.patientId}` : "SIN CAMA"}
        </span>
        <span className={`status status-${loop.status}`}>
          {statusLabel[loop.status]}
        </span>
        {time && <time>{time}</time>}
      </div>

      <h3>{loop.title}</h3>

      {loop.needsReview && (
        <div className="review-warning">
          <strong>Revisar interpretación.</strong>{" "}
          {loop.reviewReason ?? "La captura puede ser ambigua."}
          <button type="button" onClick={openEdit}>Corregir</button>
        </div>
      )}

      {loop.lastResult && (
        <div className="result-chip">
          <strong>Resultado:</strong> {loop.lastResult}
        </div>
      )}

      {(loop.condition || loop.nextAction) && (
        <div className="logic">
          {loop.condition && (
            <span>
              <strong>SI</strong> {loop.condition}
            </span>
          )}
          {loop.nextAction && (
            <span>
              <strong>→</strong> {loop.nextAction}
            </span>
          )}
        </div>
      )}

      <p className="raw">
        Atención {score.score} · {score.reasons.join(" · ") || "Pendiente abierto"}
      </p>

      <details>
        <summary>Historial · {loop.history?.length ?? 1}</summary>
        <ol className="history-list">
          {(loop.history ?? [{
            kind: "baseline" as const,
            at: loop.updatedAt,
            to: loop.status,
          }]).map((event, index) => (
            <li key={index}>
              {new Date(event.at).toLocaleString("es-HN")} ·{" "}
              {eventText(
                {
                  ...loop,
                  history: loop.history ?? [{
                    kind: "baseline" as const,
                    at: loop.updatedAt,
                    to: loop.status,
                  }],
                },
                index,
              )}
            </li>
          ))}
        </ol>
      </details>

      <div className="raw raw-capture">{loop.rawCapture}</div>

      <div className="card-actions">
        {loop.status === "todo" && (
          <>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "waiting")}>
              Esperando
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "act")}>
              Actuar
            </button>
          </>
        )}

        {loop.status === "waiting" && (
          <>
            <button disabled={busy} type="button" onClick={() => setMode("result")}>
              Registrar resultado
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "blocked")}>
              Bloquear
            </button>
          </>
        )}

        {loop.status === "review" && (
          <>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "act")}>
              Actuar
            </button>
            <button disabled={busy} type="button" onClick={() => setMode("followup")}>
              Siguiente ciclo
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "waiting")}>
              Volver a esperar
            </button>
          </>
        )}

        {loop.status === "act" && (
          <>
            <button disabled={busy} type="button" onClick={() => setMode("followup")}>
              Siguiente ciclo
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "waiting")}>
              Esperando
            </button>
          </>
        )}

        {loop.status === "blocked" && (
          <>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "todo")}>
              Reactivar
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "act")}>
              Actuar
            </button>
          </>
        )}

        {loop.status === "closed" ? (
          <button disabled={busy} type="button" onClick={() => onMove(loop, "todo")}>
            Reabrir
          </button>
        ) : (
          <>
            <button disabled={busy} type="button" onClick={openEdit}>
              Editar
            </button>
            <button disabled={busy} type="button" onClick={() => onMove(loop, "closed")}>
              Cerrar
            </button>
          </>
        )}
      </div>

      {mode === "result" && (
        <form className="inline-form" onSubmit={submitResult}>
          <label>
            Resultado observado
            <input
              autoFocus
              value={resultText}
              onChange={(event) => setResultText(event.target.value)}
              placeholder="Ej. K 2.8 / Hb 8.1 / TAC informado"
            />
          </label>
          <div className="inline-actions">
            <button disabled={busy || !resultText.trim()} type="submit">Guardar resultado</button>
            <button type="button" onClick={() => setMode(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {mode === "followup" && (
        <form className="inline-form" onSubmit={submitFollowUp}>
          <label>
            ¿Qué sigue?
            <input
              autoFocus
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              placeholder="Ej. repetir K 6h"
            />
          </label>
          <p className="form-help">
            Si no escribís la cama, el sistema hereda C{loop.patientId ?? "?"}.
            Al crear el siguiente ciclo, este asunto se cierra.
          </p>
          <div className="inline-actions">
            <button disabled={busy || !followUp.trim()} type="submit">
              Crear siguiente + cerrar
            </button>
            <button type="button" onClick={() => setMode(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {mode === "edit" && (
        <form className="inline-form edit-grid" onSubmit={submitEdit}>
          <label>
            Cama
            <input
              value={draft.patientId}
              onChange={(event) => setDraft({ ...draft, patientId: event.target.value })}
              inputMode="numeric"
            />
          </label>

          <label className="wide">
            Asunto
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          <label>
            Tipo
            <select
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as LoopType })}
            >
              {Object.entries(typeLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Estado
            <select
              value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value as LoopStatus })}
            >
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Prioridad
            <select
              value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
            >
              {Object.entries(priorityLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Reaparecer
            <input
              type="datetime-local"
              value={draft.trigger}
              onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}
            />
          </label>

          <label className="wide">
            Condición
            <input
              value={draft.condition}
              onChange={(event) => setDraft({ ...draft, condition: event.target.value })}
              placeholder="Ej. si baja"
            />
          </label>

          <label className="wide">
            Siguiente acción
            <input
              value={draft.nextAction}
              onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })}
              placeholder="Ej. avisar residente"
            />
          </label>

          <div className="inline-actions wide">
            <button disabled={busy || !draft.title.trim()} type="submit">
              Guardar corrección
            </button>
            <button type="button" onClick={() => setMode(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </article>
  );
}

function Section({
  title,
  loops,
  empty,
  now,
  busy,
  onMove,
  onResult,
  onFollowUp,
  onEdit,
}: {
  title: string;
  now: Date;
  busy: boolean;
  loops: ClinicalLoop[];
  empty: string;
  onMove: (loop: ClinicalLoop, status: LoopStatus) => Promise<void>;
  onResult: (loop: ClinicalLoop, result: string) => Promise<void>;
  onFollowUp: (loop: ClinicalLoop, capture: string) => Promise<void>;
  onEdit: (loop: ClinicalLoop, draft: EditDraft) => Promise<void>;
}) {
  return (
    <section className="section">
      <div className="section-title">
        <h2>{title}</h2>
        <span>{loops.length}</span>
      </div>

      {loops.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="cards">
          {loops.map((loop) => (
            <LoopCard
              key={loop.id}
              loop={loop}
              now={now}
              busy={busy}
              onMove={onMove}
              onResult={onResult}
              onFollowUp={onFollowUp}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [loops, setLoops] = useState<ClinicalLoop[]>([]);
  const [tab, setTab] = useState<Tab>("now");
  const [capture, setCapture] = useState("");
  const [lastCapture, setLastCapture] = useState<ClinicalLoop | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(new Date());

  async function refresh() {
    const stored = await db.loops.toArray();
    setLoops(
      stored
        .map((loop) => ({
          ...loop,
          dueAt: loop.dueAt ? new Date(loop.dueAt) : undefined,
          reviewAt: loop.reviewAt ? new Date(loop.reviewAt) : undefined,
          createdAt: new Date(loop.createdAt),
          updatedAt: new Date(loop.updatedAt),
          closedAt: loop.closedAt ? new Date(loop.closedAt) : undefined,
          history: loop.history?.map((event) => ({
            ...event,
            at: new Date(event.at),
          })),
        }))
        .sort((a, b) => {
          const aTime = triggerTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bTime = triggerTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aTime - bTime || a.createdAt.getTime() - b.createdAt.getTime();
        }),
    );
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function runWrite(action: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const value = capture.trim();
    if (!value || saving) return;

    const original = capture;
    try {
      await runWrite(async () => {
        const parsed = parseCapture(value);
        await db.loops.add(parsed.loop);
        setLastCapture(parsed.loop);
        setCapture("");
        setMessage(
          parsed.loop.needsReview
            ? "Guardado, pero conviene revisar la interpretación."
            : "Guardado.",
        );
      });
    } catch {
      setCapture(original);
    }
  }

  async function move(loop: ClinicalLoop, status: LoopStatus) {
    await runWrite(async () => {
      await moveLoop(loop.id, status);
    });
  }

  async function saveResult(loop: ClinicalLoop, result: string) {
    await runWrite(async () => {
      await saveLoopResult(loop.id, result);
      setMessage("Resultado guardado. Ahora decidí si requiere acción, espera o cierre.");
    });
  }

  async function createFollowUp(loop: ClinicalLoop, nextCapture: string) {
    await runWrite(async () => {
      const created = await createFollowUpAndClose(loop.id, nextCapture);
      setMessage(`Ciclo anterior cerrado. Nuevo ciclo: ${created.child.rawCapture}`);
    });
  }

  async function saveEdit(loop: ClinicalLoop, draft: EditDraft) {
    await runWrite(async () => {
      const trigger = draft.trigger ? new Date(draft.trigger) : undefined;
      const usesReviewTrigger =
        draft.status === "waiting" || draft.status === "review";

      await updateLoop(
        loop.id,
        {
          patientId: draft.patientId.trim() || undefined,
          title: draft.title.trim(),
          type: draft.type,
          status: draft.status,
          priority: draft.priority,
          condition: draft.condition.trim() || undefined,
          nextAction: draft.nextAction.trim() || undefined,
          reviewAt: usesReviewTrigger ? trigger : undefined,
          dueAt: usesReviewTrigger ? undefined : trigger,
          waitingFor: draft.status === "waiting" ? draft.title.trim() : undefined,
          needsReview: false,
          reviewReason: undefined,
        },
        "Interpretación corregida manualmente",
      );
      setMessage("Interpretación corregida.");
    });
  }

  async function loadSimulation() {
    if (saving) return;
    await runWrite(async () => {
      await db.transaction("rw", db.loops, async () => {
        if (await db.loops.count()) {
          throw new Error(
            "La simulación requiere una lista vacía para evitar mezclar datos.",
          );
        }
        await db.loops.bulkAdd(
          wardRound.map((item) => parseCapture(item.input).loop),
        );
      });
      setMessage("Simulación cargada: 10 pacientes, 40 pendientes ficticios.");
      setTab("now");
    });
  }

  const openLoops = loops.filter((loop) => loop.status !== "closed");

  const buckets = useMemo(() => {
    const result = {
      now: [] as ClinicalLoop[],
      upcoming: [] as ClinicalLoop[],
      waiting: [] as ClinicalLoop[],
      blocked: [] as ClinicalLoop[],
    };

    for (const loop of openLoops) {
      const bucket = deriveAttentionBucket(loop, now);
      if (bucket !== "closed") result[bucket].push(loop);
    }

    result.now = orderByAttention(result.now, now);
    result.upcoming = orderByAttention(result.upcoming, now);
    result.waiting = orderByAttention(result.waiting, now);
    result.blocked = orderByAttention(result.blocked, now);
    return result;
  }, [openLoops, now]);

  const patients = useMemo(() => {
    const grouped = new Map<string, ClinicalLoop[]>();

    for (const loop of openLoops) {
      const key = loop.patientId ?? "sin-cama";
      const current = grouped.get(key) ?? [];
      current.push(loop);
      grouped.set(key, current);
    }

    return [...grouped.entries()]
      .map(([patient, patientLoops]) => [
        patient,
        orderByAttention(patientLoops, now),
      ] as const)
      .sort(([a], [b]) => {
        if (a === "sin-cama") return 1;
        if (b === "sin-cama") return -1;
        return Number(a) - Number(b);
      });
  }, [openLoops, now]);

  const capturePreview = useMemo(() => {
    if (!capture.trim()) return null;
    try {
      return parseCapture(capture).loop;
    } catch {
      return null;
    }
  }, [capture]);

  const closedLoops = loops.filter((loop) => loop.status === "closed");

  const sectionProps = {
    now,
    busy: saving,
    onMove: move,
    onResult: saveResult,
    onFollowUp: createFollowUp,
    onEdit: saveEdit,
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">INTERNADO · V0</div>
          <h1>Ciclos abiertos</h1>
        </div>
        <div className="open-count">
          <strong>{openLoops.length}</strong>
          <span>abiertos</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        <button className={tab === "now" ? "active" : ""} onClick={() => setTab("now")}>
          Ahora
        </button>
        <button className={tab === "capture" ? "active" : ""} onClick={() => setTab("capture")}>
          Captura
        </button>
        <button className={tab === "patients" ? "active" : ""} onClick={() => setTab("patients")}>
          Pacientes
        </button>
      </nav>

      <main>
        {message && <p className="status-message" role="status">{message}</p>}

        {tab === "now" && (
          <>
            <Section
              {...sectionProps}
              title="Ahora"
              loops={buckets.now}
              empty="Nada exige atención inmediata."
            />
            <Section
              {...sectionProps}
              title="Próximo"
              loops={buckets.upcoming}
              empty="No hay ciclos programados."
            />
            <Section
              {...sectionProps}
              title="Esperando"
              loops={buckets.waiting}
              empty="No estás esperando nada sin hora definida."
            />
            <Section
              {...sectionProps}
              title="Bloqueado"
              loops={buckets.blocked}
              empty="No hay bloqueos."
            />

            <details className="closed-section">
              <summary>Cerrados · {closedLoops.length}</summary>
              <Section
                {...sectionProps}
                title="Historial de ciclos cerrados"
                loops={closedLoops}
                empty="No hay ciclos cerrados."
              />
            </details>
          </>
        )}

        {tab === "capture" && (
          <section className="capture-lab">
            <div className="section-title">
              <h2>Captura libre</h2>
              <span>parser local</span>
            </div>

            <p className="hint">
              No hay una sintaxis obligatoria. Escribí como naturalmente resumirías
              el pendiente. Si una hora o intención es ambigua, el sistema lo marca
              para que la corrijás; no tenés que aprender un lenguaje especial.
            </p>

            <button
              className="simulation-button"
              disabled={saving || loops.length > 0}
              onClick={loadSimulation}
            >
              Cargar pase ficticio · 10 pacientes / 40 pendientes
            </button>

            <div className="examples">
              <button onClick={() => setCapture("23 Hb 6h si baja avisar")}>
                23 Hb 6h si baja avisar
              </button>
              <button onClick={() => setCapture("8 TAC pendiente verificar 3pm")}>
                8 TAC pendiente verificar 3pm
              </button>
              <button onClick={() => setCapture("4 rx después del pase revisar")}>
                4 rx después del pase revisar
              </button>
            </div>

            {capturePreview ? (
              <>
                {capturePreview.needsReview && (
                  <div className="review-warning preview-warning">
                    <strong>Ambiguo:</strong>{" "}
                    {capturePreview.reviewReason ?? "Revisar antes de confiar en la interpretación."}
                  </div>
                )}

                <div className="preview-grid">
                  <div>
                    <span>Paciente</span>
                    <strong>{capturePreview.patientId ? `C${capturePreview.patientId}` : "—"}</strong>
                  </div>
                  <div>
                    <span>Asunto</span>
                    <strong>{capturePreview.title}</strong>
                  </div>
                  <div>
                    <span>Tipo</span>
                    <strong>{typeLabel[capturePreview.type]}</strong>
                  </div>
                  <div>
                    <span>Estado</span>
                    <strong>{statusLabel[capturePreview.status]}</strong>
                  </div>
                  <div>
                    <span>Hora</span>
                    <strong>{formatTime(triggerTime(capturePreview)) ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Confianza</span>
                    <strong>{Math.round(capturePreview.confidence * 100)}%</strong>
                  </div>
                  <div className="wide">
                    <span>Condición</span>
                    <strong>{capturePreview.condition ?? "—"}</strong>
                  </div>
                  <div className="wide">
                    <span>Siguiente acción</span>
                    <strong>{capturePreview.nextAction ?? "—"}</strong>
                  </div>
                </div>
              </>
            ) : (
              <p className="empty">Escribí una captura abajo para inspeccionarla.</p>
            )}

            {lastCapture && (
              <p className="saved-note">
                Última captura guardada: <strong>{lastCapture.rawCapture}</strong>
              </p>
            )}
          </section>
        )}

        {tab === "patients" && (
          <section className="patients">
            <div className="section-title">
              <h2>Pacientes</h2>
              <span>{patients.length}</span>
            </div>

            {patients.length === 0 && (
              <p className="empty">Todavía no hay pacientes con ciclos abiertos.</p>
            )}

            {patients.map(([patient, patientLoops]) => (
              <div className="patient-group" key={patient}>
                <div className="patient-heading">
                  <h3>{patient === "sin-cama" ? "Sin cama" : `Cama ${patient}`}</h3>
                  <span>{patientLoops.length} abiertos</span>
                </div>
                <div className="cards">
                  {patientLoops.map((loop) => (
                    <LoopCard
                      key={loop.id}
                      loop={loop}
                      now={now}
                      busy={saving}
                      onMove={move}
                      onResult={saveResult}
                      onFollowUp={createFollowUp}
                      onEdit={saveEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      <form className="capture-bar" onSubmit={submitCapture}>
        <input
          value={capture}
          onChange={(event) => setCapture(event.target.value)}
          placeholder="Escribí el pendiente como te salga…"
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Capturar pendiente"
        />
        <button type="submit" disabled={saving || !capture.trim()}>
          {saving ? "…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
