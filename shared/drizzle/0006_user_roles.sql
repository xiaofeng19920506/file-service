UPDATE users SET role = 'member' WHERE role = 'user';

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';
