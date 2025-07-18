// This is a Deno Edge Function - TypeScript errors are expected in Node.js environment
// The function will work correctly when deployed to Supabase

const searchSourcesCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NewsAPIArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  author: string;
  source: {
    name: string;
    id: string;
  };
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
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
       Content: ${article.content.substring(0, 300)}...`
    ).join('\n\n');

    const prompt = `You are an expert debate researcher. Analyze the following articles and recommend the BEST ONE for supporting this argument: "${argument}"

ARTICLES TO ANALYZE:
${articlesSummary}

INSTRUCTIONS:
1. Consider relevance to the argument
2. Consider credibility of the source
3. Consider recency of the article
4. Consider quality and depth of content
5. Consider author expertise

Return your response in this exact JSON format:
{
  "recommendedIndex": [number 1-${articles.length}],
  "reason": "Brief explanation of why this article is the best choice for the argument"
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
            content: 'You are an expert debate researcher. Always respond with valid JSON containing recommendedIndex and reason fields.'
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
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

// Function to create optimized search queries
function createSearchQueries(argument: string): string[] {
  const keyTerms = extractKeyTerms(argument);
  
  // Strategy 1: Use the original argument (for broad context)
  const queries = [argument];
  
  // Strategy 2: Use key terms in quotes for exact matches
  if (keyTerms.length >= 2) {
    const quotedTerms = keyTerms.slice(0, 4).map(term => `"${term}"`).join(' ');
    queries.push(quotedTerms);
  }
  
  // Strategy 3: Use the most important terms (first 3-4)
  if (keyTerms.length >= 3) {
    const importantTerms = keyTerms.slice(0, 4).join(' ');
    queries.push(importantTerms);
  }
  
  // Strategy 4: Add "study" or "research" for academic sources
  if (keyTerms.length >= 2) {
    const academicQuery = `${keyTerms.slice(0, 3).join(' ')} study research`;
    queries.push(academicQuery);
  }
  
  return queries;
}

// Function to extract article content from HTML (fallback)
function extractArticleContent(html: string): string {
  try {
    // Remove script and style tags
    let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML tags but keep text content
    content = content.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // Extract text from common article containers
    const articleSelectors = [
      'article',
      '[class*="article"]',
      '[class*="content"]',
      '[class*="post"]',
      '[class*="story"]',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.story-content'
    ];
    
    // If we can't find specific selectors, return the cleaned content
    return content.substring(0, 2000); // Limit to first 2000 characters
  } catch (error) {
    console.error('Error extracting content:', error);
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
      return '';
    }

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
        waitFor: 3000, // Wait longer for dynamic content to load
        timeout: 30000, // 30 second timeout for full article loading
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl API error: ${response.status} ${response.statusText}`);
      return '';
    }

    const data: FirecrawlResponse = await response.json();
    
    if (!data.success) {
      console.error('Firecrawl scraping failed:', data.error);
      return '';
    }

    // Use the extracted text content - get the full article
    const fullContent = data.data.text || data.data.content || '';
    console.log(`Firecrawl scraped ${fullContent.length} characters from ${url}`);
    
    return fullContent;
  } catch (error) {
    console.error(`Error with Firecrawl for ${url}:`, error);
    return '';
  }
}

// Function to scrape article content (fallback method)
async function scrapeArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return '';
    }
    
    const html = await response.text();
    return extractArticleContent(html);
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return '';
  }
}

// Function to search with a specific query
async function searchWithQuery(query: string, newsApiKey: string): Promise<TransformedResult[]> {
  const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=relevancy&pageSize=5&apiKey=${newsApiKey}`;
  
  const response = await fetch(newsApiUrl);
  
  if (!response.ok) {
    console.error(`NewsAPI error for query "${query}":`, response.status, response.statusText);
    return [];
  }

  const data: NewsAPIResponse = await response.json();
  console.log(`Query "${query}" found ${data.totalResults} articles`);

  const transformedResults: TransformedResult[] = [];
  
  for (const article of data.articles) {
    // Start with the description from NewsAPI
    let content = article.description || article.content || 'No content available';
    
    // Try to scrape full content if we have a URL
    if (article.url) {
      console.log(`Scraping content from: ${article.url}`);
      
      // Try Firecrawl first, then fallback to manual scraping
      let scrapedContent = await scrapeWithFirecrawl(article.url);
      
      if (!scrapedContent) {
        console.log('Firecrawl failed, trying manual scraping');
        scrapedContent = await scrapeArticleContent(article.url);
      }
      
      // Use scraped content if it's longer than the description (prefer full articles)
      if (scrapedContent && scrapedContent.length > content.length * 0.5) {
        content = scrapedContent;
        console.log(`Using full scraped content (${scrapedContent.length} chars) for ${article.url}`);
      } else {
        console.log(`Using NewsAPI content (${content.length} chars) for ${article.url}`);
      }
    }
    
    transformedResults.push({
      title: article.title,
      url: article.url,
      content: content, // Pass full content without truncation
      author: article.author,
      publishDate: new Date(article.publishedAt).getFullYear().toString(),
      source: article.source.name
    });
  }

  return transformedResults;
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
    const newsApiKey = Deno.env.get('NEWS_API_KEY');
    
    if (!newsApiKey) {
      console.error('NewsAPI key not found');
      return new Response(
        JSON.stringify({ error: 'NewsAPI key not configured' }),
        { 
          status: 500, 
          headers: { ...searchSourcesCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Searching for sources with argument:', query);

    // Create multiple search strategies
    const searchQueries = createSearchQueries(query);
    console.log('Search queries:', searchQueries);

    // Search with multiple strategies and combine results
    const allResults: TransformedResult[] = [];
    const seenUrls = new Set<string>();

    for (const searchQuery of searchQueries) {
      const results = await searchWithQuery(searchQuery, newsApiKey);
      
      // Add unique results only
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
    }

    // Sort by relevance (articles with more key terms in title/description first)
    const keyTerms = extractKeyTerms(query);
    allResults.sort((a, b) => {
      const aScore = keyTerms.filter(term => 
        a.title.toLowerCase().includes(term) || 
        a.content.toLowerCase().includes(term)
      ).length;
      const bScore = keyTerms.filter(term => 
        b.title.toLowerCase().includes(term) || 
        b.content.toLowerCase().includes(term)
      ).length;
      return bScore - aScore;
    });

    // Return top 10 most relevant results
    const finalResults = allResults.slice(0, 10);

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