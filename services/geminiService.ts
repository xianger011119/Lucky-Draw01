
import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function announceWinner(name: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ 
          text: `用充滿活力和開心的語氣宣佈：『恭喜中獎！幸運兒就是：${name}！祝你今天好運連連！』` 
        }] 
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    return null;
  }
}

export async function generateFortune(name: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `幫中獎人 ${name} 寫一句簡短（15字內）的幽默開心的幸運語。`,
      config: { maxOutputTokens: 50 }
    });
    return response.text?.trim() || "幸運之神降臨在你身上！";
  } catch {
    return "今天是你的幸運日！";
  }
}

export async function suggestTeamNames(count: number): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `請生成 ${count} 個富有創意、有趣、充滿動力的團隊名稱。每行一個隊名，不要有標點符號。主題可以是「超級英雄」、「科技感」或「奇幻森林」。`,
      config: { maxOutputTokens: 200 }
    });
    const names = response.text?.split('\n').map(n => n.replace(/^\d+\.\s*/, '').trim()).filter(n => n.length > 0) || [];
    return names.slice(0, count);
  } catch {
    return Array.from({ length: count }, (_, i) => `Team ${i + 1}`);
  }
}
