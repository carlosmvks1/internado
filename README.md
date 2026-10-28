# Internado

Gestor personal de **ciclos clínicos abiertos** para reducir pendientes perdidos durante el internado.

> El objetivo no es guardar una historia clínica. El objetivo es saber qué sigue abierto, qué merece atención y cuándo un asunto está realmente resuelto.

## Estado

**v0 — prototipo funcional**

Incluye:

- captura rápida en lenguaje corto;
- parser local para cama, tiempos, estados, condiciones y acciones;
- máquina de estados para ciclos;
- vista **Ahora**;
- vista **Pacientes**;
- almacenamiento local con IndexedDB;
- PWA/offline;
- pruebas del parser.

Ejemplos de captura:

```
23 Hb 6h si baja avisar
8 TAC pendiente verificar 3pm
4 Hb salió revisar
7 IC cx si no pasan 2pm llamar
```

## Desarrollo

Requiere Node.js.

```bash
npm install
npm run test
npm run dev
```

Build:

```bash
npm run build
```

## Arquitectura

Ver [docs/architecture.md](docs/architecture.md).

## Privacidad

Este prototipo está diseñado para trabajar con identificadores operacionales mínimos (por ejemplo, número de cama). **No ingresar nombres, expedientes, teléfonos u otros identificadores del paciente.**

Los datos de uso viven localmente en el navegador mediante IndexedDB; el repositorio contiene únicamente código.
