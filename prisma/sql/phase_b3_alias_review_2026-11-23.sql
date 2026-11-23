-- Auditoría de BDD 2026-11 — FASE B3, revisión de los 27 alias del track record sin ticker.
-- Aprobado por el usuario el 2026-11-23: grupos A y B se vinculan a la maestra; grupo C (15
-- papeles fuera de la maestra) queda como está, sin ticker y con su Yahoo propio.
--   npx prisma db execute --file prisma/sql/phase_b3_alias_review_2026-11-23.sql
-- Sólo datos (no cambia el schema): no hace falta deploy.
--
-- Al vincular se limpia el isin (pasa a ser el de la maestra) y se CONSERVA yahoo_ticker: los
-- 12 tickers destino no tienen Yahoo en la maestra, y el track record sigue bajando precios con
-- el símbolo histórico (RRRP3.SA, VIIA3.SA, …). Ver lib/securityAliases.ts.
-- La guarda `bbg_ticker IS NULL` hace que re-ejecutarlo no pise un vínculo hecho después a mano.

BEGIN;

UPDATE security_aliases sa
   SET bbg_ticker = m.bbg,
       isin       = NULL,
       note       = m.note
  FROM (VALUES
    -- A. Mismo papel, ISIN distinto en la maestra
    ('AMERICA MOVIL', 'AMX US EQUITY',     'Revisión B3: ADR AMX (cambió el ISIN de la ADR).'),
    ('AZUL',          'AZUL US EQUITY',    'Revisión B3: ADR AZUL.'),
    ('EMBRAER',       'EMBJ3 BZ EQUITY',   'Revisión B3: la ADR ERJ no está en la maestra; se vincula la acción local.'),
    ('KLABIN',        'KLBN11 BZ EQUITY',  'Revisión B3: unit KLBN11.'),
    ('SEQUOIA',       'SEQL3 BZ EQUITY',   'Revisión B3: mismo papel.'),
    ('BRISANET',      'BRST3 BZ EQUITY',   'Revisión B3: mismo papel.'),
    ('NATURA',        'NATU3 BZ EQUITY',   'Revisión B3: Natura &Co (NTCO3) pasó a NATU3.'),
    -- B. Fusiones / cambios de nombre
    ('3R',            'BRAV3 BZ EQUITY',   'Revisión B3: 3R + Enauta = Brava Energia.'),
    ('AREZZO',        'AZZA3 BZ EQUITY',   'Revisión B3: Arezzo + Soma = Azzas 2154.'),
    ('VIA VAREJO',    'BHIA3 BZ EQUITY',   'Revisión B3: Via Varejo pasó a Grupo Casas Bahia.'),
    ('COPEL',         'CPLE3 BZ EQUITY',   'Revisión B3: el track record usa CPLE6; en la maestra sólo está CPLE3.'),
    ('LASITES',       'LASITE* MM EQUITY', 'Revisión B3: misma empresa, ISIN de serie nueva.')
  ) AS m(alias, bbg, note)
 WHERE sa.alias_source = 'track_record'
   AND sa.alias = m.alias
   AND sa.bbg_ticker IS NULL;

COMMIT;

-- Verificación:
--   SELECT count(*) total, count(bbg_ticker) con_ticker FROM security_aliases;   -- 235 / 220
--   SELECT alias, yahoo_ticker FROM security_aliases WHERE bbg_ticker IS NULL ORDER BY alias;  -- los 15 del grupo C
