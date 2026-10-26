import { type FormEvent, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TeamRef } from '@/snapshot/types';

const SELECT_CLASS =
  'h-9 w-full appearance-none truncate rounded-md border border-input bg-background pr-8 pl-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </span>
      <span className="relative">
        {children}
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

/**
 * Asks a first-time visitor which Team they are looking at, before any PRs load. It can't be dismissed: Escape and
 * clicks outside do nothing until a Team is chosen. `teams` is what /teams answered; until it can, `status` says why.
 */
export function FirstVisitModal({
  teams,
  viewers,
  status,
  onChoose,
}: {
  teams: readonly TeamRef[] | undefined;
  viewers: readonly string[];
  status: string;
  onChoose: (team: string, viewer: string | null) => void;
}) {
  const [team, setTeam] = useState('');
  const [viewer, setViewer] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (team) {
      onChoose(team, viewer || null);
    }
  };

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
        >
          <Dialog.Title className="text-lg font-semibold">Which Team are you looking at?</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Pick a Team to see its PRs.</Dialog.Description>
          {teams === undefined ? (
            <p className="py-8 text-center text-muted-foreground">{status}</p>
          ) : (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
              <Field label="Team">
                <select required value={team} onChange={(event) => setTeam(event.target.value)} className={SELECT_CLASS}>
                  <option value="">Pick a Team…</option>
                  {teams.map(({ slug, name }) => (
                    <option key={slug} value={slug}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="I am" optional>
                <select value={viewer} onChange={(event) => setViewer(event.target.value)} className={SELECT_CLASS}>
                  <option value="">Pick yourself…</option>
                  {viewers.map((login) => (
                    <option key={login} value={login}>
                      {login}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={!team}>
                Show PRs
              </Button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
