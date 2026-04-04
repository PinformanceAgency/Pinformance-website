import type { KreaGenerateRequest, KreaTaskResponse } from "./types";

const KREA_API = "https://api.krea.ai";

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
      throw new Error(`Krea API error ${res.status}: ${error}`);
    }
    return res.json();
  }

  /**
   * Generate image using Flux model (best for Pinterest pins — 2:3 ratio)
   */
  async generateImage(data: KreaGenerateRequest): Promise<KreaTaskResponse> {
    const response = await this.request<{
      job_id: string;
      status: string;
      created_at: string;
    }>("/generate/image/bfl/flux-1-dev", {
      method: "POST",
      body: JSON.stringify({
        prompt: data.prompt,
        width: data.width || 1000,
        height: data.height || 1500,
        steps: 28,
      }),
    });

    return {
      id: response.job_id,
      task_id: response.job_id,
      status: response.status === "completed" ? "completed" : "pending",
    };
  }

  /**
   * Check job status and get result image URL
   */
  async getTaskStatus(jobId: string): Promise<KreaTaskResponse> {
    const response = await this.request<{
      job_id: string;
      status: string;
      completed_at: string | null;
      result?: { urls: string[] };
    }>(`/jobs/${jobId}`);

    if (response.status === "completed" && response.result?.urls?.[0]) {
      return {
        id: jobId,
        task_id: jobId,
        status: "completed",
        result: {
          url: response.result.urls[0],
          width: 1000,
          height: 1500,
        },
      };
    }

    if (response.status === "failed") {
      return {
        id: jobId,
        task_id: jobId,
        status: "failed",
        error: "Image generation failed",
      };
    }

    return {
      id: jobId,
      task_id: jobId,
      status: "processing",
    };
  }

  /**
   * Generate image using Flux Kontext (image-to-image).
   * Takes a real product photo as input and creates a styled lifestyle scene
   * while preserving the actual product appearance.
   */
  async generateKontext(data: {
    prompt: string;
    imageUrl: string;
    width?: number;
    height?: number;
    strength?: number;
    steps?: number;
  }): Promise<KreaTaskResponse> {
    const response = await this.request<{
      job_id: string;
      status: string;
      created_at: string;
    }>("/generate/image/bfl/flux-1-kontext-dev", {
      method: "POST",
      body: JSON.stringify({
        prompt: data.prompt,
        imageUrl: data.imageUrl,
        width: data.width || 1000,
        height: data.height || 1500,
        strength: data.strength ?? 0.65,
        steps: data.steps || 25,
        guidance_scale_flux: 4,
      }),
    });

    return {
      id: response.job_id,
      task_id: response.job_id,
      status: response.status === "completed" ? "completed" : "pending",
    };
  }

  async validateKey(): Promise<boolean> {
    try {
      // Generate a tiny test image to validate key
      const res = await fetch(`${KREA_API}/generate/image/bfl/flux-1-dev`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: "test", width: 256, height: 256, steps: 4 }),
      });
      return res.status !== 401;
    } catch {
      return false;
    }
  }
}
