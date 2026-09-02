insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values
  ('import', '/admin/import', 'Import', 'admin'),
  ('import-matches', '/admin/import/zapasy', 'Import zápasů', 'admin')
on conflict (page_key) do update
set
  page_path = excluded.page_path,
  page_label = excluded.page_label;
