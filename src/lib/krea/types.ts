export interface KreaGenerateRequest {
  model?: string;
  prompt: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  webhook_url?: string;
}

export interface KreaTaskResponse {
  id: string;
  task_id?: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: {
    url: string;
    width: number;
    height: number;
  };
  error?: string;
}
