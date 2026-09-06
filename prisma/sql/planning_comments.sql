-- ═══════════════════════════════════════════════════════════════════════════════
-- Módulo de Planificación y Gestión de Tareas — documentación para el MCP
-- Tablas: weekly_plan · weekly_plan_analysts · tasks · task_comments
--         (+ la columna nueva users.initials)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea las tablas).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/planning_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- users.initials
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN users.initials IS
'Sigla del analista en el calendario semanal ("DM", "AP", "RZ", "LB"). Es el puente entre la grilla macro de weekly_plan y la grilla de analistas (cada caja se rotula con la sigla): las celdas del calendario muestran estas siglas —no el nombre completo—, igual que la planilla de Excel que reemplazan. UNIQUE: dos analistas con la misma sigla harían ambigua la grilla; Postgres permite varios NULL, así que un usuario sin sigla simplemente no aparece como opción en el selector de analistas del calendario. Se administra en /admin (Administración → Usuarios, columna Sigla).';


-- ───────────────────────────────────────────────────────────────────────────────
-- weekly_plan — calendario macro
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE weekly_plan IS
'Calendario macro de research, vista /latam → Planning → Calendario. Réplica editable de la planilla de Excel del equipo: una columna por región, una fila por semana, y una fila de ESTA tabla por cada celda de esa grilla. La llave de negocio es (region, week_start), que es UNIQUE — el id cuid existe sólo para que tasks.weekly_plan_id sea una FK de una sola columna. A diferencia de casi todo el resto del schema, NO se carga por POST /api/ingest: se escribe exclusivamente desde la web vía PUT /api/planning/weekly, sólo con rol admin (lectura abierta a cualquier usuario autenticado). Cada cambio queda en admin_change_log con entity = ''weekly_plan'' y entity_key = ''<REGION>|<week_start>''. Vaciar una celda la BORRA de esta tabla, pero las tareas que colgaban de ella sobreviven con weekly_plan_id = NULL (onDelete: SetNull): borrar planificación nunca borra trabajo.';

COMMENT ON COLUMN weekly_plan.id IS
'cuid. NO es la llave de negocio —esa es (region, week_start)— sino el destino de la FK tasks.weekly_plan_id, que necesita una sola columna.';

COMMENT ON COLUMN weekly_plan.region IS
'Columna de la grilla, en MAYÚSCULAS: "CHILE" | "LATAM". La API normaliza a upper al escribir. Es texto libre a propósito, para poder abrir una columna nueva (ej. "ANDINOS") sin migración: lib/planning.ts fija el orden de las conocidas y el resto se renderiza al final, alfabéticamente. El label visible ("Latam / Brazil") vive en REGION_LABEL, no en la DB.';

COMMENT ON COLUMN weekly_plan.week_start IS
'SIEMPRE el lunes de la semana, en UTC — es la LLAVE, no lo que se muestra. La grilla RENDERIZA el día que le toca a cada región: Chile el martes (lunes+1) y LatAm/Brazil el jueves (lunes+3), vía displayDate() en lib/planning.ts. Es decir, una fila con week_start = 2026-09-07 se lee "08-Sep" en la columna de Chile y "10-Sep" en la de LatAm. El offset por región vive en REGION_DAY_OFFSET, no en la DB: cambiarlo re-rotula el calendario entero sin tocar una sola fila. La API lo normaliza con mondayOf() antes de escribir, así que el cliente puede mandar cualquier día de esa semana. Es @db.Date y se calcula en UTC puro para que la semana no se corra un día según el huso del navegador que hizo la edición.';

COMMENT ON COLUMN weekly_plan.topic IS
'El evento de la semana, tal como se lee en la grilla: "Update: Hapag-Vapores / Quiñenco", "Chile Banks (4/6)", "Results 3Q26". Una celda tiene UN tópico —igual que el Excel—; si hay dos temas en la misma semana van en este mismo texto separados por " / ". NULL o vacío = celda sin evento.';

COMMENT ON COLUMN weekly_plan.category IS
'Color/tipo de la celda. Valores: update | banks | top_picks | results | alert | holiday | none. Vienen del código de colores del Excel original (verde, azul, amarillo, gris, rojo, gris claro, sin relleno) pero se RENDERIZAN con la paleta PATRIA, que no incluye verde ni rojo: el mapeo exacto vive en CATEGORY_STYLE (lib/planning.ts). La validación de estos valores es de la API, no un CHECK de Postgres.';

