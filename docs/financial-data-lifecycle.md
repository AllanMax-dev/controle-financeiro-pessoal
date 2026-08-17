# Ciclo de vida dos dados financeiros

## Princípio

Dados financeiros realizados são históricos. Remover um cadastro interrompe seu uso futuro, mas não apaga lançamentos, pagamentos, transferências, ajustes ou movimentações já registrados.

## Política por entidade

| Entidade | Sem histórico | Com histórico | Restauração |
| --- | --- | --- | --- |
| Conta | Exclusão definitiva | `active = false` | `active = true` |
| Categoria | Exclusão definitiva | `active = false` | `active = true` |
| Salário | Exclusão definitiva | `active = false` e `archivedAt` | Limpa `archivedAt` e reativa |
| Gasto fixo | Exclusão definitiva | `active = false` e `endedAt` | Limpa `endedAt` e reativa |
| Cartão | Exclusão definitiva | `active = false` | `active = true` |
| Dívida | Exclusão definitiva se nunca paga | `active = false` e `canceledAt` | Limpa `canceledAt` e reativa |
| Cofrinho | Exclusão definitiva se vazio | `status = ARCHIVED` | `status = ACTIVE` |
| Investimento | Não se aplica | Sempre arquivado | `active = true` |

Contas com histórico não permitem alterar titular, saldo inicial ou tipo. O saldo inicial é um fato de abertura; correções posteriores devem ser feitas por `BalanceAdjustment`.

Categorias referenciadas não permitem mudar entre receita e despesa.

## Semântica de investimento

O modelo atual representa uma posição financeira em uma data de referência: `amount` é o valor observado em `referenceDate`. Arquivar uma posição remove seu valor dos totais correntes, mas preserva o snapshot para auditoria e relatórios históricos.

## Auditoria e atomicidade

`AuditLog` é append-only. Exclusões e atualizações são bloqueadas no PostgreSQL pelo trigger `AuditLog_append_only`. Ações de archive, delete e restore registram o snapshot anterior em `metadata` na mesma transação da alteração.

Nenhuma exclusão de cadastro pode apagar automaticamente `Transaction`, `Transfer`, `CreditCardInvoicePayment`, `BalanceAdjustment`, parcelas pagas ou movimentos de cofrinho.
