# Relatório final de confiabilidade

## Escopo

Esta rodada separou regras recorrentes de ocorrências financeiras, reforçou consistência transacional e eliminou truncamentos silenciosos que poderiam alterar totais. Todas as validações de banco descritas neste documento são executadas apenas em PostgreSQL local isolado; o banco de produção não é alterado pelos testes.

## Matriz de operações

| Domínio | Criar | Editar | Arquivar/encerrar | Excluir com segurança | Pagar/confirmar | Desfazer | Concorrência/integridade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Conta | Sim | Sim, com versão | Sim | Sim, sem referências | N/A | Ajuste explícito | Versão e ajuste serializável |
| Categoria | Sim | Sim | Sim | Sim, sem referências | N/A | N/A | Integridade de workspace |
| Lançamento | Sim | Sim, com versão | N/A | Sim | Liquidar | Excluir/editar ocorrência | Versão e vínculo pessoa/conta |
| Salário | Sim | Metadados; estrutura histórica protegida | Sim, temporal | Sim, sem histórico | Confirmar ocorrência idempotente | Excluir recebimento | Chave salário + competência e versão |
| Gasto fixo | Sim | Futuro; histórico protegido | Sim, temporal | Sim, sem histórico | Pagar ocorrência | Desfazer pagamento | Competência única e versão |
| Dívida | Sim | Metadados; estrutura paga protegida | Sim | Sim, sem histórico | Pagar parcela | Desfazer pagamento | Totais, cotas, vínculo e versão |
| Cartão | Sim | Sim, com versão | Sim | Sim, sem histórico | Pagar fatura/parcela | Desfazer pagamento | Reconciliação de fatura e versão |
| Cofrinho | Sim | Sim | Encerrar | Sim quando permitido | Depositar | Retirar/excluir movimento válido | Saldo não negativo em transação serializável |
| Investimento | Sim | Sim | Encerrar | Sim | N/A | N/A | Fonte única no patrimônio e vínculo da conta |
| Transferência | Sim | Sim, com versão | N/A | Sim | Liquidação atômica | Excluir | Saldo disponível, donos e serialização |
| Ajuste de saldo | Sim | N/A | N/A | Sim | N/A | Novo ajuste explícito | Snapshot calculado dentro da transação |

## Cálculos e consultas

- Os totais financeiros usam o conjunto completo de registros aplicáveis, sem limites `take` de apresentação.
- Cada página carrega somente os domínios necessários; o painel mantém a visão consolidada.
- O saldo de um mês histórico representa o saldo ao fim do período selecionado.
- O saldo do casal é a soma dos saldos individuais; transferências internas reduzem uma pessoa e aumentam a outra sem alterar o total do casal.
- Salários e gastos fixos arquivados continuam visíveis nos meses em que a regra estava vigente.
- Definições recorrentes não são somadas novamente às transações confirmadas.

## Validação de entrada

As ações financeiras validam identificadores, versões, enums, datas reais, competências mensais, cores e valores monetários com Zod. Datas impossíveis, valores não numéricos, valores não positivos onde proibidos e versões inválidas são rejeitados antes do acesso ao banco.

## Estratégia de testes

- Unitários: dinheiro, rateio, datas reais e schemas de formulário.
- Integração: contas, lançamentos, salários, gastos fixos, dívidas, cartões, cofrinhos, investimentos, transferências, ajustes e concorrência.
- E2E: navegador real, Next.js, server actions, Prisma, PostgreSQL e confirmação visual do resultado.
- Migrations: banco vazio, aplicação de todas as migrations, seed e verificação de invariantes.
- Integridade: SQL somente leitura e verificador automatizado de totais, cotas, pagamentos, ownership e workspace.

## Pipeline obrigatório

O CI executa instalação limpa, validação e geração do Prisma, migrations, seed, encoding, TypeScript, lint, testes, build, E2E e auditoria somente leitura. Qualquer falha interrompe o pipeline.

## Condição de deploy

O deploy é considerado seguro somente quando migrations, testes, E2E, baseline SQL e verificação automatizada de invariantes terminam sem violações. Nenhuma migration já aplicada é modificada.
