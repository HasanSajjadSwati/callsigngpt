import type { Message } from "@/components/MessageBubble";
import { genId } from "./id";

export function normalizeMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.map((m) => {
    let id = m.id || genId();
    // regenerate until unique (paranoid but safe)
    while (seen.has(id)) id = genId();
    seen.add(id);
    return { ...m, id };
  });
}
