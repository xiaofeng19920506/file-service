-- 角色仅保留 admin | user；历史角色一律改为 user
UPDATE users
SET role = 'user'
WHERE role IS NULL
   OR role NOT IN ('admin', 'user');

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'user';
