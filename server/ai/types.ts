export const PROMPT_VERSION = 'stage4-v1';
export const AI_MODEL_FALLBACK = 'local-fallback';
export type Mood = 'normal'|'romantic'|'sad'|'funny'|'deep'|'night'|'memory'|'important'|'hopeful'|'neutral';
export type SuggestedStyle = { frame:string;background:string;decoration:string[];animation:string;zone:'default'|'night'|'burgundy'|'pixel'|'gif'|'travel'|'winter'|'sepia'|'rain'|'romantic' };
export type AiResult = { displayText:string;mood:Mood;importance:number;suggestedStyle:SuggestedStyle;model:string;promptVersion:string };
