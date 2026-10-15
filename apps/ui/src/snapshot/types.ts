import type { components } from 'stalemate-openapi';

type Schemas = components['schemas'];

export type Snapshot = Schemas['snapshot'];
export type SyncState = Schemas['syncState'];
export type Warming = Schemas['warming'];
export type Person = Schemas['person'];
export type TrackedPr = Schemas['trackedPr'];
export type WaitingOnParty = Schemas['waitingOnParty'];
export type ReviewStatus = Schemas['reviewStatus'];
export type CheckStatus = Schemas['checkStatus'];
export type InclusionReason = Schemas['inclusionReason'];
export type Clock = Schemas['clock'];
