export type Side = 'left' | 'right';
export type ActivityKind = 'bath' | 'tummy_time' | 'outdoor' | 'indoor' | 'brushing_teeth';
export type Segment = { side: Side; started_at: string; ended_at: string | null };
type Common = { started_at: string; ended_at: string | null; note: string; deleted: boolean };
export type EventBody = Common & (
  | { type: 'bottle'; payload: { amount_ml: number; milk: 'breast_milk' | 'formula' | 'mixed' } }
  | { type: 'diaper'; payload: { kind: 'wet' | 'dirty' | 'mixed' } }
  | { type: 'sleep'; payload: Record<string, never> }
  | { type: 'breast'; payload: { segments: Segment[] } }
  | { type: 'vaccination'; payload: { vaccine: string; dose: string; status: 'planned' | 'completed'; location: string } }
  | { type: 'medication'; payload: { name: string; dose: string; status: 'planned' | 'completed' } }
  | { type: 'meal'; payload: { food: string; amount: string } }
  | { type: 'growth'; payload: { height_cm: number | null; weight_kg: number | null } }
  | { type: 'activity'; payload: { kind: ActivityKind; duration_minutes: number | null } }
);
export type QuickEventType = 'bottle' | 'diaper' | 'sleep' | 'breast';
export type CareEventType = 'medication' | 'meal' | 'growth' | 'activity';
export type CareBody = Extract<EventBody, { type: CareEventType }>;
export type VaccinationBody = Extract<EventBody, { type: 'vaccination' }>;
export type VaccinationStatus = VaccinationBody['payload']['status'];
export type Scope = { family_id: string; baby_id: string };
export type ServerEvent = Omit<Common, 'deleted'> & Scope & {
  id: string; type: EventBody['type']; payload: EventBody['payload'];
  revision: string; deleted_at: string | null;
};
export type LocalEvent = Scope & {
  id: string; body: EventBody; server: ServerEvent | null; version: number;
};
export type Family = { id: string; name: string; timezone: string; sync_cursor: string };
export type Baby = { id: string; family_id: string; nickname: string; birth_date: string | null };
export type Membership = { family_id: string; user_id: string; role: 'owner' | 'caregiver' };
export type Workspace = { families: Family[]; babies: Baby[]; memberships: Membership[] };
export type ApplyRequest = {
  p_operation_id: string; p_device_id: string; p_family_id: string; p_baby_id: string;
  p_event_id: string; p_base_revision: string; p_event: EventBody;
};
export type ApplyResult = { operation_id: string } & (
  | { status: 'accepted'; event: ServerEvent; cursor: string }
  | { status: 'conflict'; reason: 'revision' | 'active_timer'; event: ServerEvent | null; active_event?: ServerEvent }
);
export type ChangePage = { changes: { cursor: string; event: ServerEvent }[]; next_cursor: string; has_more: boolean };
export type Operation = Scope & {
  sequence?: number; operation_id: string; event_id: string; body: EventBody;
  base_revision: string | null; depends_on: string | null;
  request?: ApplyRequest; conflict?: ApplyResult; blocked?: boolean;
};
export const emptyWorkspace = (): Workspace => ({ families: [], babies: [], memberships: [] });