"use client";

// Owner/member announcements feed for a tasting group. Owner gets inline
// edit (title + body swap to inputs) and delete (ConfirmDialog); members get
// a plain read-only render. Dates arrive as ISO strings from the server
// component (page.tsx) and are localized here on the client.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { updateGroupPost, deleteGroupPost } from "@/app/actions/groups";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export type GroupFeedPost = {
  id: string;
  title: string | null;
  body: string;
  emailSent: boolean;
  createdAt: string;
  author: { displayName: string | null };
};

export type GroupFeedTranslations = {
  empty: string;
  emptyMember: string;
  edit: string;
  save: string;
  cancel: string;
  delete: string;
  deleteTitle: string;
  deleteBody: string;
  error: string;
  emailSentBadge: string;
  /** N2: visible labels of the edit fields. */
  titleLabel: string;
  bodyLabel: string;
  /** N2: raw templates with {title}: each icon button names the announcement it acts on. */
  editNamed: string;
  deleteNamed: string;
};

/** How an announcement is named in its buttons: its title, else the start of its text. */
function postLabel(post: { title: string | null; body: string }): string {
  if (post.title) return post.title;
  const body = post.body.replace(/\s+/g, " ").trim();
  return body.length > 40 ? `${body.slice(0, 40)}…` : body;
}

function formatPostDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function GroupFeed({
  posts,
  isOwner,
  locale,
  t,
}: {
  posts: GroupFeedPost[];
  isOwner: boolean;
  locale: string;
  t: GroupFeedTranslations;
}) {
  const router = useRouter();
  const uid = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const startEdit = (post: GroupFeedPost) => {
    setError(null);
    setEditingId(post.id);
    setEditTitle(post.title ?? "");
    setEditBody(post.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const saveEdit = (postId: string) => {
    const trimmedBody = editBody.trim();
    if (!trimmedBody) return;
    setError(null);
    setSavingId(postId);
    start(async () => {
      try {
        const result = await updateGroupPost(postId, {
          title: editTitle.trim() || null,
          body: trimmedBody,
        });
        if (!result.ok) {
          setError(t.error);
          return;
        }
        setEditingId(null);
        router.refresh();
      } catch {
        setError(t.error);
      } finally {
        setSavingId(null);
      }
    });
  };

  const inputCls =
    "w-full border border-outline-variant rounded-input px-3 py-2 text-body text-on-surface bg-surface-container-lowest focus:border-primary-container transition-colors";
  // The label style of the group forms (GroupNameControls, CreateGroupDialog).
  const labelCls = "label-caps block";

  if (posts.length === 0) {
    return <p className="text-caption text-on-surface-variant">{isOwner ? t.empty : t.emptyMember}</p>;
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => {
        const isEditing = editingId === post.id;
        return (
          <div
            key={post.id}
            className="bg-surface-container-lowest border border-outline-variant rounded-card p-4 space-y-2"
          >
            {isEditing ? (
              <div className="space-y-2">
                <label htmlFor={`${uid}-title-${post.id}`} className={labelCls}>
                  {t.titleLabel}
                </label>
                <input
                  id={`${uid}-title-${post.id}`}
                  autoFocus
                  className={inputCls + " min-h-[44px] font-semibold"}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={120}
                />
                <label htmlFor={`${uid}-body-${post.id}`} className={labelCls}>
                  {t.bodyLabel}
                </label>
                <textarea
                  id={`${uid}-body-${post.id}`}
                  className={inputCls + " min-h-[96px]"}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  maxLength={5000}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(post.id)}
                    disabled={savingId === post.id || !editBody.trim()}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill bg-primary-container px-3 py-1.5 text-caption font-semibold text-on-primary hover:bg-primary transition-colors disabled:opacity-50"
                  >
                    <Check size={14} /> {t.save}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingId === post.id}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption font-medium text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                  >
                    <X size={14} /> {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {post.title && <p className="font-semibold text-on-surface">{post.title}</p>}
                    <p className="text-body text-on-surface whitespace-pre-wrap">{post.body}</p>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(post)}
                        title={t.edit}
                        aria-label={t.editNamed.replace("{title}", postLabel(post))}
                        className="inline-flex h-[44px] w-[44px] items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(post.id)}
                        title={t.delete}
                        aria-label={t.deleteNamed.replace("{title}", postLabel(post))}
                        className="inline-flex h-[44px] w-[44px] items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-caption text-on-surface-variant">
                  <span>
                    {post.author.displayName ?? "—"} · {formatPostDate(post.createdAt, locale)}
                  </span>
                  {post.emailSent && (
                    <Badge tone="accent" size="xs">
                      {t.emailSentBadge}
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {error && <p className="text-caption text-error">{error}</p>}

      {isOwner && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t.deleteTitle}
          body={t.deleteBody}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          closeLabel={t.cancel}
          onConfirm={async () => {
            if (!deleteTarget) return;
            await deleteGroupPost(deleteTarget);
            router.refresh();
          }}
          error={t.error}
        />
      )}
    </div>
  );
}
