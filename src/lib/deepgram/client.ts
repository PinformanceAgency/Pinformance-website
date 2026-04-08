/**
 * Deepgram API client for video/audio transcription.
 * Free tier: 45,000 minutes/month.
 * Accepts URLs directly — no need to download or extract audio.
 */

const DEEPGRAM_API = "https://api.deepgram.com/v1";

export class DeepgramClient {
  constructor(private apiKey: string) {}

  /**
   * Transcribe a video/audio file from a URL.
   * Downloads the file first then sends binary to Deepgram (avoids URL access issues).
   * Returns the full transcript text.
   */
  async transcribe(mediaUrl: string): Promise<string> {
    // First try URL-based transcription
    try {
      const urlRes = await fetch(`${DEEPGRAM_API}/listen?model=nova-2&smart_format=true&detect_language=true`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: mediaUrl }),
      });

      if (urlRes.ok) {
        const data = await urlRes.json();
        const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        if (transcript) return transcript;
      }
    } catch {
      // URL method failed, try binary upload
    }

    // Fallback: download the file and send as binary
    // Use Range header to limit download to first 10MB (enough for audio transcription)
    const mediaRes = await fetch(mediaUrl, {
      headers: { Range: "bytes=0-10485760" },
    });
    if (!mediaRes.ok && mediaRes.status !== 206) {
      throw new Error(`Failed to download media: ${mediaRes.status}`);
    }

    const mediaBuffer = await mediaRes.arrayBuffer();
    const contentType = mediaRes.headers.get("content-type") || "video/mp4";

    const res = await fetch(`${DEEPGRAM_API}/listen?model=nova-2&smart_format=true&detect_language=true`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": contentType,
      },
      body: mediaBuffer,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Deepgram error ${res.status}: ${error}`);
    }

    const data = await res.json();
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript;
  }

  /**
   * Transcribe from a binary buffer directly.
   * Used when the media URL is not publicly accessible.
   */
  async transcribeBinary(buffer: Buffer, contentType = "video/mp4"): Promise<string> {
    const res = await fetch(`${DEEPGRAM_API}/listen?model=nova-2&smart_format=true&detect_language=true`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Deepgram binary error ${res.status}: ${error}`);
    }

    const data = await res.json();
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  }

  async validateKey(): Promise<boolean> {
    try {
      const res = await fetch(`${DEEPGRAM_API}/projects`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
