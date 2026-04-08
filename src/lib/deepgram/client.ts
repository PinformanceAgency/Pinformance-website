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
   * Returns the full transcript text.
   */
  async transcribe(mediaUrl: string): Promise<string> {
    const res = await fetch(`${DEEPGRAM_API}/listen?model=nova-2&smart_format=true&language=en&detect_language=true`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: mediaUrl }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Deepgram error ${res.status}: ${error}`);
    }

    const data = await res.json();
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript;
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
