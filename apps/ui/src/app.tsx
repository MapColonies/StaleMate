import { Badge } from '@/components/ui/badge';
import { $api } from '@/lib/http-client';

/** Placeholder until the dashboard shell (#20) replaces it. */
function SnapshotStatus() {
  const { data, error, isPending } = $api.useQuery('get', '/snapshot');

  if (isPending) {
    return <Badge variant="outline">Loading…</Badge>;
  }
  if (error) {
    return <Badge variant="secondary">Waiting for the first sync</Badge>;
  }
  return <Badge>{data.prs.length} Tracked PRs</Badge>;
}

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">StaleMate</h1>
      <p className="text-muted-foreground">What is open, whose move it is, and how long it has been waiting.</p>
      <SnapshotStatus />
    </main>
  );
}
