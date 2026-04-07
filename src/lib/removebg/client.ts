/**
 * remove.bg API client for background removal.
 * Extracts the product from a photo, returning it on a transparent/white background.
 * Free tier: 50 API calls/month.
 */

const REMOVEBG_API = "https://api.remove.bg/v1.0";

export class RemoveBgClient {
  constructor(private apiKey: string) {}

  /**
   * Remove background from an image URL.
   * Returns a PNG buffer of the product on transparent background.
   */
  async removeBackground(imageUrl: string): Promise<Buffer> {
    const res = await fetch(`${REMOVEBG_API}/removebg`, {
      method: "POST",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        size: "regular", // up to 625x400 on free, or "full" on paid
        type: "product",
        format: "png",
        bg_color: "FFFFFF", // white background instead of transparent
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`remove.bg error ${res.status}: ${error}`);
    }

    const data = await res.json();
    if (!data.data?.result_b64) {
      throw new Error("remove.bg: no result in response");
    }

    return Buffer.from(data.data.result_b64, "base64");
  }

  /**
   * Remove background and return as base64 data URL.
   */
  async removeBackgroundToDataUrl(imageUrl: string): Promise<string> {
    const buffer = await this.removeBackground(imageUrl);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  async validateKey(): Promise<boolean> {
    try {
      const res = await fetch(`${REMOVEBG_API}/account`, {
        headers: { "X-Api-Key": this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
