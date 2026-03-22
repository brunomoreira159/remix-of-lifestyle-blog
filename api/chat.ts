import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, systemPrompt } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid messages format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    // Usar Llama 3.3 70B - suporta até 128k tokens de contexto
    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxTokens: 4096,
      temperature: 0.7,
    });

    return new Response(
      JSON.stringify({ content: text }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Groq API Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao processar mensagem",
        details: error.toString()
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
