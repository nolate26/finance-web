-- ═══════════════════════════════════════════════════════════════════════════════
-- fichas — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la tabla).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/fichas_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE fichas IS
'Fichas de compañía: PDFs de una página (o pocas) que describen una empresa en un trimestre dado, subidos por un admin desde /presentations (pestaña Fichas). Cada ficha cuelga OBLIGATORIAMENTE de un ticker Bloomberg de empresas_industrias_v2 vía FK (ticker → ticker_bloomberg, ON DELETE RESTRICT): no puede existir una ficha sin empresa, y no se puede borrar una empresa de la maestra mientras tenga ficha. HAY COMO MÁXIMO UNA FICHA VIVA POR TICKER (índice único en ticker): al subir la ficha de un quarter nuevo, POST /api/fichas borra la anterior de esa empresa y elimina su PDF de R2 — la tabla guarda la foto vigente, no el histórico. Es una tabla aparte de presentations porque ahí company_name es texto libre opcional. El país para agrupar NO se guarda acá: sale del join con empresas_industrias_v2.country_risk (código de 2 letras: BR, CL, MX, AR, PE, CO, US, OT, PA, CN, UY). Los archivos viven en Cloudflare R2 bajo el prefijo fichas/<ticker>/. Lectura: GET /api/fichas (todos los autenticados, opcional ?ticker=). Escritura: POST /api/fichas y DELETE /api/fichas/[id], sólo admin; ambos borran también el objeto de R2.';

COMMENT ON COLUMN fichas.id IS
'UUID generado por Prisma al crear la fila.';

COMMENT ON COLUMN fichas.ticker IS
'Ticker Bloomberg de la empresa (p.ej. "FALAB CI EQUITY"). FK a empresas_industrias_v2.ticker_bloomberg, se guarda en mayúsculas tal como está en la maestra. ÚNICO: una sola ficha viva por empresa. Para el país o el nombre de la empresa hay que hacer join con esa tabla.';

COMMENT ON COLUMN fichas.fiscal_year IS
'Año del trimestre al que corresponde la ficha (p.ej. 2026 para "2Q26"). Junto con quarter forma el período del informe, que NO es la fecha de carga (created_at). Lo elige el admin en el uploader; por defecto se ofrece el trimestre calendario actual.';

COMMENT ON COLUMN fichas.quarter IS
'Trimestre del informe, 1 a 4 (CHECK fichas_quarter_range). Se muestra siempre como "<quarter>Q<yy>" — 2 + 2026 = "2Q26" (lib/quarters.ts). Las dos fichas cargadas antes de 2026-09-18 se backfillearon a 2Q26 según el nombre de sus archivos.';

COMMENT ON COLUMN fichas.title IS
'Título visible de la ficha. Por defecto el nombre del archivo sin extensión; el admin puede cambiarlo al subir.';

COMMENT ON COLUMN fichas.description IS
'Nota opcional del admin (fuente, fecha del documento, etc.). NULL si no se escribió nada.';

COMMENT ON COLUMN fichas.file_url IS
'URL pública del PDF en R2 (R2_PUBLIC_URL + key). Es lo que abre el botón PDF de la UI.';

COMMENT ON COLUMN fichas.file_key IS
'Key del objeto dentro del bucket R2 (lo devuelve POST /api/upload). Se guarda para poder borrar el PDF del bucket al eliminar la ficha o al reemplazarla por la de un quarter nuevo. NULL sólo si la fila se creó a mano sin pasar por el uploader.';

COMMENT ON COLUMN fichas.uploaded_by IS
'Email del admin que subió la ficha (users.email en el momento de la carga). NULL si no había sesión identificable.';

COMMENT ON COLUMN fichas.created_at IS
'Fecha de CARGA de la ficha. El período del informe es (fiscal_year, quarter), no esto: una ficha de 2Q26 puede haberse subido en septiembre. Se usa como desempate al ordenar.';
