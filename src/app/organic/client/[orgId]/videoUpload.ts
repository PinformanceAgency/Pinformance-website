/**
 * De browserkant van een video-upload: het posterframe en de voortgang.
 *
 * Twee dingen die hier en niet op de server gebeuren, en beide om dezelfde
 * reden — het bestand komt nooit door een API-route heen (Vercel kapt een body
 * af op 4,5 MB):
 *
 *   1. **Het posterframe.** Een frame uit een mp4 halen kost op de server
 *      ffmpeg; in de browser is het een <video>, een canvas en twee regels.
 *      Dat frame is niet cosmetisch: het wordt `designs.asset_path`, dus het is
 *      de thumbnail op elk scherm in de app én de cover die Pinterest zelf
 *      ophaalt bij de videopin. Dezelfde truc als op de creatives-pagina van
 *      het betaalde deel, waar hij al ruim vijfhonderd pins meegaat.
 *
 *   2. **De voortgang.** 120 MB over een gewone lijn is een minuut. `fetch()`
 *      geeft geen voortgang op een upload, dus dit gaat door XMLHttpRequest —
 *      een minuut stilte met een knop die "Uploading…" zegt is precies het
 *      soort scherm dat in dit project drie keer als "hij doet niets" is
 *      teruggekomen.
 */

export interface VideoFacts {
  duration: number | null;
  width: number | null;
  height: number | null;
  /** Het eerste bruikbare frame als JPEG. Null = de browser kon het bestand
   *  niet decoderen; dan gaat de upload niet door, want zonder cover heeft de
   *  pin geen thumbnail en geen cover voor Pinterest. */
  poster: Blob | null;
}

/**
 * Duur, afmetingen en een posterframe, in één keer uit het bestand zelf.
 *
 * Op 0,5s in plaats van op 0: het eerste frame van een export is vaak zwart of
 * een fade-in, en dat wordt dan de cover in de feed.
 */
export function readVideoFacts(file: File): Promise<VideoFacts> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const done = (facts: VideoFacts) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(facts);
    };

    const facts = (): Omit<VideoFacts, "poster"> => ({
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    });

    video.onloadeddata = () => {
      // Een video korter dan een seconde: pak wat er is in plaats van voorbij
      // het einde te zoeken, want dan komt `onseeked` nooit.
      video.currentTime = Math.min(0.5, Math.max(0, (video.duration || 1) / 2));
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1080;
      canvas.height = video.videoHeight || 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) return done({ ...facts(), poster: null });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done({ ...facts(), poster: blob }), "image/jpeg", 0.85);
    };

    video.onerror = () => done({ duration: null, width: null, height: null, poster: null });

    // Een groot bestand dat de browser niet aankan mag niet in een oneindig
    // "Uploading…" eindigen.
    setTimeout(() => done({ ...facts(), poster: null }), 20_000);

    video.src = objectUrl;
  });
}

/**
 * PUT naar een signed upload URL van Supabase Storage, met voortgang.
 *
 * De token zit in de URL, dus er is geen sessie en geen anon-schrijfrecht op de
 * bucket voor nodig — één pad, twee uur geldig.
 */
export function putToSignedUrl(
  signedUrl: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(`Upload failed (${xhr.status}): ${(xhr.responseText || "").slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted — check the connection and try again"));
    xhr.onabort = () => reject(new Error("The upload was cancelled"));
    xhr.send(body);
  });
}

export function formatBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
