import type {
  ClinicalLoop,
  LoopStatus,
  LoopType,
  ParsedCapture,
  Priority,
} from "./types";

const ACTION_WORDS = [
  "avisar",
  "llamar",
  "revisar",
  "repetir",
  "corregir",
  "pedir",
  "hacer",
  "solicitar",
  "presentar",
  "verificar",
  "reevaluar",
  "suspender",
  "preparar",
  "escalar",
  "canalizar",
  "vigilar",
  "monitorizar",
  "monitorear",
  "controlar",
] as const;

const actionPattern = ACTION_WORDS.join("|");

function makeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `loop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanSpaces(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, "")
    .trim();
}

function stripPatient(input: string): { patientId?: string; rest: string } {
  const match = input
    .trim()
    .match(/^(?:(?:cama|bed|c)\s*)?#?\s*(\d{1,3})\b[\s,:;\-–—]*/i);

  if (!match) return { rest: input.trim() };

  return {
    patientId: match[1],
    rest: input.trim().slice(match[0].length),
  };
}

function atToday(now: Date, hour: number, minute = 0): Date {
  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);

  // "2 pm" written at 16:00 is normally intended as the next occurrence.
  if (result.getTime() < now.getTime() - 60_000) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

function extractTime(
  input: string,
  now: Date,
): { date?: Date; rest: string; raw?: string } {
  let match = input.match(
    /\b(?:en\s*)?\+?(\d{1,2})\s*(h|hr|hrs|hora|horas)\b/i,
  );

  if (match) {
    const date = new Date(now.getTime() + Number(match[1]) * 60 * 60 * 1000);
    return {
      date,
      raw: match[0],
      rest: cleanSpaces(input.replace(match[0], " ")),
    };
  }

  match = input.match(
    /\b(?:en\s*)?\+?(\d{1,3})\s*(m|min|mins|minuto|minutos)\b/i,
  );

  if (match) {
    const date = new Date(now.getTime() + Number(match[1]) * 60 * 1000);
    return {
      date,
      raw: match[0],
      rest: cleanSpaces(input.replace(match[0], " ")),
    };
  }

  match = input.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);

  if (match) {
    let hour = Number(match[1]) % 12;
    if (match[3].toLowerCase() === "pm") hour += 12;
    const minute = match[2] ? Number(match[2]) : 0;

    return {
      date: atToday(now, hour, minute),
      raw: match[0],
      rest: cleanSpaces(input.replace(match[0], " ")),
    };
  }

  match = input.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (match) {
    return {
      date: atToday(now, Number(match[1]), Number(match[2])),
      raw: match[0],
      rest: cleanSpaces(input.replace(match[0], " ")),
    };
  }

  return { rest: input };
}

function extractConditionAndAction(input: string): {
  condition?: string;
  nextAction?: string;
  rest: string;
} {
  const conditional = input.match(
    new RegExp(
      `\\bsi\\s+(.+?)\\s+(${actionPattern})\\b(.*)$`,
      "i",
    ),
  );

  if (conditional) {
    const tail = cleanSpaces(conditional[3] ?? "");
    return {
      condition: cleanSpaces(conditional[1]),
      nextAction: cleanSpaces(
        `${conditional[2]}${tail ? ` ${tail}` : ""}`,
      ),
      rest: cleanSpaces(input.replace(conditional[0], " ")),
    };
  }

  const explicitAction = input.match(
    new RegExp(`\\b(${actionPattern})\\b`, "i"),
  );

  if (explicitAction) {
    return {
      nextAction: explicitAction[1],
      rest: cleanSpaces(input.replace(explicitAction[0], " ")),
    };
  }

  return { rest: input };
}

function inferPriority(raw: string): Priority {
  if (/\b(urgente|stat|ahora|inmediato|inmediatamente)\b/i.test(raw)) {
    return "urgent";
  }

  if (/\b(hoy|antes del alta|antes de alta|importante)\b/i.test(raw)) {
    return "important";
  }

  return "routine";
}

function inferType(raw: string, hasTime: boolean): LoopType {
  if (/\b(alta|decidir|decision|decisión)\b/i.test(raw)) return "decision";

  if (
    /\b(interconsulta|interconsuta|ic|valoracion|valoración|cirugia|cirugía|cardio|cardiologia|cardiología|neuro|ortopedia|gine|pediatria|pediatría)\b/i.test(
      raw,
    )
  ) {
    return "external";
  }

  if (
    /\b(vigilar|reevaluar|monitorizar|monitorear|controlar|vigilancia)\b/i.test(
      raw,
    )
  ) {
    return "surveillance";
  }

  if (
    /\b(hb|hgb|hemoglobina|hemograma|k|potasio|na|sodio|creat|creatinina|glucemia|laboratorio|labs?|tac|tc|rx|radiografia|radiografía|cultivo|hemocultivos?|urocultivo|ego|ecg|troponina)\b/i.test(
      raw,
    )
  ) {
    return "result";
  }

  if (hasTime) return "scheduled";

  return "action";
}

function inferStatus(
  raw: string,
  type: LoopType,
  hasTime: boolean,
  hasCondition: boolean,
): LoopStatus {
  if (/\b(bloqueado|bloqueada|trabado|trabada)\b/i.test(raw)) {
    return "blocked";
  }

  if (
    /(?:^|\s)(?:salio|salió|resulto|resultó|resultado disponible|ya salio|ya salió)(?=\s|$)/i.test(
      raw,
    )
  ) {
    return "review";
  }

  if (/\b(pendiente|pendinte|esperando|cuando salga|cuando resulte)\b/i.test(raw)) {
    return "waiting";
  }

  if (type === "result" && hasTime) return "waiting";
  if (type === "external" && (hasTime || hasCondition)) return "waiting";

  return "todo";
}

function cleanTitle(input: string): string {
  const cleaned = cleanSpaces(
    input
      .replace(
        /(?:^|\s)(pendiente|pendinte|esperando|cuando salga|cuando resulte|salio|salió|resulto|resultó|resultado disponible|bloqueado|bloqueada|trabado|trabada)(?=\s|$)/gi,
        " ",
      )
      .replace(/[()[\]{}]/g, " "),
  );

  if (!cleaned) return "Pendiente sin clasificar";
  return cleaned;
}

export function parseCapture(rawCapture: string, now = new Date()): ParsedCapture {
  const raw = cleanSpaces(rawCapture);

  if (!raw) {
    throw new Error("La captura está vacía.");
  }

  const patient = stripPatient(raw);
  const time = extractTime(patient.rest, now);
  const conditional = extractConditionAndAction(time.rest);

  const title = cleanTitle(conditional.rest);
  const type = inferType(raw, Boolean(time.date));
  const status = inferStatus(
    raw,
    type,
    Boolean(time.date),
    Boolean(conditional.condition),
  );
  const priority = inferPriority(raw);

  let confidence = 0.35;
  if (patient.patientId) confidence += 0.2;
  if (title !== "Pendiente sin clasificar") confidence += 0.15;
  if (time.date) confidence += 0.1;
  if (conditional.nextAction) confidence += 0.1;
  if (status !== "todo") confidence += 0.05;
  if (type !== "action") confidence += 0.05;
  confidence = Math.min(0.99, Number(confidence.toFixed(2)));

  const createdAt = new Date(now);
  const loop: ClinicalLoop = {
    id: makeId(),
    patientId: patient.patientId,
    rawCapture: raw,
    title,
    type,
    status,
    priority,
    confidence,
    needsReview:
      confidence < 0.65 ||
      !patient.patientId ||
      title === "Pendiente sin clasificar",
    createdAt,
    updatedAt: createdAt,
    history: [{ kind: "created", at: createdAt, to: status }],
  };

  if (status === "waiting" || status === "review") {
    loop.reviewAt = time.date;
  } else {
    loop.dueAt = time.date;
  }

  if (status === "waiting") {
    loop.waitingFor = title;
  }

  if (conditional.condition) loop.condition = conditional.condition;
  if (conditional.nextAction) loop.nextAction = conditional.nextAction;

  return {
    loop,
    extracted: {
      patient: patient.patientId,
      time: time.raw,
      condition: conditional.condition,
      action: conditional.nextAction,
    },
  };
}
