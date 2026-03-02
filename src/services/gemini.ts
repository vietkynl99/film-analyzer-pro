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

export const extractOriginalTitleFromPoster = async (imageDataUrl: string): Promise<string> => {
  if (!imageDataUrl) return "";

  try {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      console.warn("Invalid image data URL format for poster.");
      return "";
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are an expert at reading Chinese drama posters.",
                "From this poster image, extract ONLY the main original title in Chinese.",
                "Ignore subtitles, platform names, actor names, episode counts, dates, or any other decorative text.",
                "Return exactly the title text in Chinese and nothing else."
              ].join(" "),
            },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Title extraction error:", error);
    return "";
  }
};
