// This is a Deno Edge Function - TypeScript errors are expected in Node.js environment
// The function will work correctly when deployed to Supabase

const cutCardCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CutCardRequest {
  content: string;
  title: string;
  argument: string;
  author?: string;
  publishDate?: string;
  url?: string;
}

interface CutCardResponse {
  cutContent: string;
  summary: string;
  citation: string;
}

// @ts-ignore - Deno environment
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cutCardCorsHeaders });
  }

  try {
    const { content, title, argument, author, publishDate, url }: CutCardRequest = await req.json();
    
    if (!content || !argument) {
      return new Response(
        JSON.stringify({ error: 'Content and argument are required' }),
        { 
          status: 400, 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // @ts-ignore - Deno environment
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OpenAI API key not found');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Cutting card for argument:', argument);

    // Extract author last name and year for citation
    let authorLastName = '';
    let year = '';
    
    if (author) {
      const nameParts = author.trim().split(' ');
      authorLastName = nameParts[nameParts.length - 1] || author;
    }
    
    if (publishDate) {
      year = new Date(publishDate).getFullYear().toString();
    }

    const prompt = `You are a professional debate card cutter. Your task is to analyze the given source content and create a debate card by highlighting the most important parts that support the argument: "${argument}"

INSTRUCTIONS:
1. Read the ENTIRE article content carefully
2. Be EXTREMELY SELECTIVE - highlight only the most crucial individual words and short phrases (2-5 words max)
3. Target approximately 10-15% of the original text to be highlighted (much less than before)
4. Focus on:
   - Key statistics and numbers
   - Expert names and credentials
   - Specific dates and facts
   - Critical adjectives and adverbs
   - Important nouns and verbs
5. Avoid highlighting entire sentences - be surgical and precise
6. Maintain logical flow and readability
7. Return the content with HTML markup:
   - Use <mark class="highlight">text</mark> for parts to highlight (keep)
   - Use <span class="cut">text</span> for parts to cut (shrink)
8. Provide a brief summary of what the card proves
9. Create a proper citation in the format shown in the reference image

Source Title: ${title}
Source Author: ${author || 'Unknown'}
Source Date: ${publishDate || 'Unknown'}
Source URL: ${url || 'Unknown'}
Source Content: ${content}

Return your response in this JSON format:
{
  "cutContent": "HTML content with <mark class=\"highlight\"> and <span class=\"cut\"> tags",
  "summary": "Brief summary of what this card proves for the argument",
  "citation": "AuthorLastName Year - Full citation details with URL"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert debate card cutter. Be EXTREMELY selective - highlight only individual words and short phrases (2-5 words max), not entire sentences. Target 10-15% of text for highlighting. Always respond with valid JSON containing cutContent, summary, and citation fields. Format citations like "Platt 25" for author last name and year, followed by full citation details and URL.'
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to process card cutting' }),
        { 
          status: response.status, 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    console.log('AI Response:', aiResponse);

    try {
      const result = JSON.parse(aiResponse);
      
      // Generate fallback citation if AI doesn't provide one
      if (!result.citation) {
        const citation = `${authorLastName} ${year} - ${author || 'Unknown'}, ${publishDate || 'Unknown'}, ${title}, ${url || 'No URL'}`;
        result.citation = citation;
      }
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      
      // Fallback: return a basic response if JSON parsing fails
      const fallbackCitation = `${authorLastName} ${year} - ${author || 'Unknown'}, ${publishDate || 'Unknown'}, ${title}, ${url || 'No URL'}`;
      
      // Create a basic highlighted/cut version as fallback
      const contentLength = content.length;
      const highlightLength = Math.floor(contentLength * 0.12); // 12% instead of 25%
      const fallbackContent = `<mark class="highlight">${content.substring(0, highlightLength)}</mark><span class="cut">${content.substring(highlightLength)}</span>`;
      
      return new Response(
        JSON.stringify({
          cutContent: fallbackContent,
          summary: "This card provides evidence supporting the argument.",
          citation: fallbackCitation
        }),
        { 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Error in cut-card function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});