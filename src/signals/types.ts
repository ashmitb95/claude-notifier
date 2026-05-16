export const LEVELS = {
  SOUND_POPUP: "sound+popup",
  SOUND: "sound",
  POPUP: "popup",
  OFF: "off",
} as const;

export type Level = (typeof LEVELS)[keyof typeof LEVELS];

export type SignalReason = "input" | "question" | "done";
