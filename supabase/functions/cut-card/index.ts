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
    
    console.log('=== CARD CUTTING REQUEST START ===');
    console.log('User argument:', argument);
    console.log('Source title:', title);
    console.log('Source author:', author || 'Unknown');
    console.log('Source date:', publishDate || 'Unknown');
    console.log('Source URL:', url || 'Unknown');
    console.log('Content length:', content ? content.length : 0, 'characters');
    
    if (!content || !argument) {
      console.error('Missing required parameters - content or argument');
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

    console.log('OpenAI API key present:', openAIApiKey ? 'Yes' : 'No');
    console.log('Cutting card for argument:', argument);

    // Extract author last name and year for citation
    let authorLastName = '';
    let year = '';
    
    if (author) {
      const nameParts = author.trim().split(' ');
      authorLastName = nameParts[nameParts.length - 1] || author;
      console.log('Extracted author last name:', authorLastName);
    }
    
    if (publishDate) {
      year = new Date(publishDate).getFullYear().toString();
      console.log('Extracted year:', year);
    }

    const prompt = `You are a professional debate card cutter. Your task is to analyze the given source content and create a debate card by extracting and cutting a passage that supports the user's specific argument: "${argument}"

INSTRUCTIONS:
1. Read the ENTIRE article content carefully
2. FIRST: Extract a 6-14 sentence passage from the article that best supports the user's argument: "${argument}"
3. SECOND: Cut that specific passage down to about 40% of its original length (aim for MORE highlighting, not less)
4. IMPORTANT: Use ONLY the exact words from the original passage. Do not summarize or rephrase.
5. The cut version must make sense as a complete sentence or sentences
6. You can be very selective with individual words - you don't need to keep whole phrases if some words are unnecessary
7. Focus on keeping words and phrases that DIRECTLY support the user's argument: "${argument}"
   - Key statistics and numbers that prove the argument
   - Expert names and credentials that support the argument
   - Specific dates and facts that bolster the argument
   - Critical evidence and claims that validate the argument
   - Main arguments and conclusions that align with the user's argument
   - IMPORTANT: Err on the side of keeping MORE content rather than cutting too much
8. Remove words that:
   - Don't directly support the user's argument: "${argument}"
   - Are redundant or unnecessary for proving the argument
   - Provide context that isn't essential to the argument
   - Are filler words or phrases that don't strengthen the argument
   - Transitional phrases that don't add value to the argument

EXAMPLE PROCESS:
User's argument: "Climate change is causing more extreme weather events"
Original article passage: "At the same time, we are keeping up the pressure on Russia."
Cut version: "We are keeping pressure on Russia."

Notice: "At the same time" and "up the" were removed because they don't add essential meaning.

Another example:
User's argument: "Renewable energy is becoming more cost-effective"
Original: "Furthermore, the study clearly demonstrates that climate change is significantly impacting global weather patterns."
Cut version: "The study demonstrates climate change is impacting weather patterns."

Notice: "Furthermore", "clearly", "significantly", and "global" were removed as they don't add essential evidence for the cost-effectiveness argument.

9. Return the content with HTML markup:
   - Use <mark class="highlight">text</mark> for parts to keep (the cut version that supports the user's argument)
   - Use <span class="cut">text</span> for parts to cut (the removed words that don't support the user's argument)
   - AIM FOR MORE HIGHLIGHTED CONTENT: Try to keep 40% of the original passage, not just 25%
10. Provide a brief, one-sentence TAG (not a summary) that directly states what this card proves for the user's specific argument: "${argument}". The tag should be concise, bold, and in the style of: climate change leads to extinction. Do NOT use more than one sentence. Do NOT use phrases like 'this card proves' or 'evidence for'. Just state the claim directly.
11. Create a proper citation

Source Title: ${title}
Source Author: ${author || 'Unknown'}
Source Date: ${publishDate || 'Unknown'}
Source URL: ${url || 'Unknown'}
Source Content: ${content}

Return your response in this JSON format:
{
  "cutContent": "HTML content with <mark class=\"highlight\"> and <span class=\"cut\"> tags",
  "tag": "One-sentence, bolded tag for what this card proves for the user's argument",
  "citation": "AuthorLastName Year - Full citation details with URL"
}`;

    console.log('Sending request to OpenAI API...');
    console.log('OpenAI model: gpt-4.1-2025-04-14');
    console.log('Temperature: 0.3');
    console.log('Max tokens: 2000');

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
            content: 'You are an expert debate card cutter. Follow this two-step process: 1) Extract a 6-14 sentence passage from the article that best supports the user\'s specific argument, 2) Cut that passage down to 40% using ONLY the original words (no summarization). Be selective but err on the side of keeping MORE content rather than cutting too much. Focus on highlighting content that DIRECTLY supports the user\'s argument. Always respond with valid JSON containing cutContent, summary, and citation fields. Format citations like "Platt 25" for author last name and year, followed by full citation details and URL.'
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

    console.log('OpenAI API response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, response.statusText);
      console.error('Error details:', errorText);
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
    
    console.log('OpenAI API response received successfully');
    console.log('AI response length:', aiResponse.length, 'characters');
    console.log('AI Response preview:', aiResponse.substring(0, 200) + '...');

    try {
      console.log('Attempting to parse AI response as JSON...');
      const result = JSON.parse(aiResponse);
      console.log('JSON parsing successful');
      console.log('Result keys:', Object.keys(result));
      
      // Generate fallback citation if AI doesn't provide one
      if (!result.citation) {
        console.log('AI did not provide citation, generating fallback...');
        const citation = `${authorLastName} ${year} - ${author || 'Unknown'}, ${publishDate || 'Unknown'}, ${title}, ${url || 'No URL'}`;
        result.citation = citation;
        console.log('Fallback citation generated:', citation);
      }
      // If AI response used 'summary' instead of 'tag', map it
      if (result.summary && !result.tag) {
        result.tag = result.summary;
        delete result.summary;
      }
      
      console.log('Final result tag:');
      console.log('- Cut content length:', result.cutContent ? result.cutContent.length : 0, 'characters');
      console.log('- Tag length:', result.tag ? result.tag.length : 0, 'characters');
      console.log('- Citation length:', result.citation ? result.citation.length : 0, 'characters');
      console.log('=== CARD CUTTING REQUEST COMPLETE ===');
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI response that failed to parse:', aiResponse);
      
      // Fallback: return a basic response if JSON parsing fails
      console.log('Generating fallback response due to JSON parsing failure...');
      const fallbackCitation = `${authorLastName} ${year} - ${author || 'Unknown'}, ${publishDate || 'Unknown'}, ${title}, ${url || 'No URL'}`;
      
      // Create a basic highlighted/cut version as fallback
      const contentLength = content.length;
      const highlightLength = Math.floor(contentLength * 0.25); // 25% instead of 12% for more highlighting
      const fallbackContent = `<mark class="highlight">${content.substring(0, highlightLength)}</mark><span class="cut">${content.substring(highlightLength)}</span>`;
      
      console.log('Fallback response generated:');
      console.log('- Fallback content length:', fallbackContent.length, 'characters');
      console.log('- Fallback citation:', fallbackCitation);
      console.log('=== CARD CUTTING REQUEST COMPLETE (FALLBACK) ===');
      
      return new Response(
        JSON.stringify({
          cutContent: fallbackContent,
          tag: argument,
          citation: fallbackCitation
        }),
        { 
          headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('=== CARD CUTTING REQUEST FAILED ===');
    console.error('Unexpected error in cut-card function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...cutCardCorsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});