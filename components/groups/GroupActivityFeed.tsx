// Presentational-only server component: page.tsx does the data fetching,
// stream-merging, and translation (t()) calls, then hands this component a
// flat list of already-translated messages + raw timestamps to render.

function formatRelativeDate(date: Date, locale: string): string {
  const es = locale !== "en";
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return es ? "hoy" : "today";
  if (days === 1) return es ? "hace 1 día" : "1 day ago";
  if (days < 30) return es ? `hace ${days} días` : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return es ? "hace 1 mes" : "1 month ago";
  if (months < 12) return es ? `hace ${months} meses` : `${months} months ago`;
  const years = Math.floor(months / 12);
  if (years === 1) return es ? "hace 1 año" : "1 year ago";
  return es ? `hace ${years} años` : `${years} years ago`;
}

export interface GroupActivityEvent {
  message: string;
  timestamp: Date;
}

export function GroupActivityFeed({
  title,
  events,
  emptyText,
  locale,
}: {
  title: string;
  events: GroupActivityEvent[];
  emptyText: string;
  locale: string;
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif text-xl text-green-dark">{title}</h2>
      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
        {events.length === 0 ? (
          <p className="text-sm text-brown-mid">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-[#E8E0D0]">
            {events.map((event, i) => (
              <li
                key={i}
                className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-3"
              >
                <span className="text-sm text-brown-dark">{event.message}</span>
                <span className="text-xs text-brown-mid whitespace-nowrap">
                  {formatRelativeDate(event.timestamp, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
