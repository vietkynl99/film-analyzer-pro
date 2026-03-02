import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const translateToVietnamese = async (text: string): Promise<string> => {
  if (!text) return "";
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to Vietnamese. If it's already in Vietnamese, return it as is. Use natural Vietnamese that is easy to understand. You may use common Sino-Vietnamese terms (Hán-Việt) that people frequently see in film titles, but avoid extremely rare, archaic, or overly academic words. Text: "${text}"`,
      config: {
        systemInstruction: "You are a professional Vietnamese translator. Translate the provided text to clear Vietnamese suitable for film and drama titles. It is OK to use common Sino-Vietnamese words (like 'dị thế', 'huyền bí', 'khám phá'), but avoid very heavy, obscure, or archaic Hán-Việt that normal viewers rarely use. Only return the translated text, nothing else.",
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

export const generateYoutubeTitles = async (
  style: string,
  sourceText: string
): Promise<string[]> => {
  if (!sourceText) return [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Bạn là chuyên gia tối ưu tiêu đề YouTube cho phim/hoạt hình.",
                "Dựa trên tiêu đề gốc (bất kỳ ngôn ngữ) và tóm tắt (nếu có), hãy tạo đúng 10 tiêu đề YouTube tiếng Việt tối ưu CTR.",
                "Ưu tiên dựa trên TIÊU ĐỀ GỐC: hãy Việt hoá tiêu đề gốc và thêm hook/hứa hẹn phù hợp YouTube để tăng CTR, thay vì nghĩ ra hoàn toàn một tiêu đề mới không liên quan.",
                "Không dịch từng chữ; có thể điều chỉnh, rút gọn, đảo cấu trúc hoặc thêm hook, nhưng phải giữ tinh thần nội dung và không bịa thêm chi tiết.",
                "Tiêu đề cần gây tò mò, tăng khả năng click, hợp văn phong YouTube Việt, tự nhiên, không lố, không giật tít rẻ tiền; độ dài lý tưởng khoảng 50–70 ký tự.",
                "",
                `Phong cách ưu tiên hiện tại: ${style || "trung tính – SEO"}.`,
                "",
                "Quy tắc định dạng:",
                "- Chỉ trả về danh sách 10 tiêu đề, mỗi tiêu đề trên một dòng riêng.",
                "- Không viết toàn chữ in hoa.",
                "- Không lạm dụng dấu chấm than.",
                "- Không giải thích, không phân tích, không thêm nhận xét hay nội dung nào khác."
              ].join(" "),
            },
            {
              text: `\n\nNội dung:\n${sourceText}`,
            },
          ],
        },
      ],
    });

    const raw = response.text?.trim() || "";
    if (!raw) return [];

    const lines = raw
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    // Bỏ số thứ tự nếu có, lấy tối đa 10 dòng
    return lines
      .map(line => line.replace(/^\d+[\).\-\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 10);
  } catch (error) {
    console.error("generateYoutubeTitles error:", error);
    return [];
  }
};
