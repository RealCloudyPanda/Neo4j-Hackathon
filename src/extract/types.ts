/** Plain records produced by the extractors and loaded into the graph. */
export const MEANING_TAGS = ["unit", "format", "tz"] as const;
export type MeaningTag = (typeof MEANING_TAGS)[number];
export type Tags = Partial<Record<MeaningTag, string>>;

export interface FileRec {
  path: string;
  package: string;
  isTest: boolean;
  hash: string;
}

export interface ImportRec {
  from: string;
  to: string;
  specifier: string;
}

export interface FieldVersionRec extends Tags {
  key: string;
  displayName: string;
  type: string;
  doc: string;
  path: string;
  line: number;
}

export interface ProducerRec {
  key: string;
  name: string;
  path: string;
  line: number;
  code: string;
}

export interface ParamRec extends Tags {
  name: string;
  index: number;
  path: string;
  line: number;
}

export interface FunctionRec {
  name: string;
  path: string;
  line: number;
}

export interface UsageRec {
  key: string;
  path: string;
  line: number;
  col: number;
  kind: "read" | "destructure";
  code: string;
  flowNote?: string;
  passesTo?: { fn: FunctionRec; param: ParamRec; argIndex: number };
}

export interface LinkRec {
  from: string;
  to: string;
  via: string;
  reason: string;
}

export interface SnapshotData {
  id: string;
  title: string;
  dir: string;
  files: FileRec[];
  imports: ImportRec[];
  fields: FieldVersionRec[];
  producers: ProducerRec[];
  usages: UsageRec[];
  links: LinkRec[];
}
