-- ═══════════════════════════════════════════════════════════════════════════════
-- Módulo de Planificación y Gestión de Tareas — documentación para el MCP
-- Tablas: weekly_plan · weekly_plan_analysts · sectors · sector_members
--         sector_sections · tasks · task_comments  (+ la columna users.initials)
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
'Sigla del analista en el calendario semanal ("DM", "AP", "RZ", "LB"). Es la etiqueta corta de la persona en todo el módulo: rotula las celdas del calendario, la lista de miembros de cada sector y el asignado de cada tarea. Las celdas del calendario muestran estas siglas —no el nombre completo—, igual que la planilla de Excel que reemplazan. UNIQUE: dos analistas con la misma sigla harían ambigua la grilla; Postgres permite varios NULL, así que un usuario sin sigla simplemente no aparece como opción en el selector de analistas del calendario. Se administra en /admin (Administración → Usuarios, columna Sigla).';


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
-- sectors — el eje de la vista micro
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE sectors IS
'Sectores del panel /latam → Planning → Sectors. Son el eje de la vista micro: la pantalla es una grilla de sectores, cada uno con sus sub-secciones y sus tareas. Reemplazó a la agrupación por analista — una tarea pertenece a un sector, no a una persona. MODELO DE PERMISOS DEL MÓDULO, distinto al del resto de la app: LEER es abierto (cualquier usuario autenticado ve todos los sectores, todas las sub-secciones y todas las tareas del equipo, sin aislamiento), y ESCRIBIR lo decide la membresía en sector_members. Crear, renombrar, borrar y repartir sectores es exclusivo de admin. Los cambios quedan en admin_change_log con entity = ''sectors''.';

COMMENT ON COLUMN sectors.name IS
'Nombre visible del sector ("Financials", "Commodities", "Retail"). UNIQUE en toda la tabla: dos sectores homónimos harían imposible saber a cuál pertenece una tarea al leer la bitácora.';

COMMENT ON COLUMN sectors.description IS
'Texto corto opcional de apoyo. No se muestra en la grilla, sólo en el editor del sector.';

COMMENT ON COLUMN sectors.is_general IS
'true = "Coordinación General": el espacio transversal que se renderiza a ancho completo ARRIBA de la grilla de sectores. Singleton por convención — la API rechaza crear un segundo y bloquea su borrado —, no por constraint de Postgres (un índice único parcial no se puede expresar en Prisma). NO tiene regla de permisos especial: escribe quien sea miembro, igual que en cualquier otro sector, así que abrirlo al equipo entero se hace agregando a todos a sector_members.';

COMMENT ON COLUMN sectors.sort_order IS
'Orden de las cajas en la grilla, ascendente. El sector con is_general = true se ordena primero sin importar este valor.';

COMMENT ON COLUMN sectors.updated_by IS
'Email (users.email) del último admin que guardó el sector.';


-- ───────────────────────────────────────────────────────────────────────────────
-- sector_members — puente sector ↔ analistas, y la llave de los permisos
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE sector_members IS
'Tabla puente N:M entre un sector y los analistas que trabajan en él. Es lo ÚNICO que decide quién puede ESCRIBIR: estar acá habilita crear, editar, completar y comentar tareas de ese sector; no estar lo deja en modo lectura (la UI pinta un candado y desactiva los controles). Un admin escribe en todos sin necesidad de figurar. El chequeo vive en canWriteSector() (lib/auth.ts) y lo aplican todas las rutas mutantes de /api/planning. Se reemplaza en bloque en cada PATCH del sector (deleteMany + createMany), así el guardado es idempotente. Sacar a alguien de un sector NO toca sus tareas: el trabajo pertenece al sector, no a la persona.';

COMMENT ON COLUMN sector_members.sector_id IS
'FK a sectors.id. onDelete: Cascade — borrar un sector se lleva su membresía.';

COMMENT ON COLUMN sector_members.user_id IS
'FK a users.id. onDelete: Cascade — dar de baja a alguien lo quita de todos los sectores, sin afectar las tareas que quedaron ahí.';


