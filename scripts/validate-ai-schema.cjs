// Validación de SÓLO LECTURA de cada vista de la capa ai contra la base de .env: compila, corre y
// cada columna de salida tiene su comentario (y viceversa). No crea nada: ejecuta los cuerpos de
// las vistas como subconsultas dentro de una sesión read-only.
// Uso: node scripts/validate-ai-schema.cjs .env scripts/.ai-views.json
const fs = require("fs");
const [envFile, viewsFile] = process.argv.slice(2);
for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { Client } = require("pg");
const views = JSON.parse(fs.readFileSync(viewsFile, "utf8"));
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("SET default_transaction_read_only = on");
  let bad = 0;
  for (const v of views) {
    try {
      const r = await c.query(`SELECT * FROM (${v.sql}) v LIMIT 0`);
      const cols = r.fields.map((f) => f.name);
      const missing = cols.filter((x) => !v.columns.includes(x));
      const extra = v.columns.filter((x) => !cols.includes(x));
      const dup = cols.filter((x, i) => cols.indexOf(x) !== i);
      const n = (await c.query(`SELECT count(*)::int n FROM (${v.sql}) v`)).rows[0].n;
      const flag = missing.length || extra.length || dup.length ? "  <<< " + JSON.stringify({ missing, extra, dup }) : "";
      if (flag) bad++;
      console.log(`${v.name.padEnd(32)} ${String(n).padStart(7)} rows  ${cols.length} cols${flag}`);
    } catch (e) {
      bad++;
      console.log(`${v.name.padEnd(32)} ERROR ${e.message}`);
    }
  }
  console.log(bad ? `${bad} PROBLEMS` : "ALL OK");
  await c.end();
})();
