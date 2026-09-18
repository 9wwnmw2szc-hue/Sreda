import type { Generated } from "kysely";

export type DataFileStatus =
  | "uploaded"
  | "validating"
  | "parsing"
  | "ready"
  | "failed";

export type DataFileType = "xlsx" | "csv";

export type ColumnType =
  | "text"
  | "integer"
  | "decimal"
  | "currency"
  | "percentage"
  | "date"
  | "datetime"
  | "boolean"
  | "category"
  | "unknown";

export type ColumnProfile = {
  name: string;
  inferredType: ColumnType;
  nonNullCount: number;
  nullCount: number;
  uniqueCount: number | null;
  min?: string | number | null;
  max?: string | number | null;
  samples: string[];
};

export interface AnalyticsTables {
  business_data_file: {
    id: string;
    business_id: string;
    uploaded_by: string | null;
    original_filename: string;
    storage_key: string;
    parsed_storage_key: string | null;
    mime_type: string;
    size_bytes: number;
    file_type: DataFileType;
    status: DataFileStatus;
    version: Generated<number>;
    row_count: number | null;
    sheet_count: number | null;
    error_code: string | null;
    error_message: string | null;
    column_mapping: Generated<unknown>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    deleted_at: Date | null;
  };
  business_data_sheet: {
    id: string;
    file_id: string;
    business_id: string;
    name: string;
    position: Generated<number>;
    row_count: Generated<number>;
    column_count: Generated<number>;
    columns_json: Generated<unknown>;
    quality_json: Generated<unknown>;
    created_at: Generated<Date>;
  };
  analytics_saved_analysis: {
    id: string;
    business_id: string;
    file_id: string | null;
    file_version: number | null;
    created_by: string | null;
    source_kind: "sreda" | "file";
    title: string;
    question: Generated<string>;
    analysis_type: "full" | "question" | "period" | "export";
    result_json: Generated<unknown>;
    created_at: Generated<Date>;
  };
}