-- ───────────────────────────────────────────────────────────────────────────────
-- sector_sections — sub-secciones editables dentro de un sector
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE sector_sections IS
'Sub-secciones de un sector: el segundo nivel de agrupación, para que las tareas no queden sueltas dentro de la caja. Al crear un sector la API siembra tres en la misma transacción — "Chile", "Latam & Brasil" y "Other" —, y de ahí en adelante el admin las renombra, reordena o agrega otras desde el editor del sector. Reemplazaron a la vieja columna tasks.region, que se eliminó para que el mismo eje no viviera en dos lugares. Un sector siempre conserva al menos una: sin sub-secciones no podría recibir tareas, y la API bloquea el borrado de la última.';

COMMENT ON COLUMN sector_sections.sector_id IS
'FK a sectors.id. onDelete: Cascade. Es también el eslabón que conecta una tarea con su sector: tasks NO guarda sector_id, lo resuelve por acá.';

COMMENT ON COLUMN sector_sections.name IS
'Nombre visible de la sub-sección. UNIQUE junto con sector_id: dos sub-secciones homónimas en el mismo sector serían indistinguibles. Texto libre — arranca en Chile / Latam & Brasil / Other pero el equipo lo adapta, así que NO es un enum estable y un reporte por región tendría que cruzar por este nombre.';

COMMENT ON COLUMN sector_sections.sort_order IS
'Orden de las sub-secciones dentro de su sector, ascendente. Las tres iniciales se siembran con 0, 1 y 2.';


-- ───────────────────────────────────────────────────────────────────────────────
-- tasks — las tareas, dentro de una sub-sección
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE tasks IS
'Tareas del panel /latam → Planning → Sectors. Cada tarea vive dentro de una sub-sección (section_id) y por lo tanto dentro de un sector; NO es un Kanban — no hay columnas de estado ni drag & drop. Dentro de cada sub-sección van primero las abiertas (ordenadas por due_date y luego prioridad) y abajo, plegadas, las completadas. PERMISOS: LEER es abierto — cualquier autenticado ve TODAS las tareas de TODOS los sectores, incluida la Coordinación General, sin aislamiento. ESCRIBIR depende de la membresía al sector (sector_members), NO de a quién esté asignada la tarea: un admin escribe en todo, un usuario normal sólo dentro de los sectores donde es miembro, y el resto los ve en modo lectura. Mover una tarea a otro sector exige permiso en el origen Y en el destino. Se escribe exclusivamente desde la web, nunca por /api/ingest. Los cambios de fondo quedan en admin_change_log con entity = ''tasks'' y context = el sector; el reordenamiento manual NO se registra.';

COMMENT ON COLUMN tasks.title IS
'Título de la tarea. Junto con section_id es lo único obligatorio para crearla, y es la única línea que se lee en la lista de la sub-sección.';

COMMENT ON COLUMN tasks.description IS
'Detalle largo, visible sólo al abrir la tarea en el modal. La conversación NO va acá: eso es task_comments.';

COMMENT ON COLUMN tasks.section_id IS
'FK a sector_sections.id: DÓNDE vive la tarea, y por lo tanto de qué sector es. Obligatorio. NO existe una columna sector_id en esta tabla a propósito: la sección ya sabe a qué sector pertenece, y duplicarlo permitiría que una fila dijera sector A con una sección del sector B — una inconsistencia que la FK no podría impedir. La cadena task → section → sector → members es la única fuente de verdad, también para resolver permisos. onDelete: Restrict: no se borra una sub-sección con tareas dentro, hay que vaciarla primero (la API cuenta antes y devuelve un 409 legible).';

COMMENT ON COLUMN tasks.status IS
'todo | in_progress | done. Validado en la API, no por CHECK. El checkbox de la lista alterna todo ↔ done; los tres estados siguen disponibles en el modal de detalle, y una tarea en in_progress se marca en la lista con un punto azul. Escribir este campo actualiza completed_at en el mismo update.';

COMMENT ON COLUMN tasks.priority IS
'Nivel de prioridad: low | medium | high. Pinta el badge de la fila y es el segundo criterio de orden dentro de la sub-sección, después de due_date. Default medium.';

COMMENT ON COLUMN tasks.due_date IS
'Fecha de entrega comprometida (@db.Date, sin hora). Primer criterio de orden de la lista: lo más próximo arriba, y las sin fecha al final del bloque de abiertas. Una tarea con due_date pasada y status distinto de done se marca como vencida (fecha en rosado). NULL = sin fecha.';

