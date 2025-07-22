import { useState } from "react";
import { ArgumentInput } from "@/components/ArgumentInput";
import { SearchResults } from "@/components/SearchResults";
import { SearchProgress } from "@/components/SearchProgress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  title: string;
  url: string;
  content: string;
  author?: string;
  publishDate?: string;
  source?: string;
}

interface SearchResponse {
  results: SearchResult[];
  recommendedArticle?: {
    index: number;
    reason: string;
  } | null;
}

const Index = () => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [recommendedArticle, setRecommendedArticle] = useState<{ index: number; reason: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const { toast } = useToast();

  const handleSearch = async (argument: string) => {
    setIsLoading(true);
    setCurrentQuery(argument);
    setSearchResults([]);
    setRecommendedArticle(null);

    try {
      toast({
        title: "Searching for sources",
        description: "Finding news sources for your argument...",
      });

      // Call the edge function to search for real sources
      const { data, error } = await supabase.functions.invoke('search-sources', {
        body: { query: argument }
      });

      if (error) {
        console.error('Error calling search function:', error);
        throw error;
      }

      const response: SearchResponse = data;
      setSearchResults(response.results || []);
      setRecommendedArticle(response.recommendedArticle || null);
      setIsLoading(false);
      
      let description = `Found ${response.results?.length || 0} news sources for your argument`;
      if (response.recommendedArticle) {
        description += " - AI has recommended the best article!";
      }
      
      toast({
        title: "Sources found",
        description: description,
      });
    } catch (error) {
      setIsLoading(false);
      console.error('Search error:', error);
      toast({
        title: "Search failed",
        description: "Unable to find sources. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <ArgumentInput onSearch={handleSearch} isLoading={isLoading} />
        
        {isLoading && currentQuery && (
          <div className="mt-8">
            <SearchProgress isVisible={isLoading} query={currentQuery} />
          </div>
        )}
        
        {(searchResults.length > 0 || currentQuery) && !isLoading && (
          <div className="mt-8">
            <SearchResults 
              results={searchResults} 
              query={currentQuery} 
              recommendedArticle={recommendedArticle}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
