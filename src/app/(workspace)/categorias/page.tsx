import Link from "next/link";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { toggleCategoryActiveAction } from "@/modules/categories/application/category-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

export default async function CategoriesPage() {
  const access = await requireCurrentAccess();
  const categories = await getDatabase().category.findMany({
    where: { workspaceId: access.workspaceId },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  const categoryGroups = [
    {
      categories: categories.filter((category) => category.kind === "EXPENSE"),
      description: "Categorias usadas para leitura de custos e orçamento.",
      title: "Despesas",
    },
    {
      categories: categories.filter((category) => category.kind === "INCOME"),
      description: "Categorias usadas para entradas e recebimentos.",
      title: "Receitas",
    },
  ];

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Classificação</p>
          <h1>Categorias</h1>
          <p>Organize receitas e despesas sem perder o histórico das categorias arquivadas.</p>
        </div>
        <Link className="primary-button" href="/categorias/nova">
          <Icon name="add" />
          Nova categoria
        </Link>
      </section>

      {categories.length === 0 ? (
        <EmptyState
          action={{ href: "/categorias/nova", label: "Criar categoria" }}
          description="Crie categorias para entender receitas, despesas e composição dos lançamentos."
          icon="category"
          title="Nenhuma categoria cadastrada"
        />
      ) : (
        <section className="category-groups" aria-label="Categorias cadastradas">
          {categoryGroups.map((group) => (
            <div className="category-group" key={group.title}>
              <header>
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <span>{group.categories.length}</span>
              </header>
              <div className="entity-list">
                {group.categories.map((category) => (
                  <article
                    className={`entity-row category-row${category.active ? "" : " entity-row-muted"}`}
                    key={category.id}
                  >
                    <span className="entity-color" style={{ backgroundColor: category.color ?? "#256b4b" }} />
                    <div className="entity-main">
                      <strong>{category.name}</strong>
                      <span>{category.kind === "INCOME" ? "Receita" : "Despesa"}</span>
                    </div>
                    <div className="entity-value">
                      <strong>{category._count.transactions}</strong>
                      <span>{category._count.transactions === 1 ? "lançamento" : "lançamentos"}</span>
                      <span className={`status-pill ${category.active ? "status-settled" : "status-canceled"}`}>
                        {category.active ? "Ativa" : "Arquivada"}
                      </span>
                    </div>
                    <div className="row-actions">
                      <Link className="text-button" href={`/categorias/${category.id}/editar`}>
                        Editar
                      </Link>
                      <form action={toggleCategoryActiveAction}>
                        <input name="id" type="hidden" value={category.id} />
                        <input name="version" type="hidden" value={category.version} />
                        <input name="active" type="hidden" value={String(!category.active)} />
                        <button className="text-button" type="submit">
                          {category.active ? "Arquivar" : "Reativar"}
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