COMMENT ON COLUMN weekly_plan.all_analysts IS
'true = la semana es de todo el equipo y la grilla muestra "All"; en ese caso se IGNORAN las filas de weekly_plan_analysts (la API además las borra al guardar). false + cero analistas = celda sin dueño, se pinta "-". Es un flag y no una fila especial de la tabla puente porque "All" no es una persona.';

COMMENT ON COLUMN weekly_plan.highlighted IS
'true = la semana va destacada con un recuadro, equivalente a los rectángulos rojos que el Excel dibuja alrededor de bloques de fechas a vigilar. Es puramente visual, no afecta ningún cálculo.';

COMMENT ON COLUMN weekly_plan.notes IS
'Detalle interno largo de la semana, que no cabe en la celda de la grilla. Se muestra en el tooltip para los usuarios no-admin y en el editor para el admin.';

COMMENT ON COLUMN weekly_plan.updated_by IS
'Email (users.email) del último admin que guardó la celda. El historial completo de cambios está en admin_change_log con entity = ''weekly_plan''.';

COMMENT ON COLUMN weekly_plan.updated_at IS
'Fecha/hora del último guardado. No tiene rol de precedencia (a diferencia de proyecciones_override.edited_at): esta tabla no compite con ninguna fuente externa, es la única fuente de verdad de sí misma.';


-- ───────────────────────────────────────────────────────────────────────────────
-- weekly_plan_analysts — puente celda ↔ analistas
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE weekly_plan_analysts IS
'Tabla puente N:M entre una celda del calendario y los analistas a cargo de esa semana. Reemplaza al texto libre del Excel ("DM", "AP / LB"): la grilla arma la etiqueta concatenando users.initials de estas filas con " / ". El caso "All" NO vive acá, es el flag weekly_plan.all_analysts; y cero filas con all_analysts = false significa celda sin dueño ("-"). Se reemplaza en bloque en cada PUT /api/planning/weekly (deleteMany + createMany), así el guardado es idempotente sin diffear la selección. Cascada por ambos lados: borrar la celda o el usuario limpia sus filas acá.';

COMMENT ON COLUMN weekly_plan_analysts.weekly_plan_id IS
'FK a weekly_plan.id. onDelete: Cascade — vaciar una celda del calendario se lleva sus asignaciones.';

COMMENT ON COLUMN weekly_plan_analysts.user_id IS
'FK a users.id. onDelete: Cascade — al borrar un analista desaparece de las semanas futuras. Ojo: eso NO significa que un usuario con trabajo se pueda borrar sin más; tasks tiene onDelete: Restrict y bloquea el borrado antes de llegar acá.';


-- ───────────────────────────────────────────────────────────────────────────────
-- tasks — grilla de analistas
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE tasks IS
'Tareas de la vista /latam → Planning → Analyst Grid: una caja por analista con su lista. NO es un Kanban — no hay columnas de estado ni drag & drop; dentro de cada caja van primero las tareas abiertas (ordenadas por due_date y luego prioridad) y abajo, plegadas, las completadas. PERMISOS (aplicados en /api/planning/tasks, no por rol plano): un admin ve y edita la caja de cualquiera y es el único que puede reasignar (cambiar assignee_id); un usuario normal ve y edita SÓLO las filas donde assignee_id = su id, y al crear se auto-asigna. Se escribe exclusivamente desde la web, nunca por /api/ingest. Los cambios de fondo (título, estado, prioridad, reasignación) quedan en admin_change_log con entity = ''tasks''; el reordenamiento manual NO se registra, para no llenar la bitácora de ruido.';

COMMENT ON COLUMN tasks.title IS
'Título de la tarea, lo único obligatorio para crearla. Es la única línea que se lee en la caja del analista.';

COMMENT ON COLUMN tasks.description IS
'Detalle largo, visible sólo al abrir la tarea en el modal. La conversación NO va acá: eso es task_comments.';

COMMENT ON COLUMN tasks.status IS
'todo | in_progress | done. Validado en la API, no por CHECK. El checkbox de la lista alterna todo ↔ done; los tres estados siguen disponibles en el modal de detalle, y una tarea en in_progress se marca en la lista con un punto azul. Escribir este campo actualiza completed_at en el mismo update.';

COMMENT ON COLUMN tasks.priority IS
'Nivel de prioridad: low | medium | high. Pinta el badge de la fila y es el segundo criterio de orden dentro de la caja, después de due_date. Default medium.';

