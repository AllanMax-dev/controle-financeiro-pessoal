const firstSteps = [
  "Entre pelo link privado de Allan ou Mayara. O link identifica quem está operando, mas ambos podem cadastrar dados para Allan e para Mayara.",
  "Comece pelas categorias. Crie categorias globais como Alimentação, Moradia, Transporte, Salário e Extras.",
  "Cadastre as contas em Bancos. Cada conta pertence a Allan ou Mayara e o saldo inicial deve refletir o dinheiro real disponível naquele momento.",
  "Registre recebimentos e salários recorrentes. Use recebimento avulso para entradas pontuais e salário recorrente para pagamentos mensais ou quinzenais.",
];

const routineSteps = [
  "Use Gastos variáveis para compras do dia a dia pagas em conta ou dinheiro.",
  "Use Dívidas para gastos fixos, compras no cartão e parcelas planejadas, sempre separados entre Allan, Mayara e Casal.",
  "Use Transferências para mover dinheiro entre contas. Transferência não é gasto nem recebimento do casal.",
];

const readingSteps = [
  "No Dashboard, mantenha Casal selecionado para ver a soma de Allan e Mayara.",
  "Troque para Allan ou Mayara quando quiser analisar apenas uma pessoa.",
  "Use o seletor de mês para navegar por competências. A mesma competência acompanha as telas principais.",
  "Saldo disponível vem das contas. Investimentos entram no patrimônio, mas não aumentam o dinheiro disponível.",
  "Cofrinhos são reservas dentro do dinheiro existente. Reservar dinheiro em cofrinho não cria dinheiro novo.",
];

function GuideSection({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="guide-section">
      <h2>{title}</h2>
      <ol>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

export default function HowToUsePage() {
  return (
    <>
      <section className="finance-page-header">
        <div>
          <p>Primeiro acesso</p>
          <h1>Como usar</h1>
        </div>
      </section>
      <section className="guide-hero">
        <div>
          <span>Fluxo recomendado</span>
          <strong>Categorias, bancos, recebimentos e depois gastos.</strong>
        </div>
        <p>
          O sistema começa financeiramente zerado. Allan e Mayara são as pessoas responsáveis pelos registros; Casal é apenas a soma dos dois no dashboard.
        </p>
      </section>
      <div className="guide-grid">
        <GuideSection items={firstSteps} title="1. Prepare a base" />
        <GuideSection items={routineSteps} title="2. Registre a rotina" />
        <GuideSection items={readingSteps} title="3. Acompanhe o resultado" />
      </div>
      <section className="guide-section guide-checklist">
        <h2>Checklist de configuração inicial</h2>
        <ul>
          <li>Categorias de receita e despesa criadas.</li>
          <li>Contas de Allan e Mayara cadastradas com saldo real.</li>
          <li>Salários e recebimentos recorrentes cadastrados.</li>
          <li>Dívidas fixas, cartões e parcelas cadastrados quando existirem.</li>
          <li>Cofrinhos e investimentos registrados quando existirem.</li>
        </ul>
      </section>
    </>
  );
}
