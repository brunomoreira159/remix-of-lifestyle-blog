import { useState, useEffect, useRef } from "react";
import { Bot, User, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  limit, 
  getDocs,
  serverTimestamp 
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import skillPrompt from "@/AI/Skill.md?raw";

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

interface ProdutoChatData {
  id: string;
  codigo_estoque: string;
  codigo_material: string;
  nome: string;
  quantidade: number;
  quantidade_minima: number;
  valor_unitario: number;
  unidade_de_medida: string;
  deposito: string;
  prateleira: string;
  unidade: string;
  detalhes: string;
  data_vencimento: string;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  ativo: string;
}

interface ProdutosEndpointResult {
  isProdutosRequest: boolean;
  context: string;
  fallbackAnswer: string;
}

const STOP_WORDS = new Set([
  "quais",
  "qual",
  "quero",
  "mostrar",
  "mostre",
  "listar",
  "liste",
  "tem",
  "tenho",
  "produto",
  "produtos",
  "item",
  "itens",
  "do",
  "da",
  "de",
  "dos",
  "das",
  "no",
  "na",
  "nos",
  "nas",
  "com",
  "sem",
  "por",
  "para",
  "que",
  "em",
  "os",
  "as",
  "um",
  "uma",
  "mais",
  "menos",
  "me",
  "traga",
  "busque",
  "buscar",
  "sobre"
]);

const normalizeText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const formatCurrencyBRL = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";

const isLikelyProdutosRequest = (message: string) => {
  const normalized = normalizeText(message);
  const keywords = [
    "produto",
    "estoque",
    "deposito",
    "fornecedor",
    "preco",
    "valor",
    "prateleira",
    "vencimento",
    "codigo",
    "material",
    "quantidade",
    "unidade",
    "barato",
    "caro"
  ];
  return keywords.some((keyword) => normalized.includes(keyword)) || /^(tem|quais|qual|liste|listar|mostre|mostrar)\b/.test(normalized);
};

const extractSearchTerms = (message: string) => {
  const normalized = normalizeText(message).replace(/[^\w\s]/g, " ");
  return normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 5);
};

