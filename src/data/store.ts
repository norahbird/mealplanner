import { useSyncExternalStore } from 'react';
import { isNetworkError, supabase } from '../lib/supabaseClient';
import { STARTER_INGREDIENTS } from './starterIngredients';
import {
  TABLES,
  type Data,
  type Household,
  type HouseholdSettings,
  type Ingredient,
  type TableKey,
} from './types';

// How this works: every change is applied to the local copy straight away, saved on the device,
// and added to a queue. The queue is sent to Supabase in order whenever there's a connection, so
// the app keeps working with no signal (say, in a store) and catches up later. Each change only
// sends the fields it touched, so two devices editing different things don't overwrite each other.

type Row = { id: string } & Record<string, unknown>;

export type Op =
  | { type: 'insert'; table: TableKey; rows: Row[] }
  | { type: 'update'; table: TableKey; id: string; values: Record<string, unknown> }
  | { type: 'delete'; table: TableKey; ids: string[] }
  | { type: 'settings'; settings: HouseholdSettings };

export interface StoreState {
  userId: string | null;
  data: Data;
  /** True once there's data to show, from the device or the server. */
  ready: boolean;
  /** Loading from the server failed for a reason other than being offline. */
  loadError: string | null;
  /** Changes made on this device that haven't reached the server yet. */
  pending: number;
  offline: boolean;
  /** A change the server refused. It was dropped, and the data reloaded. */
  syncError: string | null;
}

function emptyData(): Data {
  return { household: null, ingredients: {}, recipes: {}, entries: {}, grocery: {} };
}

const initialState: StoreState = {
  userId: null,
  data: emptyData(),
  ready: false,
  loadError: null,
  pending: 0,
  offline: false,
  syncError: null,
};

let state: StoreState = initialState;
let queue: Op[] = [];
const listeners = new Set<() => void>();

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): StoreState {
  return state;
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState);
}

