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
