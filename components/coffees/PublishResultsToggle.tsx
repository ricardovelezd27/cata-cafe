"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoffeeResultsPublished } from "@/app/actions/coffees";
import { useActionFeedback } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Props = {
  coffeeId: string;
  resultsPublished: boolean;
  translations: {
    published: string;
    unpublished: string;
    publish: string;
    unpublish: string;
    confirmPublish: string;
    dialogCancel: string;
    dialogClose: string;
  };
};

// Owner-only control on the coffee profile page. Publishing asks first, in the
// kit's ConfirmDialog (C-09, P3b; it replaced a "tap twice within 3 seconds"
// arm). Unpublishing is a single click: it is non-destructive to data, it only
// hides the section from non-owners again. The action and its arguments are
// the same as before.
export function PublishResultsToggle({ coffeeId, resultsPublished, translations }: Props) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [isPending, startTransition] = useTransition();
  const [askPublish, setAskPublish] = useState(false);

  function commit(next: boolean) {
    startTransition(async () => {
      await feedback.run(setCoffeeResultsPublished(coffeeId, next), () => router.refresh());
    });
  }

  function handleClick() {
    if (resultsPublished) {
      commit(false);
      return;
    }
    setAskPublish(true);
  }

  return (
    <div className="flex items-center gap-3">
      <Badge tone={resultsPublished ? "success" : "neutral"}>
        {resultsPublished ? translations.published : translations.unpublished}
      </Badge>
      <Button variant="secondary" size="sm" onClick={handleClick} disabled={isPending}>
        {resultsPublished ? translations.unpublish : translations.publish}
      </Button>
      <ConfirmDialog
        open={askPublish}
        onOpenChange={setAskPublish}
        title={translations.publish}
        body={translations.confirmPublish}
        confirmLabel={translations.publish}
        cancelLabel={translations.dialogCancel}
        closeLabel={translations.dialogClose}
        destructive={false}
        onConfirm={() => {
          commit(true);
        }}
      />
    </div>
  );
}
