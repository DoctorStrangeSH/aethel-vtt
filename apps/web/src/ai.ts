// Настройки AI
const AI_ENDPOINT = 'http://localhost:11434/api/generate'; // Ollama по умолчанию
const AI_MODEL = 'llama3.2:3b'; // лёгкая модель

interface AIGenerateOptions {
  prompt: string;
  system?: string;
}

export async function generateText({ prompt, system }: AIGenerateOptions): Promise<string> {
  const body: any = {
    model: AI_MODEL,
    prompt: prompt,
    stream: false,
  };

  if (system) {
    body.system = system;
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || 'Нет ответа';
  } catch (e: any) {
    console.error('AI Error:', e);
    return `⚠ Ошибка AI: ${e.message}. Убедитесь, что Ollama запущен.`;
  }
}

// Готовые промпты
export function roomDescriptionPrompt(name: string): string {
  return `Ты — Мастер Подземелий. Опиши комнату "${name}" в стиле D&D. 3-4 предложения, атмосферно, с деталями. На русском языке.`;
}

export function npcDialogPrompt(npcName: string, context: string): string {
  return `Ты — NPC по имени ${npcName} в мире D&D. Контекст: ${context}. Ответь как этот персонаж, 2-3 предложения, в стиле фэнтези. На русском языке.`;
}

export function itemDescriptionPrompt(itemName: string): string {
  return `Опиши магический предмет "${itemName}" в стиле D&D. 2-3 предложения, с намёком на историю. На русском языке.`;
}