import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, BookOpen } from "lucide-react";

interface ArgumentInputProps {
  onSearch: (argument: string) => void;
  isLoading: boolean;
}

export const ArgumentInput = ({ onSearch, isLoading }: ArgumentInputProps) => {
  const [argument, setArgument] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (argument.trim()) {
      onSearch(argument.trim());
    }
  };

  return (
    <Card className="p-8 bg-card border-border">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center mb-4">
          <BookOpen className="h-8 w-8 text-primary mr-3" />
          <h1 className="text-3xl font-bold text-foreground">AI Debate Card Generator</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Enter your argument and we'll find academic sources to support your position
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Input
            type="text"
            placeholder="Enter the argument you want to prove (e.g., 'Climate change requires immediate government intervention')"
            value={argument}
            onChange={(e) => setArgument(e.target.value)}
            className="text-lg py-6 pr-12 border-border focus:ring-primary"
            disabled={isLoading}
          />
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        </div>
        
        <Button
          type="submit"
          disabled={!argument.trim() || isLoading}
          className="w-full py-6 text-lg font-semibold bg-primary hover:bg-primary/90"
        >
          {isLoading ? "Searching for Sources..." : "Generate Debate Cards"}
        </Button>
      </form>
    </Card>
  );
};