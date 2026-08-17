# Máquina de estados de cartões

## Fonte de verdade

`CreditCardInvoicePayment` é a única evidência de saída de caixa e liquidação. Data de compra, fechamento, vencimento ou passagem do tempo nunca marca uma parcela como paga.

A compra e suas parcelas são despesas por competência. A `Transaction` vinculada usa `affectsBalance = false`; o pagamento da fatura reduz o saldo da conta. Assim, a despesa aparece uma vez no resultado e a saída aparece uma vez no saldo.

## Reconciliação

Toda criação, edição, exclusão ou estorno de pagamento termina em `reconcileCreditCardInvoice(tx, invoiceId)`. Dentro da mesma transação, o serviço recalcula:

- `invoice.amount`: soma das parcelas não canceladas;
- `invoice.paidAmount`: soma exata dos pagamentos;
- fatura `PAID` somente quando pagamento e valor ativo são iguais;
- parcela, responsabilidades e lançamento `PAID/SETTLED` somente com cobertura integral por pagamento;
- pagamento ligado a uma parcela liquida apenas essa parcela;
- pagamentos gerais são apropriados deterministicamente às parcelas mais antigas;
- pagamento parcial que não cobre uma parcela mantém essa parcela aberta;
- cancelamento define parcela, responsabilidades e lançamento como cancelados.

Pagamentos acima do valor ativo, vínculos cruzados, parcela sem lançamento e responsabilidades cuja soma não fecha são erros de integridade. O serviço interrompe a transação; ele não limita valores nem mascara divergências.

## Vencimento e limite

`isOverdue` é apenas uma informação de apresentação para parcela aberta com vencimento anterior ao dia atual. Ela continua `OPEN` até existir pagamento.

O limite comprometido é a soma de `invoice.amount - invoice.paidAmount` de todas as faturas do cartão. Vencimento não libera limite; pagamento ou cancelamento libera o valor correspondente.

## Regras estruturais

- compra com pagamentos não pode ter cartão, valor, parcelas ou datas reescritos nem ser excluída/cancelada;
- excluir ou cancelar compra nunca exclui pagamento implicitamente;
- titular, dia de fechamento e dia de vencimento ficam imutáveis após existir compra ou fatura;
- faturas históricas preservam o `dueDate` gravado;
- existe no máximo uma fatura para cada `(cardId, month)`.

Antes do deploy, execute [credit-card-reconciliation-preview.sql](./credit-card-reconciliation-preview.sql) em modo somente leitura. A migration falha com uma mensagem explícita se encontrar dados que não possam ser reconciliados sem decisão humana.
