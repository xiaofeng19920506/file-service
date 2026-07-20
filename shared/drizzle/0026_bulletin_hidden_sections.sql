ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS hidden_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 将旧的 skip_* 标志迁移进 hidden_sections
UPDATE weekly_bulletins
SET hidden_sections = (
  SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
  FROM (
    SELECT jsonb_array_elements_text(hidden_sections) AS value
    UNION ALL
    SELECT 'testimony_week' WHERE skip_testimony_week
    UNION ALL
    SELECT 'department_reports' WHERE skip_department_reports
  ) s
);
