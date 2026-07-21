import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { CreateGroupForm } from "@/components/groups/CreateGroupForm";
import { CoCupperCard } from "@/components/groups/CoCupperCard";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [groups, cuppers] = await Promise.all([
    prisma.tastingGroup.findMany({
      where: { createdBy: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    }),
    getCoCupperCandidates(user.id),
  ]);

  const t = await getTranslations("groups");

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  const addToGroupT = {
    addToGroup: t("addToGroup"),
    newGroupOption: t("newGroupOption"),
    namePlaceholder: t("namePlaceholder"),
    create: t("create"),
    added: t("added"),
    errorGeneric: t("errorGeneric"),
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl text-green-dark font-semibold">{t("title")}</h1>
        <p className="text-sm text-brown-mid mt-1">{t("subtitle")}</p>
      </div>

      {/* My groups */}
      <div className="space-y-4">
        <CreateGroupForm
          t={{
            newGroup: t("newGroup"),
            namePlaceholder: t("namePlaceholder"),
            create: t("create"),
            errorGeneric: t("errorGeneric"),
          }}
        />

        {groups.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/${locale}/app/groups/${g.id}`}
                className="block bg-white rounded-xl border border-[#E8E0D0] p-5 transition-all hover:shadow-md hover:border-[#6B8F71]"
              >
                <p className="font-semibold text-[15px] text-brown-dark truncate">{g.name}</p>
                <p className="text-xs text-brown-mid mt-2">
                  {g._count.members}{" "}
                  {g._count.members === 1
                    ? t("members").toLowerCase().replace(/s$/, "")
                    : t("members").toLowerCase()}{" "}
                  · {formatDate(g.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Co-cuppers */}
      <div className="space-y-4">
        <h2 className="font-serif text-xl text-green-dark">{t("coCuppersTitle")}</h2>
        {cuppers.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noCoCuppers")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cuppers.map((c) => (
              <CoCupperCard key={c.userId} cupper={c} groups={groupOptions} t={addToGroupT} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
