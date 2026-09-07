insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values
  ('export', '/admin/export', 'Export', 'admin'),
  ('export-players-all', '/admin/export/hraci-vsichni', 'Hráči - všichni', 'admin')
on conflict (page_key) do update
set
  page_path = excluded.page_path,
  page_label = excluded.page_label;
