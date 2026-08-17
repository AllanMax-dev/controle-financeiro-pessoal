# BASELINE DO BANCO

Auditoria executada em 2026-08-17 18:30:41 UTC contra o banco de produção `neondb` (PostgreSQL 17.10), sem expor credenciais.

## Escopo e proteção

- Commit auditado: `7adf0ff` (`docs: adicionar auditoria read-only do banco`).
- Branch: `main`, sincronizada com `origin/main` no início da auditoria.
- `npx prisma validate`: aprovado.
- `npx prisma generate`: aprovado com Prisma 7.9.1.
- Todas as consultas de dados foram executadas com `PGOPTIONS=-c default_transaction_read_only=on`.
- A suíte principal também usou `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`.
- Nenhum `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, migration ou correção foi executado no banco.
- SQL integral da auditoria: [database-integrity-audit.sql](./database-integrity-audit.sql).

## Migration status

`npx prisma migrate status` encontrou 16 migrations e informou `Database schema is up to date`.

| Indicador | Resultado |
| --- | ---: |
| Migrations locais | 16 |
| Migrations aplicadas com sucesso | 16 |
| Registros em `_prisma_migrations` | 20 |
| Tentativas marcadas como rollback | 4 |
| Tentativas não resolvidas | 0 |
| Checksums divergentes após normalizar apenas CRLF/LF | 0 |

Histórico crítico:

| Migration | Tentativas | Sucesso | Rollback | Situação |
| --- | ---: | ---: | ---: | --- |
| `20260810190000_add_financial_contexts_cards_and_goals` | 4 | 1 | 3 | Resolvida e aplicada |
| `20260811143000_rebuild_personal_finance` | 1 | 1 | 0 | Aplicada |
| `20260812220500_normalize_fortnightly_debt_due_dates` | 1 | 1 | 0 | Aplicada |
| `20260812233000_reopen_implicit_paid_installments` | 2 | 1 | 1 | Falha inicial resolvida; versão corrigida aplicada |

SQL utilizado:

```sql
SELECT * FROM "_prisma_migrations" ORDER BY started_at;
```

As tentativas anteriores permanecem no histórico com `rolled_back_at`, e não existe migration pendente ou travada. Nenhuma migration já aplicada foi alterada durante esta auditoria.

## Quantidade por tabela

| Tabela | Quantidade |
| --- | ---: |
| AccessGrant | 2 |
| AccessSession | 69 |
| AuditLog | 82 |
| BalanceAdjustment | 3 |
| Category | 8 |
| CreditCard | 1 |
| CreditCardInstallment | 25 |
| CreditCardInstallmentShare | 12 |
| CreditCardInvoice | 8 |
| CreditCardInvoicePayment | 1 |
| CreditCardPurchase | 8 |
| Debt | 1 |
| DebtInstallment | 27 |
| DebtInstallmentShare | 0 |
| Editor | 2 |
| FinancialAccount | 4 |
| FixedExpense | 4 |
| Investment | 1 |
| Salary | 6 |
| SavingsGoal | 0 |
| SavingsGoalMovement | 0 |
| Transaction | 32 |
| Transfer | 0 |
| Workspace | 1 |

# P0

Nenhuma inconsistência P0 encontrada.

- Valores monetários inválidos: 0.
- Referências entre workspaces: 0 em 52 relações auditadas.
- Pessoa incompatível com a proprietária da conta: 0.
- Totais de fatura, parcelas, pagamentos e shares de cartão divergentes: 0.
- Totais de dívida, parcelas e shares divergentes: 0.
- Pagamentos e status de cartão ou dívida sem evidência correspondente: 0.
- Saldo negativo de cofrinho: 0.
- Transferência para a mesma conta ou proprietário incorreto: 0.
- Categoria incompatível com o tipo financeiro: 0.

As consultas usadas são os blocos A, B, C, D, E, H, I e J de [database-integrity-audit.sql](./database-integrity-audit.sql).

# P1

## P1-01 — reconstrução destrutiva já aplicada no passado

- Tabela: todas as tabelas financeiras existentes antes da reconstrução.
- ID: migration `62bae7db-1ba3-4dc5-bab7-b234e2d816c9`.
- Quantidade: 1 migration.
- Regra violada: dados financeiros realizados devem permanecer históricos.
- Risco: `20260811143000_rebuild_personal_finance` descartou deliberadamente todos os registros financeiros anteriores a 2026-08-11, preservando somente workspace, editores e acessos. O baseline atual não consegue recuperar nem atestar os registros anteriores a esse ponto.
- Situação atual: fato histórico; a migration terminou com sucesso e não deve ser editada.
- SQL de detecção:

```sql
SELECT *
FROM "_prisma_migrations"
WHERE migration_name = '20260811143000_rebuild_personal_finance';
```

## P1-02 — AuditLog não é append-only no código atual

- Tabela: `AuditLog`.
- IDs: não aplicável; risco estático no backend.
- Quantidade: 16 chamadas a `auditLog.deleteMany(...)` em ações financeiras.
- Regra violada: auditoria deve registrar `archive`, `delete`, `cancel` ou `restore`, nunca ser apagada junto com a entidade.
- Risco: operações atuais podem remover a evidência de mudanças anteriores, tornando ausências impossíveis de detectar retrospectivamente no banco.
- SQL de detecção: não aplicável a código-fonte; busca utilizada:

```text
rg -n "auditLog\.deleteMany" src/modules/finance/application/finance-actions.ts
```

## P1-03 — ações destrutivas podem remover histórico financeiro

- Tabelas: `FinancialAccount`, `Transaction`, `Transfer`, `CreditCardInvoicePayment`, `FixedExpense`, `Salary`, `CreditCard`, `CreditCardPurchase`, `SavingsGoal` e dependências.
- IDs: não aplicável; risco estático no backend.
- Quantidade: pelo menos 5 fluxos críticos (`deleteAccountAction`, `deleteFixedExpenseAction`, `deleteSalaryAction`, `deleteCreditCardAction` e `deleteSavingsGoalAction`).
- Regra violada: cadastro utilizado deve ser arquivado; histórico realizado não deve desaparecer silenciosamente.
- Risco: exclusão em cascata ou `deleteMany` explícito altera saldos, dashboards e trilha histórica.
- SQL de detecção: não aplicável a código-fonte; os dados atuais não apresentaram corrupção, mas o caminho destrutivo permanece executável.

Não foram encontradas inconsistências P1 nos registros atuais de cartões, dívidas, salários, gastos fixos, cofrinhos, transferências ou categorias.

# P2

## P2-01 — drift não destrutivo entre produção e schema Prisma

- Tabelas: `DebtInstallmentShare`, `CreditCardInstallmentShare` e `CreditCardInvoicePayment`.
- IDs: não aplicável; metadados de schema.
- Quantidade: 4 diferenças.
- Regra violada: schema de produção e schema Prisma devem convergir.
- Risco: migrations futuras podem tentar remover defaults ou renomear índices repetidamente; não há impacto atual nos dados ou no plano dos índices.
- Detecção:

```text
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
```

Diferenças encontradas:

1. `DebtInstallmentShare.updatedAt` possui `DEFAULT CURRENT_TIMESTAMP` somente no banco.
2. `CreditCardInstallmentShare.updatedAt` possui `DEFAULT CURRENT_TIMESTAMP` somente no banco.
3. Um índice de `CreditCardInstallmentShare` tem nome truncado pelo limite do PostgreSQL.
4. Um índice de `CreditCardInvoicePayment` tem nome truncado pelo limite do PostgreSQL.

## P2-02 — invariantes monetárias dependem majoritariamente da aplicação

- Tabelas: domínio financeiro em geral.
- IDs: não aplicável; metadados de schema.
- Quantidade: somente 4 constraints `CHECK` existem no schema real; 11 das 13 regras monetárias principais auditadas não possuem proteção equivalente no banco.
- Regra violada: invariantes financeiras críticas devem ter defesa em profundidade quando compatível com o modelo.
- Risco: escrita externa ao backend pode inserir valores inválidos, embora o conjunto atual tenha retornado zero violações.
- SQL utilizado:

```sql
SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND contype = 'c';
```

## P2-03 — três divergências históricas foram revisadas e aceitas

### Salários

- Tabela: `Transaction`.
- IDs das transações: `5f9cfc53-b601-4557-a1c0-c30f8fe79221`, `ea656b25-db82-4805-a92e-31f55169091b`.
- IDs dos salários: `80d9babf-d703-4c75-ae63-60a2c3b2bf40`, `ceeea60f-dba5-4643-bbbe-a919a4de0190`.
- Quantidade: 2.
- Regra verificada: pessoa da transação, proprietária da conta e pessoa do salário devem combinar.
- Resultado: pessoas e propriedade das contas combinam. A conta padrão dos salários foi alterada depois das transações realizadas; manter a conta histórica é o comportamento correto.
- Risco: nenhum; corrigir retroativamente corromperia o histórico.
- SQL: verificação `F03` em [database-integrity-audit.sql](./database-integrity-audit.sql).

### Gasto fixo

- Tabela: `Transaction`.
- ID da transação: `a31f2498-bc0a-47f6-8c1f-2c60e671ac30`.
- ID do gasto fixo: `f83574cc-fcf3-4779-b7d6-e8eff08cd54f`.
- Quantidade: 1.
- Regra verificada: pessoa da transação e proprietária da conta devem combinar.
- Resultado: o gasto não possui conta padrão e foi pago por uma conta válida escolhida no pagamento. A pessoa e a proprietária da conta combinam.
- Risco: nenhum; é uma ocorrência histórica válida.
- SQL: verificação `G04` em [database-integrity-audit.sql](./database-integrity-audit.sql).

## Conclusão do baseline

O conjunto de dados atual está consistente nas regras A–J. O maior risco não está nos registros presentes, mas nas semânticas destrutivas do backend e na ausência de proteção append-only para `AuditLog`. Este documento é o ponto de controle anterior às correções de archive/delete/restore.
