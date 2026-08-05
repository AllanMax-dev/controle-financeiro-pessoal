# Controle Financeiro Pessoal

Aplicação autoral de controle financeiro pessoal, criada para organizar contas, lançamentos, planejamento e indicadores financeiros em um único lugar.

## Status do projeto

A fundação técnica está implementada com Next.js, TypeScript, PostgreSQL e Prisma. O desenvolvimento continua em etapas pequenas, verificáveis e versionadas.

## Diretrizes

- Arquitetura, identidade visual, marca e implementação próprias.
- Privacidade, segurança e isolamento dos dados desde a concepção.
- Requisitos financeiros documentados e validados antes da implementação.
- O desenvolvimento será realizado em etapas verificáveis e versionadas.

## Acesso compartilhado

Não existem contas, senhas ou formulário de login. Cada uma das duas pessoas recebe um link privado. No primeiro acesso em cada dispositivo, o link cria uma sessão segura e é removido da barra de endereço.

- Os tokens são aleatórios e armazenados somente como hash no banco.
- Cada pessoa pode usar seu link no computador e no celular.
- Criar um novo link para uma pessoa revoga o link e as sessões anteriores dela.
- O endereço privado nunca deve ser publicado ou incluído no código-fonte.

## Requisitos

- Node.js 20.19 ou mais recente.
- PostgreSQL 16 ou mais recente.
- Docker Compose é opcional para executar o PostgreSQL localmente.

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env` e ajuste as variáveis.

3. Inicie o PostgreSQL, caso utilize Docker:

   ```bash
   docker compose up -d
   ```

4. Aplique as migrations e prepare o espaço compartilhado:

   ```bash
   npm run prisma:deploy
   npm run seed
   ```

5. Gere um link para cada pessoa:

   ```bash
   npm run access:create -- --name "Pessoa 1"
   npm run access:create -- --name "Pessoa 2"
   ```

6. Inicie a aplicação:

   ```bash
   npm run dev
   ```

## Produção

Configure `DATABASE_URL`, `APP_URL`, `WORKSPACE_NAME`, `WORKSPACE_SLUG` e `SESSION_TTL_DAYS` no provedor escolhido. `APP_URL` deve conter o endereço HTTPS definitivo para que os cookies recebam a proteção `Secure`.

Antes de iniciar a aplicação em um banco novo, execute:

```bash
npm run prisma:deploy
npm run seed
```

Os links privados devem ser gerados somente depois que o banco de produção estiver disponível.

## Verificações

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Para revogar o acesso de uma pessoa:

```bash
npm run access:revoke -- --name "Pessoa 1"
```
