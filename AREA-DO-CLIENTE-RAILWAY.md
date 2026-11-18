# Área do Cliente no Railway

A Área do Cliente roda **no próprio servidor do site** (`server.mjs`), com banco **Postgres do Railway** e arquivos num **volume** do Railway. Não usa Firebase. Sem configuração, o site continua mostrando "acesso em preparação".

## Configurar (quando for autorizado publicar)
1. No projeto do Railway, adicionar o serviço **PostgreSQL** e, no serviço do site, a variável `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (conexão interna).
2. No serviço do site, criar um **Volume** montado em `/data` e a variável `ARQUIVOS_DIR=/data/arquivos`.
3. Região: **EU West (Amsterdã)** — confirmado pela titular em 17/11/2026 que os documentos podem ficar na Europa. Site, Postgres e volume na mesma região.
4. Ativar **backups** do volume e do Postgres (diário/semanal/mensal) no painel.
5. As variáveis do Resend já existentes (`RESEND_API_KEY`, `CONTACT_EMAIL_FROM`) enviam os convites e as redefinições de senha.
6. Publicar. As tabelas são criadas sozinhas na primeira partida (`server/area/schema.sql`).

## Operação da equipe (`node scripts/ctb-admin.mjs …`, no shell do serviço ou com `railway run`)
- `usuarios:convidar <email> "Nome" [pt|en]` — cria a conta e envia o convite (link de 72 h, uso único)
- `usuarios:bloquear <email>` — bloqueia e encerra as sessões na hora
- `usuarios:passaporte <email> <número>` — dado conferido pela equipe (o cliente vê mascarado)
- `equipe:conceder|revogar|listar` — revogação vale na hora (conferida a cada requisição)
- `docs:listar [status]`, `docs:baixar <id> <pasta>`, `docs:aprovar <id>`, `docs:rejeitar <id> "orientação PT" ["EN"]`
- `agenda:registrar <email> <AAAA-MM-DD> "tipo"`, `agenda:confirmar <id> <AAAA-MM-DDTHH:MM>` (horário de Dubai)
- `arquivos:reconciliar [--aplicar]` — confere volume x banco (padrão: simulação)

## Segurança (resumo)
Contas só por convite · senha com hash scrypt · sessão em cookie HttpOnly/SameSite=Strict/Secure, guardada como hash, expira com 2 h sem uso ou 12 h no total, encerrada ao fechar o navegador · limite de tentativas de login e de "esqueci a senha" · proteção CSRF por Origin · cada cliente só acessa os próprios dados · documentos no volume fora da pasta pública, imutáveis, baixados só pelo servidor (sem link) e com registro de acesso · detecção preliminar de formato (início e fim do arquivo) no envio.

## Testes (locais, Postgres real via embedded-postgres)
`npm run test:area` (servidor + banco + volume) · `npm run test:navegador` (Chrome real).
