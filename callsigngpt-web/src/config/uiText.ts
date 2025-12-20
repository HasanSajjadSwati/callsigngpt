// callsigngpt-web/src/lib/uiText.ts  (or /config.ts)
export function getSystemGreeting(modelName?: string) {
  const name = modelName?.trim() || 'CallSignGPT';
  return `You're chatting with ${name}. Ask anything!`;
}

export const UI_TEXT = {
  app: {
    systemGreeting: getSystemGreeting(),
    typingIndicator: "Assistant is typingƒ?İ",
    newChatTitle: "New chat", // default title when creating a new conversation
  },
  composer: {
    placeholder: "Ask me anything!",
    sendTitle: "Send",
    stopTitle: "Stop",
    ariaLabel: "Chat message",
  },
  errors: {
    unknown: "Something went wrong.",
  },
} as const;

// Other tweakable runtime constants
export const APP_CONFIG = {
 api: {
  baseUrl: "https://api.callsigngpt.com",  // use YOUR actual API domain
  credentials: "include",
},
  conversation: {
    greetingRole: "system",
    maxTitleLength: 80,      // truncate derived chat titles
    resetKeyIncrement: 1,    // sidebar reload bump
    autoSaveDebounce: 0,     // optional if you later add debounce
  },
};