COMMENT ON COLUMN tasks.assignee_id IS
'FK a users.id: quién está a cargo de la tarea. Es una ETIQUETA, NO UN PERMISO — desde el refactor a sectores, quién puede escribir lo decide sector_members y este campo no interviene en ningún chequeo. NULLABLE a propósito: una tarea de equipo (típicamente en la Coordinación General) puede no tener dueño. onDelete: SetNull — borrar un usuario ya no destruye trabajo, la tarea sobrevive en su sector y sólo queda sin asignar; eso sólo es seguro porque el sector, y no la persona, es lo que la sostiene.';

COMMENT ON COLUMN tasks.created_by_id IS
'FK a users.id — quién creó la tarea. onDelete: Restrict, a diferencia de assignee_id: la autoría sí se conserva. Es lo que bloquea el borrado de un usuario en /api/admin/users/[id] DELETE, que cuenta estas filas y las de task_comments para devolver un 409 legible en vez del P2003 crudo.';

COMMENT ON COLUMN tasks.region IS
'CHILE | LATAM, en mayúsculas. Sólo sirve para filtrar; no tiene FK contra weekly_plan.region.';

COMMENT ON COLUMN tasks.company IS
'Nombre de la empresa asociada, en el formato de empresas_industrias_v2.nombre_latam. Es texto libre sin FK (esa tabla tiene el nombre repetido: 682 filas para 551 nombres, así que una FK no sería única). NULL cuando la tarea no es de una empresa puntual.';

COMMENT ON COLUMN tasks.weekly_plan_id IS
'FK opcional a weekly_plan.id: cuelga la tarea de una semana del calendario macro, y es lo que alimenta el contador de tareas que muestra cada celda. onDelete: SetNull — vaciar la celda del calendario NO borra el trabajo, sólo lo desvincula.';

COMMENT ON COLUMN tasks.sort_order IS
'Desempate de orden, ascendente. HISTÓRICO: se diseñó como ranking fraccionario para el drag & drop del Kanban original (soltar entre dos tarjetas guardaba el promedio de sus vecinas, un solo UPDATE por arrastre). Ese drag & drop ya no existe, así que hoy nadie lo escribe salvo el POST, que le da (mínimo actual - 1) para que lo recién creado quede arriba de su sub-sección. La lista ordena por due_date y prioridad; sort_order sólo rompe empates. Es DOUBLE PRECISION, los valores no son consecutivos ni empiezan en 0, y sólo importa su orden relativo dentro del par (section_id, status).';

COMMENT ON COLUMN tasks.completed_at IS
'Momento en que la tarea pasó a done. Lo escribe la API junto con status, en ambos sentidos: reabrir una tarea (done → todo/in_progress) lo vuelve a NULL. Nunca se setea a mano. Ordena el bloque plegable "Completed" de cada sub-sección, lo último terminado arriba.';


-- ───────────────────────────────────────────────────────────────────────────────
-- task_comments — feed de interacción
-- ───────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE task_comments IS
'Feed de comentarios de una tarea: el admin deja revisiones y el analista responde con actualizaciones de avance. PERMISOS: LEER el hilo es abierto, igual que ver la tarea — cualquier autenticado lo ve completo. COMENTAR sigue la misma regla que editar: miembros del sector, o admin; ver una tarea ajena no habilita a intervenir en su hilo. Borrar un comentario: su autor, o un admin. El autor sale SIEMPRE de la sesión del servidor, nunca del body del request: si no, cualquiera podría firmar un comentario con el nombre de otro.';

COMMENT ON COLUMN task_comments.task_id IS
'FK a tasks.id. onDelete: Cascade — borrar una tarea se lleva su hilo completo.';

COMMENT ON COLUMN task_comments.author_id IS
'FK a users.id, tomado de la sesión al momento de escribir. onDelete: Restrict, para no perder hilos de conversación al dar de baja a alguien; el borrado de usuario avisa cuántos comentarios lo bloquean.';

COMMENT ON COLUMN task_comments.body IS
'Texto plano del comentario, máximo 4000 caracteres (validado en la API). Se renderiza respetando los saltos de línea; no admite markdown ni HTML.';

COMMENT ON COLUMN task_comments.created_at IS
'Fecha/hora de publicación. Es el criterio de orden del feed (ascendente: el más antiguo arriba).';
