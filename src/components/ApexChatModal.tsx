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

// Interfaces para todas as coleções
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
  fornecedor_id: string | null;
  ativo: string;
}

interface FornecedorChatData {
  id: string;
  razaoSocial: string;
  cnpj: string;
  endereco: {
    rua: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  telefone: string;
  email: string;
  pessoaContato: string;
  condicoesPagamento: string;
  prazoEntrega: string;
}

interface EquipamentoChatData {
  id: string;
  equipamento: string;
  patrimonio: string;
  setor: string;
  tag: string;
  status: string;
  descricao: string;
}

interface ManutentorChatData {
  id: string;
  nome: string;
  cargo: string;
  setor: string;
  email: string;
  telefone: string;
  status: string;
}

interface ManualChatData {
  id: string;
  titulo: string;
  subtitulo: string;
  ativo: boolean;
  dataCriacao: string;
}

interface TarefaManutencaoChatData {
  id: string;
  titulo: string;
  descricao: string;
  equipamento: string;
  setor: string;
  frequencia: string;
  status: string;
  prioridade: string;
  manutentor: string;
  dataHoraAgendada: string;
}

interface OrdemServicoChatData {
  id: string;
  titulo: string;
  descricao: string;
  equipamento: string;
  setor: string;
  status: string;
  prioridade: string;
  dataAbertura: string;
  dataConclusao: string;
}

interface UnidadeChatData {
  id: string;
  nome: string;
  codigo: string;
  endereco: string;
  responsavel: string;
  telefone: string;
}

interface SetorChatData {
  id: string;
  nome: string;
  descricao: string;
  responsavel: string;
  unidade: string;
}

interface CentroCustoChatData {
  id: string;
  nome: string;
  codigo: string;
  descricao: string;
}

interface DatabaseContextResult {
  hasRelevantData: boolean;
  context: string;
  fallbackAnswer: string;
}

const STOP_WORDS = new Set([
  "quais", "qual", "quero", "mostrar", "mostre", "listar", "liste", "tem", "tenho",
  "produto", "produtos", "item", "itens", "do", "da", "de", "dos", "das", "no", "na",
  "nos", "nas", "com", "sem", "por", "para", "que", "em", "os", "as", "um", "uma",
  "mais", "menos", "me", "traga", "busque", "buscar", "sobre", "onde", "como", "quando",
  "maquina", "maquinas", "equipamento", "equipamentos", "fornecedor", "fornecedores",
  "manutentor", "manutentores", "manual", "manuais", "tarefa", "tarefas", "ordem", "ordens"
]);

const normalizeText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const formatCurrencyBRL = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";

// Detectar qual coleção a pergunta está relacionada
const detectRelevantCollections = (message: string): string[] => {
  const normalized = normalizeText(message);
  const collections: string[] = [];

  // Produtos
  if (/(produto|estoque|deposito|prateleira|vencimento|codigo|material|quantidade|barato|caro|item|itens|preco|valor)/.test(normalized)) {
    collections.push("produtos");
  }

  // Fornecedores
  if (/(fornecedor|cnpj|razao social|pagamento|prazo entrega|contato|fornece)/.test(normalized)) {
    collections.push("fornecedores");
  }

  // Equipamentos/Máquinas
  if (/(maquina|equipamento|patrimonio|tag|setor)/.test(normalized) && !/(manutentor)/.test(normalized)) {
    collections.push("equipamentos");
  }

  // Manutentores
  if (/(manutentor|tecnico|tecnicos|manutencao|quem faz|responsavel)/.test(normalized)) {
    collections.push("manutentores");
  }

  // Manuais
  if (/(manual|manuais|instrucao|instrucoes|documento)/.test(normalized)) {
    collections.push("manuais");
  }

  // Tarefas de Manutenção
  if (/(tarefa|tarefas|preventiva|agendada|agendamento|frequencia)/.test(normalized)) {
    collections.push("tarefas_manutencao");
  }

  // Ordens de Serviço
  if (/(ordem|ordens|os|servico|servicos|aberta|pendente|concluida)/.test(normalized)) {
    collections.push("ordens_servicos");
  }

  // Unidades
  if (/(unidade|unidades|filial|filiais|loja|lojas)/.test(normalized)) {
    collections.push("unidades");
  }

  // Setores
  if (/(setor|setores|departamento|area)/.test(normalized) && !/(equipamento|maquina)/.test(normalized)) {
    collections.push("setores");
  }

  // Centro de Custo
  if (/(centro de custo|centro custo|custo|centros)/.test(normalized)) {
    collections.push("centros_de_custo");
  }

  // Se não detectou nenhuma coleção específica mas parece uma pergunta sobre dados
  if (collections.length === 0 && /(quantos|quantas|lista|listar|mostre|mostrar|tem|temos|existe|buscar|encontrar|relatorio|resumo|total)/.test(normalized)) {
    // Buscar em todas as coleções principais
    collections.push("produtos", "fornecedores", "equipamentos");
  }

  return collections;
};

const extractSearchTerms = (message: string) => {
  const normalized = normalizeText(message).replace(/[^\w\s]/g, " ");
  return normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 5);
};

