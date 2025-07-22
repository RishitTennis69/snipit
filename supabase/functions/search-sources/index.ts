// This is a Deno Edge Function - TypeScript errors are expected in Node.js environment
// The function will work correctly when deployed to Supabase

const searchSourcesCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  formattedUrl: string;
  pagemap?: {
    metatags?: Array<{
      'og:title'?: string;
      'og:description'?: string;
      'article:author'?: string;
      'article:published_time'?: string;
    }>;
    newsarticle?: Array<{
      headline?: string;
      author?: string;
      datepublished?: string;
    }>;
    article?: Array<{
      headline?: string;
      author?: string;
      datepublished?: string;
    }>;
  };
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  searchInformation?: {
    totalResults: string;
  };
}

interface TransformedResult {
  title: string;
  url: string;
  content: string;
  author?: string;
  publishDate?: string;
  source?: string;
}

interface FirecrawlResponse {
  success: boolean;
  data: {
    content: string;
    markdown: string;
    html: string;
    text: string;
  };
  error?: string;
}

interface SearchResponse {
  results: TransformedResult[];
  recommendedArticle?: {
    index: number;
    reason: string;
  } | null;
}

// Function to get OpenAI recommendation for best article
async function getOpenAIRecommendation(articles: TransformedResult[], argument: string): Promise<{ index: number; reason: string } | null> {
  try {
    // @ts-ignore - Deno environment
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      console.log('OpenAI API key not found, skipping recommendation');
      return null;
    }

    // Create a summary of articles for analysis
    const articlesSummary = articles.map((article, index) => 
      `${index + 1}. "${article.title}" by ${article.author || 'Unknown'} (${article.source || 'Unknown'})
       Content: ${article.content.substring(0, 400)}...`
    ).join('\n\n');

    const prompt = `You are an expert debate researcher. Analyze the following articles and recommend the BEST ONE for supporting this argument: "${argument}"

ARTICLES TO ANALYZE:
${articlesSummary}

INSTRUCTIONS:
1. Consider relevance to the argument (most important)
2. Consider credibility of the source (academic, reputable news, expert author)
3. Consider recency of the article (prefer recent but quality over recency)
4. Consider quality and depth of content (substantial evidence, data, expert quotes)
5. Consider author expertise and credentials
6. Consider whether the article provides strong evidence for the argument

Return your response in this exact JSON format:
{
  "recommendedIndex": [number 1-${articles.length}],
  "reason": "Detailed explanation of why this article is the best choice, including specific evidence it provides for the argument"
}

Only return the JSON, no other text.`;

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
            content: 'You are an expert debate researcher. Always respond with valid JSON containing recommendedIndex and reason fields. Provide detailed, specific reasoning for your recommendation.'
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI recommendation API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    try {
      const result = JSON.parse(aiResponse);
      if (result.recommendedIndex && result.reason) {
        // Convert to 0-based index
        const index = result.recommendedIndex - 1;
        if (index >= 0 && index < articles.length) {
          return { index, reason: result.reason };
        }
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI recommendation:', parseError);
    }

    return null;
  } catch (error) {
    console.error('Error getting OpenAI recommendation:', error);
    return null;
  }
}

// Function to score article relevance using OpenAI
async function scoreArticleRelevance(article: TransformedResult, argument: string): Promise<number> {
  try {
    // @ts-ignore - Deno environment
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      // Fallback to simple keyword matching
      const keyTerms = extractKeyTerms(argument);
      const score = keyTerms.filter(term => 
        article.title.toLowerCase().includes(term) || 
        article.content.toLowerCase().includes(term)
      ).length;
      return score;
    }

    const prompt = `Rate the relevance of this article to the argument on a scale of 1-10 (10 being most relevant):

ARGUMENT: "${argument}"

ARTICLE TITLE: "${article.title}"
ARTICLE CONTENT: "${article.content.substring(0, 500)}..."

Consider:
- How directly does this article support the argument?
- Does it provide strong evidence, data, or expert opinions?
- Is the source credible and authoritative?
- Is the content substantial and well-researched?

Return only a number between 1-10.`;

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
            content: 'You are an expert debate researcher. Rate article relevance on a scale of 1-10. Return only the number.'
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI scoring API error:', response.status, response.statusText);
      return 5; // Default score
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content.trim();
    
    const score = parseInt(aiResponse);
    if (!isNaN(score) && score >= 1 && score <= 10) {
      return score;
    }

    return 5; // Default score if parsing fails
  } catch (error) {
    console.error('Error scoring article relevance:', error);
    return 5; // Default score
  }
}

// Function to extract key terms from the argument
function extractKeyTerms(argument: string): string[] {
  // Remove common debate words and focus on key concepts
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'should', 'would',
    'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'hers', 'i', 'me', 'my', 'mine'
  ]);

  // Extract meaningful terms (3+ characters, not stop words)
  const words = argument.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopWords.has(word));

  // Remove duplicates and return unique key terms
  return [...new Set(words)];
}