COMMENT ON COLUMN tasks.due_date IS
'Fecha de entrega comprometida (@db.Date, sin hora). Primer criterio de orden de la lista: lo más próximo arriba, y las sin fecha al final del bloque de abiertas. Una tarea con due_date pasada y status distinto de done se marca como vencida (fecha en rosado). NULL = sin fecha.';

COMMENT ON COLUMN tasks.assignee_id IS
'FK a users.id — DE QUIÉN ES LA CAJA en la grilla de analistas. Es el campo que decide qué ve cada usuario. Sólo un admin puede cambiarlo. onDelete: Restrict a propósito: borrar un usuario con tareas vivas FALLA, para que el admin las reasigne antes en vez de perder la caja completa de alguien en silencio; /api/admin/users/[id] DELETE chequea esto antes y devuelve un 409 con el detalle en vez del error de FK crudo.';

COMMENT ON COLUMN tasks.created_by_id IS
'FK a users.id — quién creó la tarea. Distinto de assignee_id cuando el admin asigna trabajo a un tercero; iguales cuando el analista se auto-gestiona. También onDelete: Restrict.';

COMMENT ON COLUMN tasks.region IS
'CHILE | LATAM, en mayúsculas. Sólo sirve para filtrar; no tiene FK contra weekly_plan.region.';

COMMENT ON COLUMN tasks.company IS
'Nombre de la empresa asociada, en el formato de empresas_industrias_v2.nombre_latam. Es texto libre sin FK (esa tabla tiene el nombre repetido: 682 filas para 551 nombres, así que una FK no sería única). NULL cuando la tarea no es de una empresa puntual.';

COMMENT ON COLUMN tasks.weekly_plan_id IS
'FK opcional a weekly_plan.id: cuelga la tarea de una semana del calendario macro, y es lo que alimenta el contador de tareas que muestra cada celda. onDelete: SetNull — vaciar la celda del calendario NO borra el trabajo, sólo lo desvincula.';

COMMENT ON COLUMN tasks.sort_order IS
'Desempate de orden, ascendente. HISTÓRICO: se diseñó como ranking fraccionario para el drag & drop del Kanban (soltar entre dos tarjetas guardaba el promedio de sus vecinas, un solo UPDATE por arrastre). Al pasar a la grilla de analistas el drag & drop desapareció, así que hoy nadie lo escribe salvo el POST, que le da (mínimo actual - 1) para que lo recién creado quede arriba. La lista ordena por due_date y prioridad; sort_order sólo rompe empates. Es DOUBLE PRECISION, los valores no son consecutivos ni empiezan en 0, y sólo importa su orden relativo dentro del par (assignee_id, status).';

COMMENT ON COLUMN tasks.completed_at IS
'Momento en que la tarea pasó a done. Lo escribe la API junto con status, en ambos sentidos: reabrir una tarea (done → todo/in_progress) lo vuelve a NULL. Nunca se setea a mano. Ordena la sección "Completed" de cada caja, lo último terminado arriba.';


-- ───────────────────────────────────────────────────────────────────────────────
-- task_comments — feed de interacción
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE task_comments IS
'Feed de comentarios de una tarea: el admin deja revisiones y el analista responde con actualizaciones de avance. Se lee y escribe con el MISMO permiso que la tarea padre (su analista asignado, o cualquier admin). Un comentario sólo lo puede borrar su autor o un admin. El autor sale SIEMPRE de la sesión del servidor, nunca del body del request: si no, cualquiera podría firmar un comentario con el nombre de otro.';

COMMENT ON COLUMN task_comments.task_id IS
'FK a tasks.id. onDelete: Cascade — borrar una tarea se lleva su hilo completo.';

COMMENT ON COLUMN task_comments.author_id IS
'FK a users.id, tomado de la sesión al momento de escribir. onDelete: Restrict, para no perder hilos de conversación al dar de baja a alguien; el borrado de usuario avisa cuántos comentarios lo bloquean.';

COMMENT ON COLUMN task_comments.body IS
'Texto plano del comentario, máximo 4000 caracteres (validado en la API). Se renderiza respetando los saltos de línea; no admite markdown ni HTML.';

COMMENT ON COLUMN task_comments.created_at IS
'Fecha/hora de publicación. Es el criterio de orden del feed (ascendente: el más antiguo arriba).';
