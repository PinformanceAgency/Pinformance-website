import type { KreaGenerateRequest, KreaTaskResponse } from "./types";

const KREA_API = "https://api.kie.ai/api/v1";

export class KreaClient {
  constructor(private apiKey: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${KREA_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`kie.ai API error ${res.status}: ${error}`);
    }
    return res.json();
  }

  /**
   * Generate image using Flux Kontext Pro model (best for Pinterest pins)
   */
  async generateImage(data: KreaGenerateRequest): Promise<KreaTaskResponse> {
    const model = data.model || "flux-kontext-pro";

    // Use Flux Kontext API
    const response = await this.request<{ code: number; data: { taskId: string }; message?: string }>(
      "/flux/kontext/generate",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: data.prompt,
          aspectRatio: data.aspect_ratio || "3:4", // closest to 2:3 for Pinterest
          outputFormat: "png",
          model,
          safetyTolerance: 3,
        }),
      }
    );

    return {
      id: response.data?.taskId || "",
      task_id: response.data?.taskId || "",
      status: "pending",
    };
  }

  /**
   * Generate image using GPT-4o Image model
   */
  async generate4oImage(data: KreaGenerateRequest): Promise<KreaTaskResponse> {
    const response = await this.request<{ code: number; data: { taskId: string }; message?: string }>(
      "/gpt4o-image/generate",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: data.prompt,
          size: "2:3", // Pinterest optimal
          isEnhance: true,
        }),
      }
    );

    return {
      id: response.data?.taskId || "",
      task_id: response.data?.taskId || "",
      status: "pending",
    };
  }

  /**
   * Check task status for Flux Kontext generation
   * Uses the record-info endpoint
   */
  async getTaskStatus(taskId: string): Promise<KreaTaskResponse> {
    // Try Flux task status first
    try {
      const response = await this.request<{
        code: number;
        data: {
          taskId: string;
          successFlag: number; // 0=processing, 1=completed, 2=failed
          output?: { imageUrl?: string; images?: Array<{ url: string }> };
          imageUrl?: string;
          images?: Array<{ url: string }>;
        };
      }>(`/flux/kontext/record-info?taskId=${taskId}`);

      const successFlag = response.data?.successFlag;
      const imageUrl =
        response.data?.output?.imageUrl ||
        response.data?.imageUrl ||
        response.data?.output?.images?.[0]?.url ||
        response.data?.images?.[0]?.url;

      if (successFlag === 1 && imageUrl) {
        return {
          id: taskId,
          task_id: taskId,
          status: "completed",
          result: { url: imageUrl, width: 1000, height: 1500 },
        };
      } else if (successFlag === 2) {
        return { id: taskId, task_id: taskId, status: "failed", error: "Image generation failed" };
      }

      return { id: taskId, task_id: taskId, status: "processing" };
    } catch {
      // Try 4o image status endpoint
      const response = await this.request<{
        code: number;
        data: {
          taskId: string;
          successFlag: number;
          output?: { imageUrl?: string; images?: Array<{ url: string }> };
          imageUrl?: string;
        };
      }>(`/gpt4o-image/record-info?taskId=${taskId}`);

      const successFlag = response.data?.successFlag;
      const imageUrl = response.data?.output?.imageUrl || response.data?.imageUrl;

      if (successFlag === 1 && imageUrl) {
        return {
          id: taskId,
          task_id: taskId,
          status: "completed",
          result: { url: imageUrl, width: 1000, height: 1500 },
        };
      } else if (successFlag === 2) {
        return { id: taskId, task_id: taskId, status: "failed", error: "Image generation failed" };
      }

      return { id: taskId, task_id: taskId, status: "processing" };
    }
  }

  async validateKey(): Promise<boolean> {
    try {
      // Try a lightweight request to validate the key
      const res = await fetch(`${KREA_API}/flux/kontext/record-info?taskId=test`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      // 401 = bad key, anything else = key works
      return res.status !== 401;
    } catch {
      return false;
    }
  }
}