// Function to extract article content from HTML (fallback)
function extractArticleContent(html: string): string {
  try {
    // Remove script and style tags
    let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    
    // Try to find article content in common containers
    const articleSelectors = [
      'article',
      '[class*="article"]',
      '[class*="content"]',
      '[class*="post"]',
      '[class*="story"]',
      '[class*="entry"]',
      '.post-content',
      '.article-content',
      '.story-content',
      '.entry-content',
      '#content',
      '#main-content',
      '.main-content',
      '.content-body',
      '.article-body',
      '.post-body'
    ];
    
    let extractedContent = '';
    
    // Try to find content in article-specific containers first
    for (const selector of articleSelectors) {
      const matches = content.match(new RegExp(`<[^>]*class="[^"]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'gi'));
      if (matches && matches.length > 0) {
        extractedContent = matches.join(' ');
        break;
      }
    }
    
    // If no article content found, try to extract from body
    if (!extractedContent) {
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        extractedContent = bodyMatch[1];
      } else {
        extractedContent = content;
      }
    }
    
    // Remove HTML tags but keep text content
    extractedContent = extractedContent.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace and normalize
    extractedContent = extractedContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    // Remove common non-content elements
    extractedContent = extractedContent
      .replace(/cookie|privacy|terms|subscribe|newsletter|advertisement|sponsored/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit content length to reasonable size
    if (extractedContent.length > 10000) {
      extractedContent = extractedContent.substring(0, 10000) + '...';
    }
    
    return extractedContent;
  } catch (error) {
    console.error('Error extracting content from HTML:', error);
    return '';
  }
}

// Function to scrape article content using Firecrawl
async function scrapeWithFirecrawl(url: string): Promise<string> {
  try {
    // @ts-ignore - Deno environment
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.log('Firecrawl API key not found, falling back to manual scraping');
      return await scrapeArticleContent(url);
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      console.error(`Invalid URL format: ${url}`);
      return await scrapeArticleContent(url);
    }

    console.log(`Attempting to scrape with Firecrawl: ${url}`);

    const response = await fetch('https://api.firecrawl.dev/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        pageOptions: {
          onlyMainContent: true,
          includeHtml: false,
          includeMarkdown: false,
          includeImages: false,
          includeLinks: false,
        },
        waitFor: 3000,
        timeout: 30000,
      }),
    });

    console.log(`Firecrawl response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`Firecrawl API error: ${response.status} ${response.statusText}`);
      try {
        const errorBody = await response.text();
        console.error('Firecrawl error response body:', errorBody);
      } catch (e) {
        // Ignore
      }
      console.log('Falling back to manual scraping...');
      return await scrapeArticleContent(url);
    }

    const data: FirecrawlResponse = await response.json();
    
    if (!data.success) {
      console.error('Firecrawl scraping failed:', data.error);
      console.error('Full Firecrawl response:', JSON.stringify(data, null, 2));
      console.log('Falling back to manual scraping...');
      return await scrapeArticleContent(url);
    }

    // Use the extracted text content - get the full article
    const fullContent = data.data.text || data.data.content || '';
    console.log(`Firecrawl scraped ${fullContent.length} characters from ${url}`);
    
    if (fullContent.length < 100) {
      console.log('Firecrawl returned minimal content, falling back to manual scraping...');
      return await scrapeArticleContent(url);
    }
    
    return fullContent;
  } catch (error) {
    console.error(`Error with Firecrawl for ${url}:`, error);
    console.log('Falling back to manual scraping...');
    return await scrapeArticleContent(url);
  }
}

// Function to scrape article content (fallback method)
async function scrapeArticleContent(url: string): Promise<string> {
  try {
    console.log(`Manual scraping: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return '';
    }
    
    const html = await response.text();
    const extractedContent = extractArticleContent(html);
    
    console.log(`Manual scraping extracted ${extractedContent.length} characters from ${url}`);
    return extractedContent;
  } catch (error) {
    console.error(`Error manually scraping ${url}:`, error);
    return '';
  }
}

// Function to search for articles using Google Custom Search
async function searchWithGoogle(argument: string): Promise<TransformedResult[]> {
  try {
    // @ts-ignore - Deno environment
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    // @ts-ignore - Deno environment
    const googleSearchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    
    if (!googleApiKey || !googleSearchEngineId) {
      console.error('Google API key or Search Engine ID not found');
      return [];
    }

    // Build search query - start simple to avoid 400 errors
    const query = `${argument} news article research -filetype:pdf`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(query)}&num=20`;

    console.log('Starting Google Custom Search with argument:', argument);
    console.log('Using Google API key:', googleApiKey ? 'Present' : 'Missing');
    console.log('Using Search Engine ID:', googleSearchEngineId ? 'Present' : 'Missing');
    console.log('Search URL:', url.replace(googleApiKey, 'API_KEY_HIDDEN'));

    let response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Custom Search API error:', response.status, response.statusText);
      console.error('Error details:', errorText);
      console.error('Google API request URL:', url);
      try {
        const parsed = JSON.parse(errorText);
        if (parsed && parsed.error) {
          console.error('Google API error object:', JSON.stringify(parsed.error, null, 2));
        }
      } catch (e) {
        // Not JSON, skip
      }
      // Try a simpler search as fallback
      console.log('Trying fallback search with simpler query...');
      const fallbackQuery = argument;
      // Exclude PDFs in fallback as well
      const fallbackQueryWithExclusion = `${argument} -filetype:pdf`;
      const fallbackUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(fallbackQueryWithExclusion)}&num=10`;
      
      response = await fetch(fallbackUrl);
      
      if (!response.ok) {
        const fallbackErrorText = await response.text();
        console.error('Fallback search also failed:', response.status, response.statusText);
        console.error('Fallback error details:', fallbackErrorText);
        console.error('Fallback Google API request URL:', fallbackUrl);
        try {
          const parsed = JSON.parse(fallbackErrorText);
          if (parsed && parsed.error) {
            console.error('Fallback Google API error object:', JSON.stringify(parsed.error, null, 2));
          }
        } catch (e) {
          // Not JSON, skip
        }
        return [];
      }
    }

    const data: GoogleSearchResponse = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log('No articles found for Google Custom Search.');
      return [];
    }

    console.log(`Google Custom Search found ${data.items.length} articles`);

    const transformedResults: TransformedResult[] = [];

    for (const item of data.items) {
      if (item.link) {
        // Filter out unwanted sites after getting results
        const unwantedSites = ['medium.com', 'wikipedia.org', 'github.com', 'stackoverflow.com', 'quora.com', 'reddit.com'];
        const isUnwanted = unwantedSites.some(site => item.link.toLowerCase().includes(site));
        
        if (isUnwanted) {
          console.log(`Skipping unwanted site: ${item.link}`);
          continue;
        }

        console.log(`Scraping content from: ${item.link}`);
        
        const scrapedContent = await scrapeWithFirecrawl(item.link);
        
        if (scrapedContent && scrapedContent.length > 100) {
          // Extract metadata from Google's pagemap
          let author = '';
          let publishDate = '';
          let source = '';
          
          if (item.pagemap?.metatags?.[0]) {
            const metatags = item.pagemap.metatags[0];
            author = metatags['article:author'] || '';
            publishDate = metatags['article:published_time'] || '';
          }
          
          if (item.pagemap?.newsarticle?.[0]) {
            const newsArticle = item.pagemap.newsarticle[0];
            author = author || newsArticle.author || '';
            publishDate = publishDate || newsArticle.datepublished || '';
          }
          
          if (item.pagemap?.article?.[0]) {
            const article = item.pagemap.article[0];
            author = author || article.author || '';
            publishDate = publishDate || article.datepublished || '';
          }
          
          // Extract source from displayLink
          source = item.displayLink || '';
          
          // Extract year from publish date
          let year = '';
          if (publishDate) {
            try {
              year = new Date(publishDate).getFullYear().toString();
            } catch (dateError) {
              console.log('Could not parse publish date:', publishDate);
            }
          }

          transformedResults.push({
            title: item.title || 'Unknown Title',
            url: item.link,
            content: scrapedContent,
            author: author,
            publishDate: year,
            source: source
          });
          console.log(`Successfully scraped ${scrapedContent.length} characters from ${item.link}`);
        } else {
          console.log(`Failed to scrape meaningful content from ${item.link}`);
        }
      }
    }
    
    return transformedResults;
  } catch (error) {
    console.error('Error with Google Custom Search:', error);
    return [];
  }
}

// @ts-ignore - Deno environment
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: searchSourcesCorsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // @ts-ignore - Deno environment
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    // @ts-ignore - Deno environment
    const googleSearchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    
    if (!googleApiKey || !googleSearchEngineId) {
      console.error('Google API key or Search Engine ID not found');
      return new Response(
        JSON.stringify({ error: 'Google Custom Search not configured' }),
        { 
          status: 500, 
          headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Searching for sources with argument:', query);

    // Use Google Custom Search to find relevant articles
    const allResults = await searchWithGoogle(query);
    console.log(`Google Custom Search found ${allResults.length} articles`);

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          recommendedArticle: null,
          error: 'No relevant articles found'
        }),
        { 
          headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Sort by relevance using AI-powered scoring
    console.log('Scoring articles for relevance...');
    const scoredResults = await Promise.all(
      allResults.map(async (result) => {
        const score = await scoreArticleRelevance(result, query);
        return { ...result, relevanceScore: score };
      })
    );

    // Sort by AI relevance score (highest first)
    scoredResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Return top 10 most relevant results
    const finalResults = scoredResults.slice(0, 10).map(({ relevanceScore, ...result }) => result);

    console.log(`Found ${finalResults.length} unique relevant articles`);

    // Get OpenAI recommendation for the best article
    const recommendation = await getOpenAIRecommendation(finalResults, query);
    
    const response: SearchResponse = {
      results: finalResults,
      recommendedArticle: recommendation
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in search-sources function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});