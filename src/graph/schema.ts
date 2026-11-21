import type { Store } from "../relate/store.ts";

export const ID_LABELS = ["Snapshot", "File", "FieldVersion", "Producer", "Usage", "Function", "Param", "Drift"] as const;

export function applySchema(store: Store): void {
  for (const label of ID_LABELS) {
    store.query(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
  }
  store.query("CREATE CONSTRAINT field_key IF NOT EXISTS FOR (n:Field) REQUIRE n.key IS UNIQUE");
  store.query("CREATE CONSTRAINT meta_key IF NOT EXISTS FOR (n:Meta) REQUIRE n.key IS UNIQUE");
}
