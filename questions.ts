// The questions Jev answers on every run. Edit freely: add, remove, or reword them.
//
// Three question types; answers always come back as probabilities, never free text:
//   choice  - picks one option. criteria: option name -> what it means
//   score   - a position on an ordered scale. criteria: levels from lowest to highest (at least 2)
//   boolean - a yes/no probability. criteria (optional): what true and false mean
//
// Tips from TypeSafe's docs: ask one judgment per question, describe situations rather than
// degrees, and give choice questions an "other" option so unrelated input has somewhere to go.

export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "boolean"; instructions: string; criteria?: { true: string; false: string } };

export const questions: Record<string, Question> = {
  emotion: {
    type: "choice",
    instructions: "What is the speaker's main emotion right now?",
    criteria: {
      happy: "pleased, satisfied, or excited",
      angry: "furious, annoyed, or aggressive",
      disappointed: "let down, resigned, or feeling failed by someone",
      neutral: "calmly stating something, no clear emotion",
      other: "none of the above fits",
    },
  },
  intent: {
    type: "choice",
    instructions: "What is the speaker mainly trying to do with this message?",
    criteria: {
      ask: "asking a question or asking for information",
      request: "asking someone to do something",
      complain: "complaining or pointing out a problem",
      share: "sharing news, an opinion, or a feeling",
      chat: "greeting, thanking, or small talk",
      other: "none of the above fits",
    },
  },
  politeness: {
    type: "score",
    instructions: "How polite is this toward the listener?",
    criteria: [
      "rude: insults, mockery, or a commanding tone",
      "direct: not courteous, but not impolite",
      "polite: uses courteous phrasing",
      "very polite: considerate of the listener throughout",
    ],
  },
  urgency: {
    type: "score",
    instructions: "How soon does this message need attention?",
    criteria: [
      "none: no time pressure at all",
      "low: can wait a few days",
      "medium: should be handled today",
      "high: needs attention right now",
    ],
  },
  sarcasm: {
    type: "boolean",
    instructions: "Is the speaker being sarcastic, praising on the surface but actually unhappy?",
    criteria: {
      true: "the literal meaning is the opposite of the intended meaning",
      false: "the literal meaning is the intended meaning",
    },
  },
  needs_reply: {
    type: "boolean",
    instructions: "Does the speaker expect a reply?",
    criteria: {
      true: "asks a question, makes a request, or invites a response",
      false: "a statement that needs no answer",
    },
  },
  formality: {
    type: "choice",
    instructions: "What register is the message written in?",
    criteria: {
      formal: "professional or official wording",
      casual: "everyday conversational wording",
      slang: "internet slang, memes, or heavy abbreviations",
    },
  },
};
