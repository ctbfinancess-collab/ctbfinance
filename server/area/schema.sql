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

-- idioma dos e-mails automáticos ao cliente (definido no convite)
alter table usuarios add column if not exists idioma text not null default 'pt';

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
-- web: identificador no cookie HttpOnly · app: token no cabeçalho Authorization (guardado no cofre do aparelho)
alter table sessoes add column if not exists tipo text not null default 'web';
alter table sessoes add column if not exists dispositivo text;

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

-- Passaporte: o cliente informa número e validade; depois que a equipe confere o documento, o campo trava
-- (alterações só pela equipe).
alter table perfis add column if not exists passaporte_conferido_em timestamptz;
alter table perfis add column if not exists passaporte_conferido_por text;

-- Equipe: papel controlado SÓ pelo servidor/scripts; conferido a cada requisição (revogação imediata).
create table if not exists equipe (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  ativo boolean not null,
  concedido_em timestamptz,
  revogado_em timestamptz
);
-- Interessados: pedidos recebidos pelos formulários do site (Seja nosso cliente / Contato). Só a equipe vê.
create table if not exists interessados (
  id uuid primary key default gen_random_uuid(),
  formulario text not null check (formulario in ('cliente', 'contato')),
  nome text not null,
  email text not null,
  telefone text,
  tipo text,
  empresa text,
  pais text,
  area text,
  assunto text,
  idioma text not null default 'pt',
  mensagem text not null,
  status text not null default 'novo' check (status in ('novo', 'respondido', 'convidado', 'arquivado')),
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz,
  atualizado_por text,
  usuario_id uuid references usuarios(id) on delete set null
);
create index if not exists interessados_status on interessados(status, recebido_em desc);

-- Financeiro (CONSULTA): dados lançados pela equipe no Admin; o cliente só lê os dele. Valores em centavos (bigint).
create table if not exists contas_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('digital', 'global', 'investimentos')),
  moeda text not null check (moeda in ('AED', 'USD', 'EUR', 'GBP', 'BRL')),
  saldo_centavos bigint not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  unique (usuario_id, tipo, moeda)
);
create table if not exists movimentos_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  conta_id uuid not null references contas_cliente(id) on delete cascade,
  data date not null,
  descricao text not null,
  valor_centavos bigint not null,              -- positivo = crédito · negativo = débito
  criado_em timestamptz not null default now(),
  criado_por text
);
create index if not exists movimentos_cliente_usuario on movimentos_cliente(usuario_id, data desc, criado_em desc);
-- true = o valor já foi somado ao saldo da conta (movimentos novos); lançamentos antigos ficam false e não alteram o saldo ao serem excluídos
alter table movimentos_cliente add column if not exists aplicado_no_saldo boolean not null default false;
create table if not exists posicoes_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  classe text not null check (classe in ('renda_fixa', 'renda_variavel', 'fundos', 'alternativos', 'exterior')),
  descricao text not null,
  moeda text not null check (moeda in ('AED', 'USD', 'EUR', 'GBP', 'BRL')),
  valor_centavos bigint not null check (valor_centavos >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists posicoes_cliente_usuario on posicoes_cliente(usuario_id);
create table if not exists cartoes_cliente (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  final text not null check (final ~ '^[0-9]{4}$'),
  bandeira text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'bloqueado', 'em_emissao')),
  moeda text not null default 'AED' check (moeda in ('AED', 'USD', 'EUR', 'GBP', 'BRL')),
  limite_centavos bigint check (limite_centavos >= 0),
  fatura_centavos bigint check (fatura_centavos >= 0),
  vencimento date,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Registro das ações feitas pelo painel da equipe (quem, o quê, sobre quem, quando). Só inserções.
create table if not exists acoes_equipe (
  id bigserial primary key,
  por_usuario uuid,
  por_email text not null,
  acao text not null,
  alvo text,
  detalhes jsonb not null default '{}'::jsonb,
  em timestamptz not null default now()
);
create index if not exists acoes_equipe_em on acoes_equipe(em desc);
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
-- pedido feito pelo próprio cliente na Área do Cliente (a equipe confirma o horário depois)
alter table agendamentos add column if not exists solicitado_pelo_cliente boolean not null default false;
-- preferências escolhidas por clique no pedido: formato (vídeo/presencial) e melhor horário (fuso de Dubai)
alter table agendamentos add column if not exists formato text;
alter table agendamentos add column if not exists periodo text;

-- IPs de onde o cliente já entrou com sucesso: isentos do teto geral por conta (o cliente não é bloqueado
-- por um ataque distribuído quando entra de um lugar conhecido; o limite por conta+IP continua valendo).
create table if not exists ips_confiaveis (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  ip text not null,
  ultimo_login_em timestamptz not null default now(),
  primary key (usuario_id, ip)
);

