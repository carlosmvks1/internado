# Arquitectura v0

## Principio rector

> No administramos tareas. Administramos ciclos clínicos abiertos.

La aplicación no intenta reemplazar el expediente clínico. Es una capa operacional personal que responde:

1. ¿Qué sigue abierto?
2. ¿Qué necesita atención ahora?
3. ¿Qué estoy esperando?
4. ¿Qué acción sigue cuando aparezca el resultado?
5. ¿Cuándo puedo cerrar el asunto de forma segura?

## Flujo base

```
CAPTURAR → INTERPRETAR → ESPERAR/ACTUAR → REVISAR → ACTUAR → CERRAR
```

Un ciclo puede generar otro ciclo. Haber ejecutado una acción no implica que el asunto esté resuelto.

## Estados v0

- `todo`: depende de una acción propia.
- `waiting`: ya se movió algo y se espera un evento, resultado o tercero.
- `review`: apareció información y necesita interpretación.
- `act`: ya hay una conducta operacional pendiente.
- `blocked`: el ciclo no puede avanzar y debe escalarse o revisarse.
- `closed`: no queda una acción operacional derivada.

## Captura

La captura debe tolerar lenguaje incompleto. Ejemplos:

- `23 Hb 6h si baja avisar`
- `8 TAC pendiente verificar 3pm`
- `4 Hb salió revisar`
- `7 IC cx si no pasan 2pm llamar`

La v0 interpreta localmente reglas operacionales. No intenta inferir conductas médicas no escritas.

## Privacidad

El diseño v0 asume identificadores operacionales mínimos como cama/alias. No debe introducirse nombre, número de expediente, identidad, teléfono ni otro dato identificador del paciente.

Los datos se almacenan localmente en IndexedDB. GitHub contiene únicamente código fuente.

## Criterios de éxito

- captura simple en menos de 5 segundos;
- ningún ciclo abierto sin estado visible;
- distinguir `hecho` de `resuelto`;
- vista por acción y vista por paciente sin duplicar datos;
- funcionamiento offline;
- parser evaluable con pruebas automatizadas.

## Historial y atención local

Cada captura incluye un evento de creación. Cada transición válida agrega origen, destino y fecha sin reemplazar entradas previas. Los registros anteriores muestran una línea base al primer cambio; no se inventa su historia. El ciclo y su historial se guardan juntos en una transacción IndexedDB que lee el registro vigente. No es un registro inviolable ni sincronizado entre dispositivos.

Ahora se ordena por puntuación descendente, luego creación e identificador. Puntos: prioridad explícita rutinaria 0/importante 100/urgente 1000; estado por hacer 10/esperando 0/revisar 60/actuar 70/bloqueado 20; vencimiento 80 más 10 por hora (máximo 120 adicionales); antigüedad del estado 12 por hora (máximo 60). Cerrados puntúan 0. Se recalcula con el reloj existente cada 30 segundos, sin escribir eventos de reloj.

Una espera sin horario reaparece tras 4 horas desde el último cambio de estado (`WAITING_RESURFACE_HOURS`). Una fecha futura sigue en Próximo; revisar/actuar siguen en Ahora; bloqueados y cerrados permanecen separados. El tiempo de espera se reinicia al volver a Esperando. Las tarjetas muestran los motivos y permiten desplegar el historial. La puntuación organiza atención operacional: no estima gravedad ni recomienda conductas médicas.
