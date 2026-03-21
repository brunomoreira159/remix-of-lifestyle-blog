import { useState, useEffect, useRef } from "react";
import { Bot, User, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit } from "firebase/firestore";
import { db } from "@/firebase/firebase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ApexChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}



const ApexChatModal = ({ isOpen, onClose }: ApexChatModalProps) => {
  const { user, userData } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Olá! Eu sou o **APEX Chat**, seu assistente virtual. Como posso ajudá-lo hoje?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carregar histórico do Firebase quando o chat abrir
  useEffect(() => {
    if (!isOpen || !user) return;

    const chatRef = collection(db, "chat_messages");
    const q = query(
      chatRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "asc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          id: doc.id,
          role: data.role,
          content: data.content,
          timestamp: data.createdAt?.toDate() || new Date(),
        });
      });

      if (history.length > 0) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Olá! Eu sou o **APEX Chat**, seu assistente virtual. Como posso ajudá-lo hoje?`,
            timestamp: new Date(),
          },
          ...history
        ]);
      }
    });

    return () => unsubscribe();
  }, [isOpen, user]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      const scrollArea = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;

    const userContent = input;
    setInput("");
    setIsLoading(true);

    try {
      // 1. Salvar mensagem do usuário no Firebase
      await addDoc(collection(db, "chat_messages"), {
        userId: user.uid,
        role: "user",
        content: userContent,
        createdAt: serverTimestamp(),
      });

      // 2. Preparar o histórico de mensagens para o contexto
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      // 3. Chamar NVIDIA NIM API
      const response = await fetch("/api/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-4-340b-instruct",
          messages: [
            {
              role: "system",
              content: `Você é o APEX Chat, um assistente virtual profissional e prestativo da plataforma APEX HUB.
              
Informações do usuário:
- Nome: ${userData?.nome || user.email || "Usuário"}
- Email: ${user?.email || "Não informado"}

Diretrizes:
- Seja sempre educado, profissional e prestativo
- Utilize as informações do usuário quando relevante para personalizar as respostas
- Forneça respostas claras, concisas e úteis
- Se não souber algo, seja honesto e ofereça ajuda alternativa
- Mantenha um tom amigável mas profissional
- Responda sempre em português do Brasil`
            },
            ...conversationHistory,
            { role: "user", content: userContent }
          ],
          temperature: 0.7,
          top_p: 0.95,
          max_tokens: 1024,
          frequency_penalty: 0.3,
          presence_penalty: 0.3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("NVIDIA API Error:", response.status, errorData);
        
        // Tratamento específico para erros comuns
        if (response.status === 401) {
          throw new Error("Chave API inválida. Verifique suas credenciais NVIDIA.");
        } else if (response.status === 429) {
          throw new Error("Limite de requisições excedido. Aguarde um momento.");
        } else if (response.status === 503) {
          throw new Error("Serviço NVIDIA temporariamente indisponível. Tente novamente.");
        } else {
          throw new Error(errorData.error?.message || `Erro NVIDIA API: ${response.status}`);
        }
      }

      const data = await response.json();
      const assistantContent = data.choices[0]?.message?.content || "Desculpe, não consegui processar sua mensagem no momento.";
      
      // 4. Salvar resposta da assistente no Firebase
      await addDoc(collection(db, "chat_messages"), {
        userId: user.uid,
        role: "assistant",
        content: assistantContent,
        createdAt: serverTimestamp(),
      });
      
    } catch (error) {
      console.error("Chat error:", error);
      
      // Mensagem de erro amigável
      let errorMessageText = "Desculpe, houve um erro ao processar sua mensagem. ";
      
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          errorMessageText += "Problema com a autenticação da API NVIDIA.";
        } else if (error.message.includes("fetch")) {
          errorMessageText += "Não foi possível conectar ao serviço NVIDIA. Verifique sua conexão.";
        } else {
          errorMessageText += error.message;
        }
      } else {
        errorMessageText += "Tente novamente em alguns momentos.";
      }
      
      const errorMessage: Message = {
        id: "error-" + Date.now(),
        role: "assistant",
        content: errorMessageText,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
      
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <span>APEX Chat</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      message.role === "user"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Digitando...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="flex-1"
            />
            <Button size="icon" onClick={handleSend} disabled={isLoading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApexChatModal;