import wardRound from "./fixtures/ward-round.json";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { attention, orderByAttention } from "./attention";
import { db, moveLoop } from "./db";
import { parseCapture } from "./parser";
import {
  deriveAttentionBucket,
} from "./stateMachine";
import type {
  ClinicalLoop,
  LoopStatus,
} from "./types";
import "./styles.css";

type Tab = "now" | "capture" | "patients";

const statusLabel: Record<LoopStatus, string> = {
  todo: "POR HACER",
  waiting: "ESPERANDO",
  review: "REVISAR",
  act: "ACTUAR",
  blocked: "BLOQUEADO",
  closed: "CERRADO",
};

function formatTime(date?: Date): string | undefined {
  if (!date) return undefined;
  return new Intl.DateTimeFormat("es-HN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function triggerTime(loop: ClinicalLoop): Date | undefined {
  return loop.reviewAt ?? loop.dueAt;
}

function LoopCard({
  loop,
  onMove,
  now = new Date(),
}: {
  now?: Date;
  loop: ClinicalLoop;
  onMove: (loop: ClinicalLoop, status: LoopStatus) => void;
}) {
  const actions: { label: string; to: LoopStatus }[] = [];

  if (loop.status === "todo") {
    actions.push(
      { label: "Esperando", to: "waiting" },
      { label: "Actuar", to: "act" },
    );
  }

  if (loop.status === "waiting") {
    actions.push(
      { label: "Resultado", to: "review" },
      { label: "Bloquear", to: "blocked" },
    );
  }

  if (loop.status === "review") {
    actions.push(
      { label: "Actuar", to: "act" },
      { label: "Esperando", to: "waiting" },
    );
  }

  if (loop.status === "act") {
    actions.push({ label: "Esperando", to: "waiting" });
  }

  if (loop.status === "blocked") {
    actions.push(
      { label: "Reactivar", to: "todo" },
      { label: "Actuar", to: "act" },
    );
  }

  if (loop.status !== "closed") {
    actions.push({ label: "Cerrar", to: "closed" });
  }

  const time = formatTime(triggerTime(loop));

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

      <p className="raw">Atención {attention(loop, now).score} · {attention(loop, now).reasons.join(" · ") || "Pendiente abierto"}</p>
      <details><summary>Historial</summary><ol>
        {(loop.history ?? [{ kind: "baseline", at: loop.updatedAt, to: loop.status }]).map((event, index) => (
          <li key={index}>{new Date(event.at).toLocaleString("es-HN")} · {event.kind === "baseline" ? "Registro previo (historial anterior no disponible)" : event.kind === "created" ? "Creado" : statusLabel[event.from!]} → {statusLabel[event.to]}</li>
        ))}
      </ol></details>
      <div className="raw">{loop.rawCapture}</div>

      <div className="card-actions">
        {actions.map((action) => (
          <button
            key={action.to}
            type="button"
            onClick={() => onMove(loop, action.to)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function Section({
  title,
  loops,
  empty,
  now,
  onMove,
}: {
  title: string;
  now?: Date;
  loops: ClinicalLoop[];
  empty: string;
  onMove: (loop: ClinicalLoop, status: LoopStatus) => void;
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
            <LoopCard key={loop.id} loop={loop} now={now} onMove={onMove} />
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

    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const value = capture.trim();
    if (!value) return;

    const parsed = parseCapture(value);
    await db.loops.add(parsed.loop);
    setLastCapture(parsed.loop);
    setCapture("");
    await refresh();
  }

  async function move(loop: ClinicalLoop, status: LoopStatus) {
    try { await moveLoop(loop.id, status); }
    catch (error) { window.alert(error instanceof Error ? error.message : "No se pudo guardar."); }
    await refresh();
  }

  async function loadSimulation() {
    if (saving) return;
    setSaving(true);
    try {
      await db.transaction("rw", db.loops, async () => {
        if (await db.loops.count()) throw new Error("La simulación requiere una lista vacía para evitar mezclar datos.");
        await db.loops.bulkAdd(wardRound.map(c => parseCapture(c.input).loop));
      });
      setMessage("Simulación cargada: 10 pacientes, 40 pendientes ficticios.");
      await refresh(); setTab("now");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar."); }
    finally { setSaving(false); }
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

    return [...grouped.entries()].sort(([a], [b]) => {
      if (a === "sin-cama") return 1;
      if (b === "sin-cama") return -1;
      return Number(a) - Number(b);
    });
  }, [openLoops]);

  const capturePreview = useMemo(() => {
    if (!capture.trim()) return null;
    try {
      return parseCapture(capture).loop;
    } catch {
      return null;
    }
  }, [capture]);

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
        <button
          className={tab === "now" ? "active" : ""}
          onClick={() => setTab("now")}
        >
          Ahora
        </button>
        <button
          className={tab === "capture" ? "active" : ""}
          onClick={() => setTab("capture")}
        >
          Captura
        </button>
        <button
          className={tab === "patients" ? "active" : ""}
          onClick={() => setTab("patients")}
        >
          Pacientes
        </button>
      </nav>

      <main>
        <p role="status">{message}</p>
        {tab === "now" && (
          <>
            <Section
              now={now}
              title="Ahora"
              loops={buckets.now}
              empty="Nada exige atención inmediata."
              onMove={move}
            />
            <Section
              now={now}
              title="Próximo"
              loops={buckets.upcoming}
              empty="No hay ciclos programados."
              onMove={move}
            />
            <Section
              now={now}
              title="Esperando"
              loops={buckets.waiting}
              empty="No estás esperando nada sin hora definida."
              onMove={move}
            />
            <Section
              now={now}
              title="Bloqueado"
              loops={buckets.blocked}
              empty="No hay bloqueos."
              onMove={move}
            />
            <details>
              <summary>Cerrados · {loops.length - openLoops.length}</summary>
              <Section title="Historial de ciclos cerrados" now={now} loops={loops.filter(loop => loop.status === "closed")} empty="No hay ciclos cerrados." onMove={move} />
            </details>
          </>
        )}

        {tab === "capture" && (
          <section className="capture-lab">
            <div className="section-title">
              <h2>Interpretación</h2>
              <span>laboratorio</span>
            </div>
            <p className="hint">
              Escribí como hablarías durante el pase. Esta pantalla existe para
              detectar dónde falla el parser antes de depender de él.
            </p>

            <button disabled={saving || loops.length > 0} onClick={loadSimulation}>Cargar pase ficticio · 10 pacientes / 40 pendientes (lista vacía)</button>
            <div className="examples">
              <button onClick={() => setCapture("23 Hb 6h si baja avisar")}>
                23 Hb 6h si baja avisar
              </button>
              <button onClick={() => setCapture("8 TAC pendiente verificar 3pm")}>
                8 TAC pendiente verificar 3pm
              </button>
              <button onClick={() => setCapture("4 Hb salió revisar")}>
                4 Hb salió revisar
              </button>
            </div>

            {capturePreview ? (
              <div className="preview-grid">
                <div>
                  <span>Paciente</span>
                  <strong>
                    {capturePreview.patientId
                      ? `C${capturePreview.patientId}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Asunto</span>
                  <strong>{capturePreview.title}</strong>
                </div>
                <div>
                  <span>Tipo</span>
                  <strong>{capturePreview.type}</strong>
                </div>
                <div>
                  <span>Estado</span>
                  <strong>{capturePreview.status}</strong>
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
                    <LoopCard key={loop.id} loop={loop} onMove={move} />
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
          placeholder="23 Hb 6h si baja avisar"
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Capturar pendiente"
        />
        <button type="submit" disabled={saving || !capture.trim()}>
          Guardar
        </button>
      </form>
    </div>
  );
}
