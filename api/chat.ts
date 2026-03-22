import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  console.log("[v0] Chat API called");
  
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { messages, systemPrompt } = body;
    
    console.log("[v0] Received messages:", messages?.length);
    console.log("[v0] System prompt length:", systemPrompt?.length);
    console.log("[v0] GROQ_API_KEY exists:", !!process.env.GROQ_API_KEY);

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid messages format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log("[v0] Calling Groq API...");

    // Usar Llama 3.3 70B - suporta até 128k tokens de contexto
    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: systemPrompt || "Você é um assistente virtual prestativo.",
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxTokens: 4096,
      temperature: 0.7,
    });

    console.log("[v0] Groq response received, length:", text?.length);

    return new Response(
      JSON.stringify({ content: text }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[v0] Groq API Error:", error);
    console.error("[v0] Error name:", error?.name);
    console.error("[v0] Error message:", error?.message);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao processar mensagem",
        details: error.toString()
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
