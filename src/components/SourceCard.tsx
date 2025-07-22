import React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Scissors, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SourceCardProps {
  title: string;
  url: string;
  content: string;
  author?: string;
  publishDate?: string;
  source?: string;
  query?: string;
}

export const SourceCard = ({ 
  title, 
  url, 
  content, 
  author, 
  publishDate, 
  source,
  query 
}: SourceCardProps) => {
  const [isCut, setIsCut] = useState(false);
  const [cutContent, setCutContent] = useState("");
  const [cardSummary, setCardSummary] = useState("");
  const [cardCitation, setCardCitation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  const handleCutCard = async () => {
    if (!query) {
      toast({
        title: "Error",
        description: "No argument provided for cutting",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cut-card', {
        body: { 
          content, 
          title, 
          argument: query,
          author,
          publishDate,
          url
        }
      });

      if (error) {
        console.error('Error cutting card:', error);
        throw error;
      }

      setCutContent(data.cutContent);
      setCardSummary(data.tag);
      setCardCitation(data.citation);
      setIsCut(true);
      
      toast({
        title: "Card cut successfully",
        description: "Your debate card is ready!",
      });
    } catch (error) {
      console.error('Cut card error:', error);
      toast({
        title: "Failed to cut card",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCard = async () => {
    if (!isCut) return;

    try {
      // Format citation for rich text: bold author/year, small rest
      const citationMatch = cardCitation.match(/^(\S+ \d{2,4})(.*)$/);
      const richCitation = citationMatch
        ? `<span style="font-weight:bold;">${citationMatch[1]}</span><span style="font-size:0.9em;">${citationMatch[2]}</span>`
        : cardCitation;
      // Create plain text version
      const plainText = `
${cardCitation}

TAG: ${cardSummary}

${cutContent.replace(/<mark class="highlight">/g, '').replace(/<\/mark>/g, '').replace(/<span class="cut">/g, '').replace(/<\/span>/g, '')}
      `.trim();

      // Create rich text version with formatting for Google Docs
      const richText = cutContent
        .replace(/<mark class="highlight">/g, '<span style="background-color: yellow;">')
        .replace(/<\/mark>/g, '</span>')
        .replace(/<span class="cut">/g, '<span style="font-size: 0.9em;">')
        .replace(/<\/span>/g, '</span>');

      const formattedCard = `
${richCitation}<br><br>TAG: ${cardSummary}<br><br>${richText}
      `.trim();

      // Try to use rich text clipboard first
      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          // Create a blob with HTML content
          const htmlBlob = new Blob([formattedCard], { type: 'text/html' });
          const textBlob = new Blob([plainText], { type: 'text/plain' });
          
          // Create clipboard item with both formats
          const clipboardItem = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          });
          
          await navigator.clipboard.write([clipboardItem]);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
          
          toast({
            title: "Card copied with formatting!",
            description: "Ready to paste into Google Docs with highlights",
          });
          return;
        } catch (richTextError) {
          console.log('Rich text copy failed, falling back to plain text:', richTextError);
        }
      }

      // Fallback to plain text
      await navigator.clipboard.writeText(plainText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      
      toast({
        title: "Card copied!",
        description: "Ready to paste into Google Docs",
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast({
        title: "Copy failed",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-border bg-card hover:shadow-lg transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-lg leading-tight text-foreground">
            {title}
          </CardTitle>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(url, '_blank')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-2">
          {author && (
            <Badge variant="secondary" className="text-xs">
              {author}
            </Badge>
          )}
          {source && (
            <Badge variant="outline" className="text-xs">
              {source}
            </Badge>
          )}
          {publishDate && (
            <Badge variant="outline" className="text-xs">
              {publishDate}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isCut ? (
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {content}
            </p>
            
            <div className="flex gap-2 mt-4">
              <Button 
                onClick={handleCutCard}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Scissors className="h-4 w-4" />
                {isLoading ? "Cutting..." : "Cut This Card"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tag Display */}
            {cardSummary && (
              <div className="mb-2">
                <span className="block font-bold text-lg text-foreground">{cardSummary}</span>
              </div>
            )}
            {/* Citation Display */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Citation:</p>
              {(() => {
                // Try to match 'AuthorLastName Year' at the start of the citation
                const match = cardCitation.match(/^(\S+ \d{4})(.*)$/);
                if (match) {
                  return (
                    <span className="text-blue-600 dark:text-blue-400 font-mono">
                      <span className="font-bold">{match[1]}</span>
                      <span className="text-xs ml-1 align-middle">{match[2]}</span>
                    </span>
                  );
                } else {
                  return <span className="text-blue-600 dark:text-blue-400 font-mono">{cardCitation}</span>;
                }
              })()}
            </div>
            {/* Card Content */}
            <div
              className="text-sm leading-relaxed debate-card-content p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border"
              dangerouslySetInnerHTML={{ __html: wrapNonHighlightedWithSmall(cutContent) }}
            />
            
            <div className="flex gap-2">
              <Button 
                onClick={handleCopyCard}
                variant="default"
                className="flex items-center gap-2"
              >
                {isCopied ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Card
                  </>
                )}
              </Button>
              <Button 
                onClick={() => setIsCut(false)}
                variant="outline"
                size="sm"
              >
                View Original
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function wrapNonHighlightedWithSmall(html) {
  // Replace all <mark class="highlight">...</mark> with a placeholder
  const HIGHLIGHT_PLACEHOLDER = '___HIGHLIGHT___';
  let highlights = [];
  let temp = html;
  temp = temp.replace(/<mark class="highlight">([\s\S]*?)<\/mark>/g, (match, p1) => {
    highlights.push(p1);
    return HIGHLIGHT_PLACEHOLDER;
  });
  // Now wrap everything else in <span style="font-size:0.9em">...</span>
  temp = `<span style="font-size:0.9em">${temp}</span>`;
  // Restore highlights
  let i = 0;
  temp = temp.replace(new RegExp(HIGHLIGHT_PLACEHOLDER, 'g'), () => `<mark class="highlight">${highlights[i++]}</mark>`);
  return { __html: temp };
}