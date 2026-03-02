import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const translateToVietnamese = async (text: string): Promise<string> => {
  if (!text) return "";
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to Vietnamese. If it's already in Vietnamese, return it as is. Text: "${text}"`,
      config: {
        systemInstruction: "You are a professional translator. Translate the provided text to natural-sounding Vietnamese. Only return the translated text, nothing else.",
      },
    });
    
    return response.text?.trim() || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text; // Fallback to original text
  }
};

export const isChinese = (text: string): boolean => {
  // Simple regex to detect Chinese characters
  return /[\u4e00-\u9fa5]/.test(text);
};
