export const llmPatterns = [
  /openai|OpenAI|anthropic|Anthropic|GoogleGenerativeAI|gemini/,
  /createChatCompletion|messages\.create|generateContent/,
  /generateDoPrompt|buildPrompt|promptTemplate/,
  /fetch.*api\.openai|fetch.*api\.anthropic|fetch.*generativelanguage/,
];