export function useData(): Data {
  return useStore().data;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---- Local copy ---------------------------------------------------------------------------

const dataKey = (uid: string) => `mealplanner:data:${uid}`;
const queueKey = (uid: string) => `mealplanner:queue:${uid}`;

function persist() {
  if (!state.userId) return;
  try {
    localStorage.setItem(dataKey(state.userId), JSON.stringify(state.data));
    localStorage.setItem(queueKey(state.userId), JSON.stringify(queue));
  } catch {
    // Storage full or unavailable: the app still works, it just can't work offline.
  }
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function applyOp(data: Data, op: Op): Data {
  switch (op.type) {
    case 'insert': {
      const table = { ...data[op.table] } as Record<string, unknown>;
      for (const row of op.rows) table[row.id] = { ...((table[row.id] as object) ?? {}), ...row };
      return { ...data, [op.table]: table };
    }
    case 'update': {
      const current = (data[op.table] as Record<string, unknown>)[op.id];
      if (!current) return data;
      return { ...data, [op.table]: { ...data[op.table], [op.id]: { ...(current as object), ...op.values } } };
    }
    case 'delete': {
      const table = { ...data[op.table] } as Record<string, unknown>;
      op.ids.forEach((id) => delete table[id]);
      return { ...data, [op.table]: table };
    }
    case 'settings':
      return data.household ? { ...data, household: { ...data.household, settings: op.settings } } : data;
  }
}

/** Applies changes locally right away and queues them for the server. */
export function commit(ops: Op[]) {
  if (!state.userId || ops.length === 0) return;
  let data = state.data;
  for (const op of ops) data = applyOp(data, op);
  queue.push(...ops);
  set({ data, pending: queue.length });
  persist();
  void flush();
}

// ---- Server sync --------------------------------------------------------------------------

async function send(op: Op): Promise<void> {
  let result: { error: { message: string } | null };
  switch (op.type) {
    case 'insert':
      result = await supabase.from(TABLES[op.table]).upsert(op.rows, { onConflict: 'id' });
      break;
    case 'update':
      result = await supabase.from(TABLES[op.table]).update(op.values).eq('id', op.id);
      break;
    case 'delete':
      result = await supabase.from(TABLES[op.table]).delete().in('id', op.ids);
      break;
    case 'settings':
      result = await supabase
        .from('meal_households')
        .update({ settings: op.settings, updated_at: nowISO() })
        .eq('id', state.data.household?.id ?? '');
      break;
  }
  if (result.error) throw result.error;
}

let flushing = false;
let fetching = false;

async function flush(): Promise<void> {
  // While a reload is in flight, hold changes back so the reload can't miss them.
  if (flushing || fetching || !state.userId) return;
  flushing = true;
  const uid = state.userId;
  let refused = false;
  try {
    while (queue.length > 0 && state.userId === uid) {
      try {
        await send(queue[0]);
      } catch (err) {
        const message = (err as { message?: string }).message;
        if (isNetworkError(message)) {
          set({ offline: true });
          return;
        }
        console.error('Change refused by the server', queue[0], err);
        refused = true;
        set({ syncError: `A change couldn't be saved (${message ?? 'unknown error'}), so the latest data was reloaded.` });
      }
      queue.shift();
      persist();
      set({ pending: queue.length, offline: false });
    }
  } finally {
    flushing = false;
  }
  if (refused) void refresh();
}

async function fetchAll(table: string, householdId: string): Promise<Row[]> {
  const rows: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('household_id', householdId)
      .order('id')
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (data.length < page) return rows;
  }
}

function byId<T>(rows: Row[]): Record<string, T> {
  return Object.fromEntries(rows.map((r) => [r.id, r as unknown as T]));
}

let refreshing: Promise<void> | null = null;

/** Sends queued changes, then reloads everything from the server. */
export function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const uid = state.userId;
    if (!uid) return;
    await flush();
    if (queue.length > 0 && state.offline) return;
    fetching = true;
    try {
      const { data: hh, error } = await supabase.rpc('meal_my_household');
      if (error) throw error;
      const raw = (Array.isArray(hh) ? hh[0] : hh) as { id: string; name: string; settings: HouseholdSettings | null };
      const household: Household = { id: raw.id, name: raw.name, settings: raw.settings ?? {} };
      const [ingredients, recipes, entries, grocery] = await Promise.all(
        (['ingredients', 'recipes', 'entries', 'grocery'] as TableKey[]).map((k) => fetchAll(TABLES[k], household.id)),
      );
      if (state.userId !== uid) return;
      let data: Data = {
        household,
        ingredients: byId(ingredients),
        recipes: byId(recipes),
        entries: byId(entries),
        grocery: byId(grocery),
      };
      // Changes still waiting to be sent are re-applied on top of what the server has.
      for (const op of queue) data = applyOp(data, op);
      set({ data, ready: true, loadError: null, offline: false });
      persist();
      if (!household.settings.seeded && Object.keys(data.ingredients).length === 0) seedIngredients();
    } catch (err) {
      const message = (err as { message?: string; code?: string }).message;
      const code = (err as { code?: string }).code;
      if (isNetworkError(message)) set({ offline: true });
      else if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883')
        set({ loadError: "The database isn't set up for Meal Planner yet. Run supabase/schema.sql in the Supabase SQL Editor." });
      else set({ loadError: message ?? 'Something went wrong loading your data.' });
    } finally {
      fetching = false;
    }
    void flush();
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function seedIngredients() {
  const household = state.data.household;
  if (!household) return;
  const updated_at = nowISO();
  const rows = STARTER_INGREDIENTS.map(
    (s): Ingredient => ({
      id: newId(),
      household_id: household.id,
      name: s.name,
      section: s.section,
      location: s.location,
      shelf_life_days: s.days,
      staple: s.staple,
      status: null,
      use_by: null,
      updated_at,
    }),
  );
  commit([
    { type: 'insert', table: 'ingredients', rows: rows as unknown as Row[] },
    { type: 'settings', settings: { ...household.settings, seeded: true } },
  ]);
}

// ---- Lifecycle ----------------------------------------------------------------------------

/** Loads the device's copy for this account straight away, then syncs with the server. */
export function startStore(userId: string) {
  if (state.userId === userId) return;
  const cached = readJSON<Data>(dataKey(userId));
  queue = readJSON<Op[]>(queueKey(userId)) ?? [];
  state = {
    ...initialState,
    userId,
    data: cached ?? emptyData(),
    ready: Boolean(cached?.household),
    pending: queue.length,
  };
  listeners.forEach((l) => l());
  void refresh();
}

/** Forgets this account's data on the device (on sign-out). */
export function stopStore() {
  if (state.userId) {
    try {
      localStorage.removeItem(dataKey(state.userId));
      localStorage.removeItem(queueKey(state.userId));
    } catch {
      // ignore
    }
  }
  queue = [];
  state = initialState;
  listeners.forEach((l) => l());
}

export function dismissSyncError() {
  set({ syncError: null });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  // Keep trying to send waiting changes; some browsers don't fire 'online' reliably.
  window.setInterval(() => {
    if (queue.length > 0) void flush();
  }, 20000);
}
