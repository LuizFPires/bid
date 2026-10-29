-- M2 · Endurece o bucket `propostas`: limite de tamanho e tipos permitidos.
-- Defesa no servidor de armazenamento (além da checagem na função de extração):
-- o Supabase rejeita o upload acima do limite ou de tipo não permitido.
-- PDF é o formato com extração automática; os demais são anexos (o usuário
-- preenche os dados à mão).

update storage.buckets
set
  file_size_limit = 8388608, -- 8 MB
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', -- xlsx
    'application/vnd.ms-excel',                                          -- xls
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
where id = 'propostas';
