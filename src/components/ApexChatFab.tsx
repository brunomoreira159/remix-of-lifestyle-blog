import { Bot } from "lucide-react";
import ApexChatModal from "./ApexChatModal";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ApexChatFab = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  // Não exibe se não estiver autenticado ou se estiver na página inicial (login)
  if (!user || location.pathname === "/") {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-full w-14 h-14 md:w-16 md:h-16 shadow-lg hover:shadow-xl transition-all duration-300 animate-in slide-in-from-bottom-4 flex items-center justify-center p-0"
        aria-label="Abrir APEX Chat"
      >
        <Bot className="w-10 h-10 md:w-15 md:h-15" />
      </Button>
      <ApexChatModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default ApexChatFab;
