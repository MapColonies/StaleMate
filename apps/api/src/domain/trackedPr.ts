// The derived shapes the domain produces, as the contract defines them.
import type { components } from 'stalemate-openapi';

type Schemas = components['schemas'];

export type TrackedPr = Schemas['trackedPr'];
export type Person = Schemas['person'];
export type InclusionReason = Schemas['inclusionReason'];
export type ReviewStatus = Schemas['reviewStatus'];
export type CheckStatus = Schemas['checkStatus'];
export type WaitingOnParty = Schemas['waitingOnParty'];
export type Move = Schemas['move'];
export type Clock = Schemas['clock'];
export type Urgency = Schemas['urgency'];
