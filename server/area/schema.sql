-- Área do Cliente CTB Finances — esquema do banco (Postgres do Railway).
-- Idempotente: executado na partida do servidor. Nenhum dado de exemplo.

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  senha_hash text,                         -- null até o convite ser aceito
  email_verificado_em timestamptz,         -- confirmado ao usar o link do convite/redefinição
  bloqueado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Sessões: só o HASH do identificador fica no banco; o valor vai num cookie HttpOnly.
create table if not exists sessoes (
  id_hash text primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  criada_em timestamptz not null default now(),
  ultimo_uso_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogada_em timestamptz,
  ip text,
  agente text
);
create index if not exists sessoes_usuario on sessoes(usuario_id);

-- Links de convite e de redefinição de senha (uso único; só o hash fica guardado).
create table if not exists tokens_senha (
  hash text primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  finalidade text not null check (finalidade in ('convite', 'redefinir')),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz
);

-- Tentativas de login (limite por e-mail e por IP).
create table if not exists tentativas_login (
  id bigserial primary key,
  chave text not null,
  em timestamptz not null default now()
);
create index if not exists tentativas_chave_em on tentativas_login(chave, em);

-- Perfil do cliente: somente os campos permitidos (lista fixa no servidor).
create table if not exists perfis (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Equipe: papel controlado SÓ pelo servidor/scripts; conferido a cada requisição (revogação imediata).
create table if not exists equipe (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  ativo boolean not null,
  concedido_em timestamptz,
  revogado_em timestamptz
);
create table if not exists registro_equipe (
  id bigserial primary key,
  usuario_id uuid not null,
  email text not null,
  acao text not null,
  em timestamptz not null default now()
);

-- Documentos: arquivo imutável no volume (chave_arquivo), estado controlado pelo servidor.
create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete restrict,
  nome text not null,
  tipo text not null,
  tamanho integer not null,
  sha256 text,
  chave_arquivo text unique,               -- null quando o arquivo foi recusado e apagado
  status text not null check (status in ('disponivel_analise', 'aprovado', 'rejeitado')),
  motivo text,
  orientacao jsonb,
  recebido_em timestamptz not null default now(),
  validado_em timestamptz,
  decidido_por text,
  decidido_em timestamptz
);
create index if not exists documentos_usuario on documentos(usuario_id, recebido_em desc);

create table if not exists acessos_documentos (
  id bigserial primary key,
  documento_id uuid not null,
  usuario_id uuid not null,
  papel text not null,
  em timestamptz not null default now()
);

-- Agendamentos: data SOLICITADA (data civil, sem hora) x horário CONFIRMADO pela equipe.
create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null,
  descricao text,
  data_solicitada date,
  horario_confirmado timestamptz,
  confirmado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists agendamentos_usuario on agendamentos(usuario_id);
