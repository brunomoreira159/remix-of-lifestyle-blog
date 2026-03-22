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

// Configuração da API do Groq (chamada direta)
const GROQ_CONFIG = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "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",
  model: "llama-3.3-70b-versatile",
};

// Componente para renderizar Markdown básico
const SimpleMarkdown = ({ content }: { content: string }) => {
  // Processa markdown básico: **bold**, *italic*, `code`
  const processMarkdown = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;
    
    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic: *text*
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
      // Code: `text`
      const codeMatch = remaining.match(/`(.+?)`/);
      
      const matches = [
        boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index! } : null,
        italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index! } : null,
        codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index! } : null,
      ].filter(Boolean).sort((a, b) => a!.index - b!.index);
      
      if (matches.length === 0) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }
      
      const firstMatch = matches[0]!;
      
      // Add text before match
      if (firstMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, firstMatch.index)}</span>);
      }
      
      // Add formatted text
      const matchedText = firstMatch.match[1];
      switch (firstMatch.type) {
        case 'bold':
          parts.push(<strong key={key++}>{matchedText}</strong>);
          break;
        case 'italic':
          parts.push(<em key={key++}>{matchedText}</em>);
          break;
        case 'code':
          parts.push(<code key={key++} className="bg-muted px-1 rounded text-xs">{matchedText}</code>);
          break;
      }
      
      remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
    }
    
    return parts;
  };
  
  // Divide por linhas para preservar quebras de linha
  const lines = content.split('\n');
  
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {processMarkdown(line)}
          {idx < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
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

    // Query simples sem orderBy composto para evitar necessidade de índices
    const chatRef = collection(db, "chat_messages");
    const q = query(
      chatRef,
      where("userId", "==", user.uid),
      limit(100)
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

      // Ordenar no cliente por timestamp
      history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Limitar aos últimos 50 mensagens
      const recentHistory = history.slice(-50);

      if (recentHistory.length > 0) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Olá! Eu sou o **APEX Chat**, seu assistente virtual. Como posso ajudá-lo hoje?`,
            timestamp: new Date(),
          },
          ...recentHistory
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

      // 5. Preparar as mensagens para a API Groq
      const fullSystemPrompt = produtosContext.isProdutosRequest 
        ? `${systemPrompt}\n\n${produtosContext.context}`
        : systemPrompt;

      // Montar mensagens no formato da API OpenAI (compatível com Groq)
      const apiMessages = [
        { role: "system", content: fullSystemPrompt },
        ...conversationHistory,
        { role: "user", content: userContent }
      ];

      // 6. Fazer requisição direta para a API Groq
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Sem conexao com a internet");
      }

      const response = await fetchWithTimeout(`${GROQ_CONFIG.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_CONFIG.model,
          messages: apiMessages,
          max_tokens: 4096,
          temperature: 0.7,
        }),
        timeoutMs: 60000,
      } as any);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Groq API Error:", response.status, errorData);
        
        if (response.status === 429) {
          throw new Error("Limite de requisicoes excedido. Aguarde um momento.");
        } else {
          throw new Error(errorData.error?.message || `Erro na API: ${response.status}`);
        }
      }

      const data = await response.json();
      const assistantContent = data.choices?.[0]?.message?.content || "Desculpe, nao consegui processar sua mensagem no momento.";
      
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
      
      // Mensagem de erro amigavel
      let errorMessageText = "Desculpe, houve um erro ao processar sua mensagem. ";
      
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes("sem conexao") || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          errorMessageText += "Voce esta offline. Verifique sua conexao com a internet.";
        } else if (error.message.includes("API") || error.message.includes("401")) {
          errorMessageText += "Problema com o servico de IA. Tente novamente.";
        } else if (error.message.includes("fetch") || error.message.toLowerCase().includes("network") || error.message.toLowerCase().includes("abort")) {
          errorMessageText += "Nao foi possivel conectar ao servico. Verifique sua conexao com a internet.";
        } else if (error.message.includes("429")) {
          errorMessageText += "Muitas requisicoes. Aguarde alguns segundos e tente novamente.";
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
                  <div className="text-sm whitespace-pre-wrap">
                    <SimpleMarkdown content={message.content} />
                  </div>
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