-- Solicitações de operação feitas pelo cliente (transferência / câmbio). NADA é executado automaticamente:
-- a equipe analisa, executa fora do sistema e, ao concluir, pode lançar no extrato (movimento_id).
create table if not exists operacoes_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('transferencia_local','transferencia_swift','cambio')),
  conta_id uuid references contas_cliente(id) on delete set null,
  moeda text not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  moeda_destino text,
  beneficiario jsonb not null default '{}'::jsonb,
  observacao text,
  status text not null default 'recebida' check (status in ('recebida','em_analise','concluida','recusada')),
  motivo text,
  movimento_id uuid references movimentos_cliente(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists operacoes_cliente_usuario on operacoes_cliente(usuario_id, criado_em desc);
create index if not exists operacoes_cliente_status on operacoes_cliente(status, criado_em desc);

-- Instrumentos financeiros internacionais (SBLC, LC, BG…): SOMENTE solicitação, análise e acompanhamento.
-- O sistema nunca emite garantia, nunca gera mensagem SWIFT e nunca mexe em saldo/extrato.
alter table equipe add column if not exists aprova_instrumentos boolean not null default false;
-- documentos anexados a uma solicitação de instrumento não aparecem na aba Documentos (origem marcada)
alter table documentos add column if not exists origem text;
create sequence if not exists instrumentos_ref_seq;
create table if not exists instrumentos_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  referencia text unique,
  instrumento text not null,
  categoria text not null check (categoria in ('garantia','declaracao')),
  moeda text not null default 'USD',
  valor_centavos bigint check (valor_centavos is null or valor_centavos > 0),
  beneficiario jsonb not null default '{}'::jsonb,
  ordenante jsonb not null default '{}'::jsonb,
  finalidade text,
  banco_emissor text,
  banco_avisador text,
  validade date,
  operacao_subjacente text,
  contrato_ref text,
  observacoes text,
  status text not null default 'rascunho' check (status in ('rascunho','enviada','analise_documental','documentacao_solicitada','analise_interna',
    'encaminhada','aguardando_instituicao','aprovada','recusada','cancelada','concluida')),
  responsavel_email text,
  instituicao text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
-- solicitação preparada pela equipe para o cliente confirmar (ex.: instrumento incluído no pacote contratado)
alter table instrumentos_solicitacoes add column if not exists preparada_por text;
create index if not exists instrumentos_usuario on instrumentos_solicitacoes(usuario_id, criado_em desc);
create index if not exists instrumentos_status on instrumentos_solicitacoes(status, atualizado_em desc);
create table if not exists instrumentos_eventos (
  id bigserial primary key,
  solicitacao_id uuid not null references instrumentos_solicitacoes(id) on delete cascade,
  tipo text not null check (tipo in ('status','mensagem','nota_interna','anexo','pedido_documento')),
  status_de text,
  status_para text,
  texto text,
  visivel_cliente boolean not null,
  documento_id uuid,
  por_email text,
  por_equipe boolean not null,
  em timestamptz not null default now()
);
create index if not exists instrumentos_eventos_sol on instrumentos_eventos(solicitacao_id, em);
create table if not exists instrumentos_anexos (
  solicitacao_id uuid not null references instrumentos_solicitacoes(id) on delete cascade,
  documento_id uuid not null references documentos(id) on delete restrict,
  por_equipe boolean not null,
  evidencia_de text check (evidencia_de is null or evidencia_de in ('aprovada','concluida')),
  em timestamptz not null default now(),
  primary key (solicitacao_id, documento_id)
);

-- anexos da solicitação com um tipo (ex.: 'contrato_referencia' = contrato com o trader/fornecedor)
alter table instrumentos_anexos add column if not exists tipo text;

-- Contratos gerados no papel timbrado (NDA etc.): preenchidos com o cadastro/solicitação, editáveis pela equipe,
-- só aparecem para o cliente depois de "liberados". Cada gravação guarda uma versão (histórico).
create sequence if not exists contratos_ref_seq;
create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  solicitacao_id uuid references instrumentos_solicitacoes(id) on delete set null,
  referencia text unique not null,
  modelo text not null,
  campos jsonb not null default '{}'::jsonb,
  texto_editado text,
  status text not null default 'rascunho' check (status in ('rascunho','liberado','assinado','cancelado')),
  versao integer not null default 1,
  assinado_documento_id uuid references documentos(id) on delete set null,
  gerado_por text not null,
  automatico boolean not null default false,
  liberado_em timestamptz,
  liberado_por text,
  assinado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists contratos_usuario on contratos(usuario_id, criado_em desc);
create unique index if not exists contratos_auto_unico on contratos(solicitacao_id, modelo) where automatico and status <> 'cancelado';
create table if not exists contratos_versoes (
  contrato_id uuid not null references contratos(id) on delete cascade,
  versao integer not null,
  campos jsonb not null,
  texto_editado text,
  por_email text not null,
  em timestamptz not null default now(),
  primary key (contrato_id, versao)
);
create table if not exists contratos_acessos (
  id bigserial primary key,
  contrato_id uuid not null,
  usuario_id uuid not null,
  papel text not null,
  em timestamptz not null default now()
);
-- configurações da equipe (ex.: quem assina os contratos pela CTB)
create table if not exists configuracoes (
  chave text primary key,
  valor jsonb not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
