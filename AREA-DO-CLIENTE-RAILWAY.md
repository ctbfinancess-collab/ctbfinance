# Área do Cliente no Railway

A Área do Cliente roda **no próprio servidor do site** (`server.mjs`), com banco **Postgres do Railway** e arquivos num **volume** do Railway. Não usa Firebase. Sem configuração, o site continua mostrando "acesso em preparação".

## Configurar (quando for autorizado publicar)
1. No projeto do Railway, adicionar o serviço **PostgreSQL** e, no serviço do site, a variável `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (conexão interna).
2. No serviço do site, criar um **Volume** montado em `/data` e a variável `ARQUIVOS_DIR=/data/arquivos`.
3. Região: **EU West (Amsterdã)** — confirmado pela titular em 17/11/2026 que os documentos podem ficar na Europa. Site, Postgres e volume na mesma região.
4. Ativar **backups** do volume e do Postgres (diário/semanal/mensal) no painel.
5. As variáveis do Resend já existentes (`RESEND_API_KEY`, `CONTACT_EMAIL_FROM`) enviam os convites e as redefinições de senha.
6. Publicar. As tabelas são criadas sozinhas na primeira partida (`server/area/schema.sql`).

## Operação da equipe (`node scripts/ctb-admin.mjs …`)

**Onde executar** (fontes: [railway run](https://docs.railway.com/cli/run), [railway ssh](https://docs.railway.com/cli/ssh)):
- `railway ssh` abre um shell **dentro do container** do serviço do site, onde o volume está montado (`/data`). É o modo para **comandos de arquivos** e serve também para os demais.
- `railway run <comando>` executa **no seu computador**, apenas injetando as variáveis do Railway. Serve para **comandos só de banco** quando a rede permite alcançar o Postgres; **não** dá acesso ao volume.
- O script abre o volume (`ARQUIVOS_DIR`) só nos comandos de arquivos; os de banco não precisam dele.

| Comando | Usa | Onde rodar |
|---|---|---|
| `usuarios:convidar <email> "Nome" [pt\|en]` — convite por e-mail (72 h, uso único; **um novo convite cancela o anterior**) | banco + Resend | `railway ssh` ou `railway run` |
| `usuarios:bloquear` / `usuarios:desbloquear <email>` — bloqueio encerra as sessões na hora | banco | `railway ssh` ou `railway run` |
| `usuarios:ver <email>` (ficha completa, inclui o número inteiro do passaporte — a web só mostra os 3 últimos) | banco | `railway ssh` ou `railway run` |
| `usuarios:passaporte-conferir <email>` (confere o que o cliente informou e TRAVA o campo) · `usuarios:passaporte-liberar <email>` (destrava) | banco | `railway ssh` ou `railway run` |
| `usuarios:passaporte <email> <número> [AAAA-MM-DD]` (equipe grava já conferido; trava o campo) | banco | `railway ssh` ou `railway run` |
| `equipe:conceder` / `equipe:revogar` / `equipe:listar` — revogação vale na hora | banco | `railway ssh` ou `railway run` |
| `docs:listar [status]`, `docs:aprovar <id>`, `docs:rejeitar <id> "PT" ["EN"]` | banco | `railway ssh` ou `railway run` |
| `docs:baixar <id> <pasta>` — salva como `<id>.<extensão>`, nunca com o nome enviado pelo cliente, e não sobrescreve | **volume** | **`railway ssh`** (o arquivo fica no container; copie depois pelo próprio shell/ferramenta autorizada) |
| `agenda:registrar <email> <AAAA-MM-DD> "tipo"`, `agenda:confirmar <id> <AAAA-MM-DDTHH:MM> [--sem-email]` (Dubai; datas/horas impossíveis são recusadas; envia e-mail de confirmação ao cliente no idioma do convite) | banco | `railway ssh` ou `railway run` |
| `agenda:listar [--todos]` (pedidos sem horário confirmado; os pedidos feitos pelo cliente também chegam por e-mail em CONTACT_EMAIL_TO) | banco | `railway ssh` ou `railway run` |
| `arquivos:reconciliar [--aplicar]` — volume × banco (padrão: simulação) | **volume** + banco | **`railway ssh`** |

**Links de senha:** cada novo convite ou "esqueci a senha" cancela os links anteriores ainda pendentes; quando uma senha é definida, todos os links pendentes daquela conta deixam de valer e as sessões abertas são encerradas.

## Segurança (resumo)
Contas só por convite · senha com hash scrypt · limite de login atômico, reservado antes de conferir a senha (15 min: 5 por conta a partir do mesmo IP, 30 por IP, 30 por conta somando todos os IPs — um IP onde o cliente já entrou com sucesso fica isento desse teto geral, então um ataque distribuído não o impede de entrar de casa) · IP do visitante lido de `X-Real-IP`, que o proxy do Railway substitui pelo IP real (configurável em `AREA_CABECALHO_IP`; **conferir no primeiro teste após publicar** ligando temporariamente `AREA_DIAGNOSTICO_IP=1`, que faz `/api/cliente/status` mostrar o IP visto — desligar logo depois) · cota de envio por cliente (30 arquivos guardados ou 200 MB por 24 h; recusas com limite próprio de 50; no máximo 3 envios simultâneos) · limpeza automática de tentativas, sessões e links antigos · queda de conexão do banco não derruba o site · cabeçalhos HSTS, CSP (frame-ancestors/base-uri/object-src/form-action) e Permissions-Policy · sessão em cookie HttpOnly/SameSite=Strict/Secure, guardada como hash, expira com 2 h sem uso ou 12 h no total, encerrada ao fechar o navegador · limite de tentativas de login e de "esqueci a senha" · proteção CSRF por Origin · cada cliente só acessa os próprios dados · documentos no volume fora da pasta pública, imutáveis, baixados só pelo servidor (sem link) e com registro de acesso · detecção preliminar de formato (início e fim do arquivo) no envio.

## Testes (locais, Postgres real via embedded-postgres)
`npm run test:area` (43 casos) · `npm run test:correcoes` (R1–R4, 30 casos) · `npm run test:revisao` (revisão independente V1–V11, 31 casos) · `npm run test:navegador` (Chrome real, 24).

## Instalação reproduzível
O `package-lock.json` foi completado com o npm 11.9.0 (mesma versão da revisão), sem alterar versões: `npm ci` limpo funciona em macOS arm64 e com a plataforma Linux x64 (`--os=linux --cpu=x64`). O Railway instala com `npm ci` a partir deste lock.