// Buscar dados de produtos
const fetchProdutosContext = async (message: string): Promise<string> => {
  try {
    const produtosSnapshot = await getDocs(query(collection(db, "produtos"), orderBy("nome"), limit(500)));
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
        fornecedor_id: data.fornecedor_id || null,
        ativo: data.ativo || "sim",
      } as ProdutoChatData;
    });

    const normalizedMessage = normalizeText(message);
    let filtered = [...produtos];

    // Filtros inteligentes
    if (normalizedMessage.includes("inativo")) {
      filtered = filtered.filter((p) => normalizeText(p.ativo) === "nao" || normalizeText(p.ativo) === "não");
    } else if (!normalizedMessage.includes("todos") && !normalizedMessage.includes("todas")) {
      filtered = filtered.filter((p) => normalizeText(p.ativo) !== "nao" && normalizeText(p.ativo) !== "não");
    }

    if (/(zerado|sem estoque|esgotado|quantidade zero)/.test(normalizedMessage)) {
      filtered = filtered.filter((p) => p.quantidade <= 0);
    } else if (/(baixo estoque|estoque baixo|abaixo do minimo|repor|faltando)/.test(normalizedMessage)) {
      filtered = filtered.filter((p) => p.quantidade < p.quantidade_minima);
    }

    // Busca por termos específicos
    const searchTerms = extractSearchTerms(message);
    if (searchTerms.length > 0) {
      filtered = filtered.filter((produto) => {
        const base = normalizeText(
          `${produto.nome} ${produto.codigo_estoque} ${produto.codigo_material} ${produto.detalhes} ${produto.fornecedor_nome || ""} ${produto.fornecedor_cnpj || ""} ${produto.deposito} ${produto.prateleira} ${produto.unidade}`
        );
        return searchTerms.some((term) => base.includes(term));
      });
    }

    // Ordenação
    if (/(mais barato|menor preco)/.test(normalizedMessage)) {
      filtered.sort((a, b) => a.valor_unitario - b.valor_unitario);
    } else if (/(mais caro|maior preco)/.test(normalizedMessage)) {
      filtered.sort((a, b) => b.valor_unitario - a.valor_unitario);
    }

    const topProdutos = filtered.slice(0, 20);
    const totalProdutos = produtos.length;
    const totalFiltrado = filtered.length;

    const contextoProdutos = topProdutos
      .map((p, i) =>
        `${i + 1}. Nome: ${p.nome} | Código Estoque: ${p.codigo_estoque} | Código Material: ${p.codigo_material} | Quantidade: ${p.quantidade} | Mínimo: ${p.quantidade_minima} | Valor: ${formatCurrencyBRL(p.valor_unitario)} | Unidade Medida: ${p.unidade_de_medida} | Depósito: ${p.deposito} | Prateleira: ${p.prateleira} | Unidade: ${p.unidade} | Fornecedor: ${p.fornecedor_nome || "não informado"} | CNPJ Fornecedor: ${p.fornecedor_cnpj || "não informado"} | Vencimento: ${p.data_vencimento || "não informado"} | Ativo: ${p.ativo} | Detalhes: ${p.detalhes || "não informado"}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO PRODUTOS ===\nTotal de produtos no sistema: ${totalProdutos}\nProdutos encontrados na busca: ${totalFiltrado}\nExibindo os primeiros ${topProdutos.length} registros:\n${contextoProdutos}`;
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return "\n\n=== COLEÇÃO PRODUTOS ===\nErro ao acessar dados de produtos.";
  }
};

