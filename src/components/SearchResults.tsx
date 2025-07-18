import { SourceCard } from "./SourceCard";
import { Card } from "@/components/ui/card";
import { AlertCircle, BookOpen, Star } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  content: string;
  author?: string;
  publishDate?: string;
  source?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  recommendedArticle?: {
    index: number;
    reason: string;
  } | null;
}

export const SearchResults = ({ results, query, recommendedArticle }: SearchResultsProps) => {
  if (results.length === 0) {
    return null; // Don't show anything when no results found
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-primary-muted/20 border-primary/20">
        <div className="flex items-center mb-2">
          <BookOpen className="h-5 w-5 text-primary mr-2" />
          <h2 className="text-xl font-semibold text-foreground">
            Sources for: "{query}"
          </h2>
        </div>
        <p className="text-muted-foreground">
          Found {results.length} academic and news sources. Click "Cut This Card" to create debate-ready evidence.
        </p>
      </Card>

      {/* AI Recommendation */}
      {recommendedArticle && (
        <Card className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                🤖 AI Recommendation
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                <strong>Best article:</strong> Article #{recommendedArticle.index + 1}
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                {recommendedArticle.reason}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6">
        {results.map((result, index) => (
          <div key={index} className="relative">
            {/* Highlight recommended article */}
            {recommendedArticle && recommendedArticle.index === index && (
              <div className="absolute -top-2 -left-2 z-10">
                <div className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                  AI Recommended
                </div>
              </div>
            )}
            
            <SourceCard
              title={result.title}
              url={result.url}
              content={result.content}
              author={result.author}
              publishDate={result.publishDate}
              source={result.source}
              query={query}
            />
          </div>
        ))}
      </div>
    </div>
  );
};