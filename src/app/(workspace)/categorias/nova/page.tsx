import { CategoryForm } from "@/components/category-form";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createCategoryAction } from "@/modules/categories/application/category-actions";
import {
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );

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
        defaults={{ color: "#256b4b", contextId: contextState.current.id, kind: "EXPENSE", name: "" }}
        submitLabel="Criar categoria"
      />
    </>
  );
}