// Buscar dados de fornecedores
const fetchFornecedoresContext = async (message: string): Promise<string> => {
  try {
    const fornecedoresSnapshot = await getDocs(collection(db, "fornecedores"));
    const fornecedores = fornecedoresSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        razaoSocial: data.razaoSocial || "",
        cnpj: data.cnpj || "",
        endereco: data.endereco || { rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "" },
        telefone: data.telefone || "",
        email: data.email || "",
        pessoaContato: data.pessoaContato || "",
        condicoesPagamento: data.condicoesPagamento || "",
        prazoEntrega: data.prazoEntrega || "",
      } as FornecedorChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...fornecedores];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((f) => {
        const base = normalizeText(
          `${f.razaoSocial} ${f.cnpj} ${f.email} ${f.telefone} ${f.pessoaContato} ${f.endereco.cidade} ${f.endereco.estado}`
        );
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topFornecedores = filtered.slice(0, 20);
    const totalFornecedores = fornecedores.length;
    const totalFiltrado = filtered.length;

    const contextoFornecedores = topFornecedores
      .map((f, i) =>
        `${i + 1}. Razão Social: ${f.razaoSocial} | CNPJ: ${f.cnpj} | Telefone: ${f.telefone} | Email: ${f.email} | Contato: ${f.pessoaContato} | Endereço: ${f.endereco.rua}, ${f.endereco.numero}, ${f.endereco.bairro}, ${f.endereco.cidade}/${f.endereco.estado} - CEP: ${f.endereco.cep} | Condições de Pagamento: ${f.condicoesPagamento} | Prazo de Entrega: ${f.prazoEntrega}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO FORNECEDORES ===\nTotal de fornecedores no sistema: ${totalFornecedores}\nFornecedores encontrados na busca: ${totalFiltrado}\nExibindo os primeiros ${topFornecedores.length} registros:\n${contextoFornecedores}`;
  } catch (error) {
    console.error("Erro ao buscar fornecedores:", error);
    return "\n\n=== COLEÇÃO FORNECEDORES ===\nErro ao acessar dados de fornecedores.";
  }
};

// Buscar dados de equipamentos/máquinas
const fetchEquipamentosContext = async (message: string): Promise<string> => {
  try {
    const equipamentosSnapshot = await getDocs(collection(db, "equipamentos"));
    const equipamentos = equipamentosSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        equipamento: data.equipamento || "",
        patrimonio: data.patrimonio || "",
        setor: data.setor || "",
        tag: data.tag || "",
        status: data.status || "Ativa",
        descricao: data.descricao || "",
      } as EquipamentoChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...equipamentos];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((e) => {
        const base = normalizeText(`${e.equipamento} ${e.patrimonio} ${e.setor} ${e.tag} ${e.descricao}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topEquipamentos = filtered.slice(0, 20);
    const totalEquipamentos = equipamentos.length;
    const totalFiltrado = filtered.length;

    const contextoEquipamentos = topEquipamentos
      .map((e, i) =>
        `${i + 1}. Equipamento: ${e.equipamento} | Patrimônio: ${e.patrimonio} | Setor: ${e.setor} | Tag: ${e.tag} | Status: ${e.status} | Descrição: ${e.descricao || "não informado"}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO EQUIPAMENTOS/MÁQUINAS ===\nTotal de equipamentos no sistema: ${totalEquipamentos}\nEquipamentos encontrados na busca: ${totalFiltrado}\nExibindo os primeiros ${topEquipamentos.length} registros:\n${contextoEquipamentos}`;
  } catch (error) {
    console.error("Erro ao buscar equipamentos:", error);
    return "\n\n=== COLEÇÃO EQUIPAMENTOS ===\nErro ao acessar dados de equipamentos.";
  }
};

// Buscar dados de manutentores
const fetchManutentoresContext = async (message: string): Promise<string> => {
  try {
    const manutentoresSnapshot = await getDocs(collection(db, "manutentores"));
    const manutentores = manutentoresSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        nome: data.nome || "",
        cargo: data.cargo || "",
        setor: data.setor || "",
        email: data.email || "",
        telefone: data.telefone || "",
        status: data.status || data.ativo ? "Ativo" : "Inativo",
      } as ManutentorChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...manutentores];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((m) => {
        const base = normalizeText(`${m.nome} ${m.cargo} ${m.setor} ${m.email}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topManutentores = filtered.slice(0, 20);
    const totalManutentores = manutentores.length;
    const totalFiltrado = filtered.length;

    const contextoManutentores = topManutentores
      .map((m, i) =>
        `${i + 1}. Nome: ${m.nome} | Cargo: ${m.cargo} | Setor: ${m.setor} | Email: ${m.email} | Telefone: ${m.telefone} | Status: ${m.status}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO MANUTENTORES ===\nTotal de manutentores no sistema: ${totalManutentores}\nManutentores encontrados na busca: ${totalFiltrado}\nExibindo os primeiros ${topManutentores.length} registros:\n${contextoManutentores}`;
  } catch (error) {
    console.error("Erro ao buscar manutentores:", error);
    return "\n\n=== COLEÇÃO MANUTENTORES ===\nErro ao acessar dados de manutentores.";
  }
};

// Buscar dados de manuais
const fetchManuaisContext = async (message: string): Promise<string> => {
  try {
    const manuaisSnapshot = await getDocs(collection(db, "pdf_manuais"));
    const manuais = manuaisSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        titulo: data.titulo || "",
        subtitulo: data.subtitulo || "",
        ativo: data.ativo !== false,
        dataCriacao: data.dataCriacao || "",
      } as ManualChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...manuais];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((m) => {
        const base = normalizeText(`${m.titulo} ${m.subtitulo}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topManuais = filtered.slice(0, 20);
    const totalManuais = manuais.length;
    const totalFiltrado = filtered.length;

    const contextoManuais = topManuais
      .map((m, i) =>
        `${i + 1}. Título: ${m.titulo} | Subtítulo: ${m.subtitulo} | Ativo: ${m.ativo ? "Sim" : "Não"} | Data Criação: ${m.dataCriacao}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO MANUAIS ===\nTotal de manuais no sistema: ${totalManuais}\nManuais encontrados na busca: ${totalFiltrado}\nExibindo os primeiros ${topManuais.length} registros:\n${contextoManuais}`;
  } catch (error) {
    console.error("Erro ao buscar manuais:", error);
    return "\n\n=== COLEÇÃO MANUAIS ===\nErro ao acessar dados de manuais.";
  }
};

// Buscar dados de tarefas de manutenção
const fetchTarefasManutencaoContext = async (message: string): Promise<string> => {
  try {
    const tarefasSnapshot = await getDocs(collection(db, "tarefas_manutencao"));
    const tarefas = tarefasSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        titulo: data.titulo || data.descricao || "",
        descricao: data.descricao || "",
        equipamento: data.equipamento || "",
        setor: data.setor || "",
        frequencia: data.frequencia || "",
        status: data.status || "",
        prioridade: data.prioridade || "",
        manutentor: data.manutentor || data.manutentorNome || "",
        dataHoraAgendada: data.dataHoraAgendada || "",
      } as TarefaManutencaoChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...tarefas];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((t) => {
        const base = normalizeText(`${t.titulo} ${t.descricao} ${t.equipamento} ${t.setor} ${t.manutentor}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topTarefas = filtered.slice(0, 20);
    const totalTarefas = tarefas.length;
    const totalFiltrado = filtered.length;

    const contextoTarefas = topTarefas
      .map((t, i) =>
        `${i + 1}. Título: ${t.titulo} | Equipamento: ${t.equipamento} | Setor: ${t.setor} | Frequência: ${t.frequencia} | Status: ${t.status} | Prioridade: ${t.prioridade} | Manutentor: ${t.manutentor} | Agendada: ${t.dataHoraAgendada}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO TAREFAS DE MANUTENÇÃO ===\nTotal de tarefas no sistema: ${totalTarefas}\nTarefas encontradas na busca: ${totalFiltrado}\nExibindo as primeiras ${topTarefas.length} registros:\n${contextoTarefas}`;
  } catch (error) {
    console.error("Erro ao buscar tarefas:", error);
    return "\n\n=== COLEÇÃO TAREFAS DE MANUTENÇÃO ===\nErro ao acessar dados de tarefas.";
  }
};

// Buscar dados de ordens de serviço
const fetchOrdensServicoContext = async (message: string): Promise<string> => {
  try {
    const ordensSnapshot = await getDocs(collection(db, "ordens_servicos"));
    const ordens = ordensSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        titulo: data.titulo || data.descricao || "",
        descricao: data.descricao || "",
        equipamento: data.equipamento || "",
        setor: data.setor || "",
        status: data.status || "",
        prioridade: data.prioridade || "",
        dataAbertura: data.dataAbertura || data.criadoEm || "",
        dataConclusao: data.dataConclusao || "",
      } as OrdemServicoChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...ordens];

    const normalizedMessage = normalizeText(message);
    if (normalizedMessage.includes("aberta") || normalizedMessage.includes("pendente")) {
      filtered = filtered.filter((o) => normalizeText(o.status).includes("aberta") || normalizeText(o.status).includes("pendente"));
    } else if (normalizedMessage.includes("concluida") || normalizedMessage.includes("finalizada")) {
      filtered = filtered.filter((o) => normalizeText(o.status).includes("conclu") || normalizeText(o.status).includes("finaliz"));
    }

    if (searchTerms.length > 0) {
      filtered = filtered.filter((o) => {
        const base = normalizeText(`${o.titulo} ${o.descricao} ${o.equipamento} ${o.setor}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const topOrdens = filtered.slice(0, 20);
    const totalOrdens = ordens.length;
    const totalFiltrado = filtered.length;

    const contextoOrdens = topOrdens
      .map((o, i) =>
        `${i + 1}. Título: ${o.titulo} | Equipamento: ${o.equipamento} | Setor: ${o.setor} | Status: ${o.status} | Prioridade: ${o.prioridade} | Abertura: ${o.dataAbertura} | Conclusão: ${o.dataConclusao || "não concluída"}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO ORDENS DE SERVIÇO ===\nTotal de ordens no sistema: ${totalOrdens}\nOrdens encontradas na busca: ${totalFiltrado}\nExibindo as primeiras ${topOrdens.length} registros:\n${contextoOrdens}`;
  } catch (error) {
    console.error("Erro ao buscar ordens:", error);
    return "\n\n=== COLEÇÃO ORDENS DE SERVIÇO ===\nErro ao acessar dados de ordens de serviço.";
  }
};

// Buscar dados de unidades
const fetchUnidadesContext = async (message: string): Promise<string> => {
  try {
    const unidadesSnapshot = await getDocs(collection(db, "unidades"));
    const unidades = unidadesSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        nome: data.nome || "",
        codigo: data.codigo || "",
        endereco: data.endereco || "",
        responsavel: data.responsavel || "",
        telefone: data.telefone || "",
      } as UnidadeChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...unidades];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((u) => {
        const base = normalizeText(`${u.nome} ${u.codigo} ${u.endereco} ${u.responsavel}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const contextoUnidades = filtered
      .map((u, i) =>
        `${i + 1}. Nome: ${u.nome} | Código: ${u.codigo} | Endereço: ${u.endereco} | Responsável: ${u.responsavel} | Telefone: ${u.telefone}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO UNIDADES ===\nTotal de unidades no sistema: ${unidades.length}\nUnidades encontradas: ${filtered.length}\n${contextoUnidades}`;
  } catch (error) {
    console.error("Erro ao buscar unidades:", error);
    return "\n\n=== COLEÇÃO UNIDADES ===\nErro ao acessar dados de unidades.";
  }
};

// Buscar dados de setores
const fetchSetoresContext = async (message: string): Promise<string> => {
  try {
    const setoresSnapshot = await getDocs(collection(db, "setores"));
    const setores = setoresSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        nome: data.nome || "",
        descricao: data.descricao || "",
        responsavel: data.responsavel || "",
        unidade: data.unidade || "",
      } as SetorChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...setores];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((s) => {
        const base = normalizeText(`${s.nome} ${s.descricao} ${s.responsavel} ${s.unidade}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const contextoSetores = filtered
      .map((s, i) =>
        `${i + 1}. Nome: ${s.nome} | Descrição: ${s.descricao} | Responsável: ${s.responsavel} | Unidade: ${s.unidade}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO SETORES ===\nTotal de setores no sistema: ${setores.length}\nSetores encontrados: ${filtered.length}\n${contextoSetores}`;
  } catch (error) {
    console.error("Erro ao buscar setores:", error);
    return "\n\n=== COLEÇÃO SETORES ===\nErro ao acessar dados de setores.";
  }
};

// Buscar dados de centros de custo
const fetchCentrosCustoContext = async (message: string): Promise<string> => {
  try {
    const centrosSnapshot = await getDocs(collection(db, "centros_de_custo"));
    const centros = centrosSnapshot.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        nome: data.nome || "",
        codigo: data.codigo || "",
        descricao: data.descricao || "",
      } as CentroCustoChatData;
    });

    const searchTerms = extractSearchTerms(message);
    let filtered = [...centros];

    if (searchTerms.length > 0) {
      filtered = filtered.filter((c) => {
        const base = normalizeText(`${c.nome} ${c.codigo} ${c.descricao}`);
        return searchTerms.some((term) => base.includes(term));
      });
    }

    const contextoCentros = filtered
      .map((c, i) =>
        `${i + 1}. Nome: ${c.nome} | Código: ${c.codigo} | Descrição: ${c.descricao}`
      )
      .join("\n");

    return `\n\n=== COLEÇÃO CENTROS DE CUSTO ===\nTotal de centros de custo: ${centros.length}\nCentros encontrados: ${filtered.length}\n${contextoCentros}`;
  } catch (error) {
    console.error("Erro ao buscar centros de custo:", error);
    return "\n\n=== COLEÇÃO CENTROS DE CUSTO ===\nErro ao acessar dados de centros de custo.";
  }
};

// Função principal que busca contexto de todas as coleções relevantes
const fetchDatabaseContext = async (message: string): Promise<DatabaseContextResult> => {
  const collections = detectRelevantCollections(message);
  
  if (collections.length === 0) {
    return {
      hasRelevantData: false,
      context: "",
      fallbackAnswer: "",
    };
  }

  let fullContext = "\n\n=== DADOS DO SISTEMA APEX HUB ===\nAbaixo estão os dados das coleções relevantes para responder à pergunta do usuário:\n";
  
  const contextPromises: Promise<string>[] = [];

  for (const col of collections) {
    switch (col) {
      case "produtos":
        contextPromises.push(fetchProdutosContext(message));
        break;
      case "fornecedores":
        contextPromises.push(fetchFornecedoresContext(message));
        break;
      case "equipamentos":
        contextPromises.push(fetchEquipamentosContext(message));
        break;
      case "manutentores":
        contextPromises.push(fetchManutentoresContext(message));
        break;
      case "manuais":
        contextPromises.push(fetchManuaisContext(message));
        break;
      case "tarefas_manutencao":
        contextPromises.push(fetchTarefasManutencaoContext(message));
        break;
      case "ordens_servicos":
        contextPromises.push(fetchOrdensServicoContext(message));
        break;
      case "unidades":
        contextPromises.push(fetchUnidadesContext(message));
        break;
      case "setores":
        contextPromises.push(fetchSetoresContext(message));
        break;
      case "centros_de_custo":
        contextPromises.push(fetchCentrosCustoContext(message));
        break;
    }
  }

  const results = await Promise.all(contextPromises);
  fullContext += results.join("");

  fullContext += "\n\n=== INSTRUÇÕES PARA RESPOSTA ===\nUse APENAS os dados acima para responder à pergunta do usuário. Se o dado solicitado não estiver presente, informe que não foi encontrado. Formate a resposta de forma clara e organizada. Se for solicitado um relatório, organize os dados em formato tabular ou lista estruturada.";

  return {
    hasRelevantData: true,
    context: fullContext,
    fallbackAnswer: "Encontrei dados relevantes no sistema. Por favor, veja os detalhes acima.",
  };
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

// Configuração da API do Groq
const GROQ_CONFIG = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "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",
  model: "llama-3.3-70b-versatile",
};

// Componente para renderizar Markdown básico
const SimpleMarkdown = ({ content }: { content: string }) => {
  const processMarkdown = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;
    
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
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
      
      if (firstMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, firstMatch.index)}</span>);
      }
      
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
      content: `Olá! Eu sou o **APEX Chat**, seu assistente virtual com acesso completo aos dados do sistema.

Posso ajudá-lo com informações sobre:
- **Produtos**: estoque, preços, fornecedores, vencimentos
- **Fornecedores**: CNPJ, contatos, condições de pagamento
- **Equipamentos/Máquinas**: patrimônio, setores, status
- **Manutentores**: equipe técnica, contatos
- **Tarefas de Manutenção**: agendamentos, frequências
- **Ordens de Serviço**: abertas, pendentes, concluídas
- **Manuais**: documentação técnica
- **E muito mais!**

Como posso ajudá-lo hoje?`,
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

      history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const recentHistory = history.slice(-50);

      if (recentHistory.length > 0) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Olá! Eu sou o **APEX Chat**, seu assistente virtual com acesso completo aos dados do sistema. Como posso ajudá-lo hoje?`,
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
    
    const userMessage: Message = {
      id: "user-" + Date.now(),
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    
    let databaseContext: DatabaseContextResult = { hasRelevantData: false, context: "", fallbackAnswer: "" };

    try {
      // 1. Salvar mensagem do usuário no Firebase
      await addDoc(collection(db, "chat_messages"), {
        userId: user.uid,
        role: "user",
        content: userContent,
        createdAt: serverTimestamp(),
      });

      // 2. Buscar contexto de todas as coleções relevantes
      databaseContext = await fetchDatabaseContext(userContent);

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

Você é o APEX Chat, um assistente virtual do sistema APEX HUB com ACESSO TOTAL aos dados do sistema.
Você tem acesso às seguintes coleções do banco de dados:
- produtos: informações de estoque, preços, fornecedores, vencimentos
- fornecedores: razão social, CNPJ, contatos, condições de pagamento, endereços
- equipamentos: máquinas, patrimônio, setores, tags, status
- manutentores: técnicos de manutenção, contatos, setores
- manuais: documentação técnica, instruções
- tarefas_manutencao: tarefas preventivas, agendamentos
- ordens_servicos: ordens de serviço abertas e concluídas
- unidades: filiais, endereços
- setores: departamentos
- centros_de_custo: gestão financeira

Diretrizes:
- SEMPRE use os dados fornecidos no contexto para responder
- Se perguntarem sobre quantidades, valores ou dados específicos, consulte os dados fornecidos
- Formate respostas de forma clara e organizada
- Para relatórios, use listas ou formato tabular
- Seja preciso e cite os dados exatos encontrados
- Se não encontrar o dado solicitado, informe claramente
- Responda sempre em português do Brasil`;

      // 5. Preparar as mensagens para a API Groq
      const fullSystemPrompt = databaseContext.hasRelevantData 
        ? `${systemPrompt}${databaseContext.context}`
        : systemPrompt;

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

      // Mensagem de erro amigável
      let errorMessageText = "Desculpe, houve um erro ao processar sua mensagem. ";
      
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes("sem conexao") || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          errorMessageText += "Você está offline. Verifique sua conexão com a internet.";
        } else if (error.message.includes("API") || error.message.includes("401")) {
          errorMessageText += "Problema com o serviço de IA. Tente novamente.";
        } else if (error.message.includes("fetch") || error.message.toLowerCase().includes("network") || error.message.toLowerCase().includes("abort")) {
          errorMessageText += "Não foi possível conectar ao serviço. Verifique sua conexão com a internet.";
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
                    Consultando dados do sistema...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Pergunte sobre produtos, fornecedores, equipamentos..."
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
