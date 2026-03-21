import type { KreaGenerateRequest, KreaTaskResponse } from "./types";

const KREA_API = "https://api.kie.ai/v1";

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

  async generateImage(data: KreaGenerateRequest): Promise<KreaTaskResponse> {
    return this.request("/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model: data.model || "nano-banana-2",
        prompt: data.prompt,
        aspect_ratio: data.aspect_ratio || "2:3",
        width: data.width || 1000,
        height: data.height || 1500,
        ...(data.webhook_url && { webhook_url: data.webhook_url }),
      }),
    });
  }

  async getTaskStatus(taskId: string): Promise<KreaTaskResponse> {
    return this.request(`/tasks/${taskId}`);
  }

  async validateKey(): Promise<boolean> {
    try {
      // Try a lightweight request to validate the key
      await this.request("/models");
      return true;
    } catch {
      return false;
    }
  }
}
