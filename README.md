# Controle Financeiro Pessoal

Aplicação autoral de controle financeiro pessoal, criada para organizar contas, lançamentos, planejamento e indicadores financeiros em um único lugar.

## Status do projeto

O núcleo financeiro está implementado com Next.js, TypeScript, PostgreSQL e Prisma. A aplicação já permite gerenciar contas, categorias e lançamentos em desktop e celular.

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

## Funcionalidades atuais

- Dashboard com saldo consolidado, receitas, despesas, resultado e valores pendentes.
- Contas financeiras com saldo inicial, saldo calculado, edição e arquivamento.
- Categorias separadas entre receitas e despesas, com edição e arquivamento.
- Receitas e despesas com competência, vencimento, realização, conta, categoria e observações.
- Dívidas individuais ou compartilhadas com parcelas mensais ou quinzenais nos dias 15 e 30.
- Filtros por mês, tipo, status, conta e categoria.
- Cancelamento confirmado de lançamentos sem remoção do histórico.
- Transferências entre contas com edição e cancelamento.
- Planejamento mensal de despesas por categoria.
- Relatório mensal por categoria e exportação CSV protegida contra fórmulas maliciosas.
- Registro de auditoria associado à pessoa que realizou a alteração.
- Controle de versão para impedir sobrescritas silenciosas entre dispositivos.

## Regras financeiras atuais

- Valores são armazenados em `Decimal(19,2)` e arredondados por `ROUND_HALF_UP`.
- O saldo da conta é o saldo inicial somado às receitas realizadas e subtraído das despesas realizadas.
- Lançamentos pendentes não alteram o saldo atual.
- Lançamentos cancelados não afetam saldos ou indicadores.
- O resultado mensal considera a data de competência e somente valores realizados.
- Transferências internas não alteram o saldo consolidado.

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