const localProdutosEndpoint = async (message: string): Promise<ProdutosEndpointResult> => {
  if (!isLikelyProdutosRequest(message)) {
    return { isProdutosRequest: false, context: "", fallbackAnswer: "" };
  }

  try {
    const produtosSnapshot = await getDocs(query(collection(db, "produtos"), orderBy("nome"), limit(300)));
    const produtos = produtosSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        codigo_estoque: data.codigo_estoque || "",
        codigo_material: data.codigo_material || "",
        nome: data.nome || "",
        quantidade: data.quantidade || 0,
        quantidade_minima: data.quantidade_minima || 0,
        valor_unitario: data.valor_unitario || 0,
        unidade_de_medida: data.unidade_de_medida || "",
        deposito: data.deposito || "",
        prateleira: data.prateleira || "",
        unidade: data.unidade || "",
        detalhes: data.detalhes || "",
        data_vencimento: data.data_vencimento || "",
        fornecedor_nome: data.fornecedor_nome || null,
        fornecedor_cnpj: data.fornecedor_cnpj || null,
        ativo: data.ativo || "sim",
      } as ProdutoChatData;
    });

    const normalizedMessage = normalizeText(message);
    let filtered = [...produtos];

    if (normalizedMessage.includes("inativo")) {
      filtered = filtered.filter((produto) => normalizeText(produto.ativo) === "nao");
    } else {
      filtered = filtered.filter((produto) => normalizeText(produto.ativo) !== "nao");
    }

    if (/(zerado|sem estoque|esgotado|quantidade zero)/.test(normalizedMessage)) {
      filtered = filtered.filter((produto) => produto.quantidade <= 0);
    } else if (/(baixo estoque|estoque baixo|abaixo do minimo|repor|faltando)/.test(normalizedMessage)) {
      filtered = filtered.filter((produto) => produto.quantidade < produto.quantidade_minima);
    }

    const depositoMatch = normalizedMessage.match(/deposito\s+([a-z0-9\s-]+)/);
    if (depositoMatch?.[1]) {
      const depositoBusca = depositoMatch[1].trim();
      filtered = filtered.filter((produto) => normalizeText(produto.deposito).includes(depositoBusca));
    }

    const fornecedorMatch = normalizedMessage.match(/fornecedor\s+([a-z0-9\s-]+)/);
    if (fornecedorMatch?.[1]) {
      const fornecedorBusca = fornecedorMatch[1].trim();
      filtered = filtered.filter((produto) => normalizeText(produto.fornecedor_nome || "").includes(fornecedorBusca));
    }

    const searchTerms = extractSearchTerms(message);
    if (searchTerms.length > 0) {
      filtered = filtered.filter((produto) => {
        const base = normalizeText(
          `${produto.nome} ${produto.codigo_estoque} ${produto.codigo_material} ${produto.detalhes} ${produto.fornecedor_nome || ""} ${produto.fornecedor_cnpj || ""} ${produto.deposito} ${produto.prateleira}`
        );
        return searchTerms.some((term) => base.includes(term));
      });
    }

    if (/(mais barato|mais baratos|menor preco|preco mais baixo|barato)/.test(normalizedMessage)) {
      filtered.sort((a, b) => a.valor_unitario - b.valor_unitario);
    } else if (/(mais caro|mais caros|maior preco|preco mais alto|caro)/.test(normalizedMessage)) {
      filtered.sort((a, b) => b.valor_unitario - a.valor_unitario);
    }

    const totalEncontrado = filtered.length;
    const topProdutos = filtered.slice(0, 12);

    const contextoProdutos = topProdutos
      .map(
        (produto, index) =>
          `${index + 1}. nome=${produto.nome}; codigo_estoque=${produto.codigo_estoque}; codigo_material=${produto.codigo_material}; quantidade=${produto.quantidade}; quantidade_minima=${produto.quantidade_minima}; valor_unitario=${formatCurrencyBRL(produto.valor_unitario)}; unidade_de_medida=${produto.unidade_de_medida}; deposito=${produto.deposito}; prateleira=${produto.prateleira}; unidade=${produto.unidade}; fornecedor_nome=${produto.fornecedor_nome || "não informado"}; fornecedor_cnpj=${produto.fornecedor_cnpj || "não informado"}; data_vencimento=${produto.data_vencimento || "não informado"}; ativo=${produto.ativo}; detalhes=${produto.detalhes || "não informado"}`
      )
      .join("\n");

    const contexto = totalEncontrado > 0
      ? `Consulta de produtos no Firestore:\n- Pergunta do usuário: ${message}\n- Total encontrado: ${totalEncontrado}\n- Registros enviados para resposta: ${topProdutos.length}\n- Campos disponíveis: id, codigo_estoque, codigo_material, nome, quantidade, quantidade_minima, valor_unitario, unidade_de_medida, deposito, prateleira, unidade, detalhes, data_vencimento, fornecedor_nome, fornecedor_cnpj, ativo\n- Dados:\n${contextoProdutos}`
      : `Consulta de produtos no Firestore:\n- Pergunta do usuário: ${message}\n- Total encontrado: 0\n- Campos disponíveis: id, codigo_estoque, codigo_material, nome, quantidade, quantidade_minima, valor_unitario, unidade_de_medida, deposito, prateleira, unidade, detalhes, data_vencimento, fornecedor_nome, fornecedor_cnpj, ativo\n- Não há produtos correspondentes aos filtros da pergunta.`;

    const fallbackAnswer = totalEncontrado > 0
      ? `Encontrei ${totalEncontrado} produto(s). ${topProdutos
          .slice(0, 5)
          .map(
            (produto) =>
              `${produto.nome} (estoque: ${produto.quantidade}, mínimo: ${produto.quantidade_minima}, valor: ${formatCurrencyBRL(produto.valor_unitario)}, depósito: ${produto.deposito || "não informado"})`
          )
          .join(" | ")}`
      : "Não encontrei produtos com os critérios informados. Tente buscar por nome, código, depósito ou fornecedor.";

    return {
      isProdutosRequest: true,
      context: contexto,
      fallbackAnswer,
    };
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return {
      isProdutosRequest: false,
      context: "",
      fallbackAnswer: "Desculpe, não foi possível buscar os produtos no momento. Tente novamente mais tarde.",
    };
  }
};

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) => {
  const timeoutMs = (init as any)?.timeoutMs ?? 15000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

const envNim = ((import.meta as any)?.env ?? {}) as Record<string, string | undefined>;
const NVIDIA_NIM_CONFIG = {
  baseUrl: envNim.VITE_NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  apiKey: envNim.VITE_NVIDIA_API_KEY || "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",
  model: envNim.VITE_NVIDIA_MODEL || "qwen/qwen3.5-122b-a10b",
};

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
    
    // Adicionar mensagem do usuário imediatamente na UI
    const userMessage: Message = {
      id: "user-" + Date.now(),
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    
    let produtosContext: ProdutosEndpointResult = { isProdutosRequest: false, context: "", fallbackAnswer: "" };

    try {
      // 1. Salvar mensagem do usuário no Firebase
      await addDoc(collection(db, "chat_messages"), {
        userId: user.uid,
        role: "user",
        content: userContent,
        createdAt: serverTimestamp(),
      });

      // 2. Buscar contexto de produtos se necessário
      produtosContext = await localProdutosEndpoint(userContent);

      // 3. Preparar o histórico de mensagens para o contexto
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      // 4. Preparar o system prompt com as habilidades e contexto do usuário
      const systemPrompt = `${skillPrompt}

Informações do usuário:
- Nome: ${userData?.nome || user.email || "Usuário"}
- Email: ${user?.email || "Não informado"}

Diretrizes adicionais:
- Utilize as informações do usuário quando relevante para personalizar as respostas
- Forneça respostas claras, concisas e úteis
- Se não souber algo, seja honesto e ofereça ajuda alternativa
- Mantenha um tom amigável e profissional
- Responda sempre em português do Brasil`;

      // 5. Preparar o corpo da requisição para NVIDIA NIM
      const requestBody = {
        model: NVIDIA_NIM_CONFIG.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...(produtosContext.isProdutosRequest ? [{ role: "system", content: produtosContext.context }] : []),
          ...conversationHistory,
          { role: "user", content: userContent }
        ],
        max_tokens: 16384,
        temperature: 0.60,
        top_p: 0.95,
        frequency_penalty: 0.3,
        presence_penalty: 0.3,
        stream: false, // Desabilitando stream para simplificar
      };

      // 6. Fazer requisição para NVIDIA NIM
      console.log("Enviando requisição para NVIDIA NIM...");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Sem conexão com a internet");
      }
      if (!NVIDIA_NIM_CONFIG.apiKey) {
        throw new Error("Chave de API NVIDIA não configurada. Defina VITE_NVIDIA_API_KEY.");
      }
      let response: Response | undefined;
      try {
        response = await fetchWithTimeout(`${NVIDIA_NIM_CONFIG.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${NVIDIA_NIM_CONFIG.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          timeoutMs: 15000,
        } as any);
      } catch (e) {
        await new Promise((r) => setTimeout(r, 900));
        response = await fetchWithTimeout(`${NVIDIA_NIM_CONFIG.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${NVIDIA_NIM_CONFIG.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          timeoutMs: 20000,
        } as any);
      }

      if (!response!.ok) {
        const errorData = await response!.json().catch(() => ({}));
        console.error("NVIDIA API Error:", response.status, errorData);
        
        // Tratamento específico para erros comuns
        if (response!.status === 401) {
          throw new Error("Chave API inválida. Verifique suas credenciais NVIDIA.");
        } else if (response!.status === 429) {
          throw new Error("Limite de requisições excedido. Aguarde um momento.");
        } else if (response!.status === 503) {
          throw new Error("Serviço NVIDIA temporariamente indisponível. Tente novamente.");
        } else {
          throw new Error(errorData.error?.message || `Erro NVIDIA API: ${response!.status}`);
        }
      }

      const data = await response!.json();
      const assistantContent = data.choices[0]?.message?.content || "Desculpe, não consegui processar sua mensagem no momento.";
      
      // 7. Adicionar mensagem da assistente na UI
      const assistantMessage: Message = {
        id: "assistant-" + Date.now(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // 8. Salvar resposta da assistente no Firebase
      await addDoc(collection(db, "chat_messages"), {
        userId: user.uid,
        role: "assistant",
        content: assistantContent,
        createdAt: serverTimestamp(),
      });
      
    } catch (error) {
      console.error("Chat error:", error);

      // Se foi uma requisição de produtos e temos fallback, usar ele
      if (produtosContext.isProdutosRequest && produtosContext.fallbackAnswer) {
        const fallbackMessage: Message = {
          id: "fallback-" + Date.now(),
          role: "assistant",
          content: produtosContext.fallbackAnswer,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        
        await addDoc(collection(db, "chat_messages"), {
          userId: user.uid,
          role: "assistant",
          content: produtosContext.fallbackAnswer,
          createdAt: serverTimestamp(),
        });
        return;
      }
      
      // Mensagem de erro amigável
      let errorMessageText = "Desculpe, houve um erro ao processar sua mensagem. ";
      
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes("sem conexão") || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          errorMessageText += "Você está offline. Verifique sua conexão com a internet.";
        } else if (error.message.includes("API key") || error.message.includes("401") || error.message.includes("não configurada")) {
          errorMessageText += "Problema com a autenticação da API NVIDIA. Verifique a chave de API.";
        } else if (error.message.includes("fetch") || error.message.toLowerCase().includes("network") || error.message.toLowerCase().includes("abort")) {
          errorMessageText += "Não foi possível conectar ao serviço NVIDIA. Verifique sua conexão com a internet.";
        } else if (error.message.includes("429")) {
          errorMessageText += "Muitas requisições. Aguarde alguns segundos e tente novamente.";
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
