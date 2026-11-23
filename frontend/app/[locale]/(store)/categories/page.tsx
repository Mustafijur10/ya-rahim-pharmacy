import type { Metadata } from "next";
import { getLocale, setRequestLocale } from "next-intl/server";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import CategoryIcon from "@/components/store/CategoryIcon";
import { Link } from "@/i18n/navigation";
import { getCategories } from "@/lib/store-data";

export const metadata: Metadata = { title: "All categories" };

export default async function CategoriesPage({ params }: PageProps<"/[locale]/categories">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [categories, lang] = await Promise.all([getCategories(), getLocale()]);
  const label = (c: { name: string; name_bn: string | null }) => (lang === "bn" && c.name_bn ? c.name_bn : c.name);

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "Categories" }]} />
      <h1 className="m-0 text-3xl">All categories</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c, i) => (
          <section key={c.id} className="card-pad flex flex-col gap-4">
            <Link href={`/category/${c.slug}`} className="flex items-center gap-3 text-ink">
              <CategoryIcon icon={c.icon} index={i} />
              <span className="flex flex-col">
                <span className="text-lg font-bold">{label(c)}</span>
                <span className="text-sm text-muted">{c.medicines_count} products</span>
              </span>
            </Link>
            {c.children?.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {c.children.map((ch) => (
                  <li key={ch.id}>
                    <Link href={`/category/${ch.slug}`} className="chip">
                      {label(ch)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
