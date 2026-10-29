# Validación V0 — 27 octubre 2026

Rama feat/core-v0, commit 5c2a983. main no se modifica.

## Resultados reproducibles

- 115/115 pruebas pasan, 5 archivos; TypeScript y build PWA correctos.
- Dataset sintético: 10 camas, 40 ciclos, 8 patrones repetidos 5 veces. No contiene datos reales ni recomendaciones clínicas.
- Parser: 40/40 capturas cumplen simultáneamente cama, tipo, estado, prioridad, condición, acción y fecha/hora esperadas. Es exactitud sobre este conjunto limitado, no estimación de exactitud en uso real.
- Revisión operacional en minutos 0, 30, 120, 240 y 1320: los 40 ciclos conservan un bucket; vencidos reaparecen en Ahora, esperas sin hora reaparecen a 4 horas, bloqueos siguen separados.
- 40/40 cierres quedan fuera de Ahora al día siguiente y conservan dos eventos; los objetos anteriores permanecen sin modificar.
- Se corrige mañana 6am antes de las 6: antes podía programarse para hoy. Regresión probada a 01:00, 08:00 y 20:00.
- Se evita guardar repetidamente mientras hay una escritura pendiente. Un fallo de guardado conserva el texto y muestra un mensaje.

## Prueba manual de 20–30 minutos

Abrir Captura en una lista vacía y pulsar Cargar pase ficticio. Esto agrega los 40 ciclos de forma atómica, sin sobrescribir datos existentes. Para repetir con datos persistentes, usar un perfil de navegador de prueba nuevo.

Registrar con cronómetro 10 capturas escritas: tiempo desde primer carácter hasta confirmación Guardado. Objetivo mediana <5 s. Medir además tiempo para identificar el primer pendiente de Ahora, errores de interpretación y pendientes que se esperaban visibles pero no aparecen. Las pruebas automáticas no miden esos tiempos humanos.

Probar recarga, cerrar/abrir navegador, modo avión después de primera carga y cambio Esperando → Resultado → Actuar → Cerrar. Confirmar historial tras recarga. La instalación móvil y persistencia/offline requieren comprobarse en dispositivo.

## Límites

No se ha validado aún captura humana <5 s, tiempo para responder qué hacer ahora, instalación en teléfono ni notificaciones en segundo plano. El temporizador de 30 s actualiza Ahora mientras la aplicación está abierta. Expresiones vagas como después del pase o mañana sin hora todavía requieren revisión humana; no hay editor de campos.
