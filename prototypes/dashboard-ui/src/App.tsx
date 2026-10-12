// PROTOTYPE — three structurally different StaleMate dashboards over the same mock Tracked PRs,
// switchable via ?variant=A|B|C. Filters live in the URL, the Viewer in localStorage.
import { useFilters, useNow, useSearch, useSync, useViewer, type Filters, type Sync } from './model';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { VariantTable, name as nameA } from './variants/VariantTable';
import { VariantInbox, name as nameB } from './variants/VariantInbox';
import { VariantBoard, name as nameC } from './variants/VariantBoard';

export interface VariantProps {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  reset: () => void;
  viewer: string | null;
  setViewer: (login: string | null) => void;
  sync: Sync;
  now: number;
}

const VARIANTS = [
  { key: 'A', name: nameA, Component: VariantTable },
  { key: 'B', name: nameB, Component: VariantInbox },
  { key: 'C', name: nameC, Component: VariantBoard },
];

export function App() {
  const search = useSearch();
  const key = new URLSearchParams(search).get('variant') ?? 'A';
  const [filters, update, reset] = useFilters();
  const [viewer, setViewer] = useViewer();
  const sync = useSync();
  const now = useNow();
  const { Component } = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
  return (
    <>
      <Component filters={filters} update={update} reset={reset} viewer={viewer} setViewer={setViewer} sync={sync} now={now} />
      <PrototypeSwitcher variants={VARIANTS} current={key} />
    </>
  );
}
