import { CategoryForm } from "@/components/category-form";
import { createCategoryAction } from "@/modules/categories/application/category-actions";

export default function NewCategoryPage() {
  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Categorias</p>
          <h1>Nova categoria</h1>
          <p>Escolha se ela será usada em receitas ou despesas.</p>
        </div>
      </section>
      <CategoryForm
        action={createCategoryAction}
        defaults={{ color: "#256b4b", kind: "EXPENSE", name: "" }}
        submitLabel="Criar categoria"
      />
    </>
  );
}
