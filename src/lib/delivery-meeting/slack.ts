/**
 * Slack delivery with a bot token. The repo only had incoming webhooks, and a
 * webhook cannot upload a file — so this is the Web API: open the DM, upload
 * through files.getUploadURLExternal + files.completeUploadExternal (the
 * current flow; files.upload is retired), then post the summary.
 *
 * Needs SLACK_BOT_TOKEN (scopes chat:write, files:write, im:write) and
 * SLACK_DELIVERY_USER (the member id the DM goes to).
 */

async function slack(method: string, body: Record<string, unknown>, form = false): Promise<any> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: form
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" }
      : { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: form
      ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString()
      : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? res.status}`);
  return json;
}

export async function openDm(user = process.env.SLACK_DELIVERY_USER): Promise<string> {
  if (!user) throw new Error("SLACK_DELIVERY_USER is not set");
  const r = await slack("conversations.open", { users: user });
  return r.channel.id as string;
}

export async function uploadFiles(channel: string, files: { name: string; data: Buffer }[], comment?: string) {
  const ids: { id: string; title: string }[] = [];
  for (const f of files) {
    // this one takes form fields, not JSON
    const u = await slack("files.getUploadURLExternal", { filename: f.name, length: f.data.length }, true);
    const put = await fetch(u.upload_url, {
      method: "POST",
      body: new Uint8Array(f.data),
      signal: AbortSignal.timeout(30_000),
    });
    if (!put.ok) throw new Error(`Slack upload of ${f.name}: HTTP ${put.status}`);
    ids.push({ id: u.file_id, title: f.name });
  }
  await slack("files.completeUploadExternal", {
    files: ids,
    channel_id: channel,
    ...(comment ? { initial_comment: comment } : {}),
  });
}

export async function postMessage(channel: string, text: string) {
  await slack("chat.postMessage", { channel, text, mrkdwn: true });
}
