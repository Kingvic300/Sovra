/** Messages between the deck window and the presenter window (same origin, same browser). */
export type SyncMessage = { type: "index"; index: number } | { type: "go"; index: number } | { type: "hello" };

const NAME = "sovra-deck";

export function openChannel(onMessage: (m: SyncMessage) => void) {
  if (typeof BroadcastChannel === "undefined") return { post: () => undefined, close: () => undefined };
  const channel = new BroadcastChannel(NAME);
  channel.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data);
  return {
    post: (m: SyncMessage) => channel.postMessage(m),
    close: () => channel.close(),
  };
}

/** "0:35–0:55" → [35, 55]. */
export function parseRange(time?: string): [number, number] | null {
  const m = time?.match(/(\d+):(\d{2})\s*[–-]\s*(\d+):(\d{2})/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
