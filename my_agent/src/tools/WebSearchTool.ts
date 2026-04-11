import type { Tool } from '../types/index.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export const WebSearchTool: Tool = {
  name: 'WebSearchTool',
  description: 'Search the web for current news, events, and information. Use this when you need up-to-date information. For best results, include specific keywords and date context.',

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query - be specific and include key terms',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 5, max: 10)',
      },
    },
    required: ['query'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const query = input.query as string;
    const limit = Math.min((input.limit as number) || 5, 10);

    const errors: string[] = [];
    const searchers = [
      { fn: () => baiduSearch(query, limit), name: 'baiduSearch' },
      { fn: () => sogouSearch(query, limit), name: 'sogouSearch' },
      { fn: () => so360Search(query, limit), name: 'so360Search' },
      { fn: () => bingSearch(query, limit), name: 'bingSearch' },
      { fn: () => firecrawlSearch(query, limit), name: 'firecrawlSearch' },
      { fn: () => serperSearch(query, limit), name: 'serperSearch' },
    ];

    for (const { fn, name } of searchers) {
      try {
        const results = await fn();
        if (results.length > 0) {
          return formatResults(query, results);
        }
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return `Search failed for all sources:\n${errors.map(e => `- ${e}`).join('\n')}`;
  },
};

async function bingSearch(query: string, limit: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}&count=${limit}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bing search error: ${response.status}`);
    }

    const html = await response.text();
    return parseBingResults(html, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseBingResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const itemRegex = /<li[^>]*class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;

  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    let title = match[2] || '';
    let snippet = match[3] || '';

    title = title.replace(/<[^>]+>/g, '').trim();
    snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (title && url && url.startsWith('http')) {
      results.push({
        title,
        url,
        snippet: snippet.slice(0, 300) || `Related to ${title}`,
        source: 'Bing',
      });
    }
  }

  return results;
}

async function sogouSearch(query: string, limit: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.sogou.com/web?query=${encodedQuery}&num=${limit}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Sogou search error: ${response.status}`);
    }

    const html = await response.text();
    return parseSogouResults(html, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSogouResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const itemRegex = /<div[^>]*class="vrwrap"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*class="space-txt"[^>]*>([\s\S]*?)<\/p>/gi;

  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    let title = match[2] || '';
    let snippet = match[3] || '';

    title = title.replace(/<[^>]+>/g, '').replace(/<[^>]+$/, '').trim();
    snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (title && url && (url.startsWith('http') || url.startsWith('/'))) {
      const fullUrl = url.startsWith('http') ? url : `https://www.sogou.com${url}`;
      results.push({
        title,
        url: fullUrl,
        snippet: snippet.slice(0, 300) || `Related to ${title}`,
        source: 'Sogou',
      });
    }
  }

  if (results.length === 0) {
    const altRegex = /<h3[^>]*class="pt"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = altRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1];
      let title = match[2] || '';
      title = title.replace(/<[^>]+>/g, '').trim();

      if (title && url && url.startsWith('http')) {
        results.push({
          title,
          url,
          snippet: `Related to ${title}`,
          source: 'Sogou',
        });
      }
    }
  }

  return results;
}

async function so360Search(query: string, limit: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.so.com/s?q=${encodedQuery}&pn=1&rn=${limit}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`360 search error: ${response.status}`);
    }

    const html = await response.text();
    return parse360Results(html, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parse360Results(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const itemRegex = /<li[^>]*class="res-list"[^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;

  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    let title = match[2] || '';
    let snippet = match[3] || '';

    title = title.replace(/<[^>]+>/g, '').trim();
    snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (title && url && url.startsWith('http')) {
      results.push({
        title,
        url,
        snippet: snippet.slice(0, 300) || `Related to ${title}`,
        source: '360搜索',
      });
    }
  }

  return results;
}

async function baiduSearch(query: string, limit: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.baidu.com/s?wd=${encodedQuery}&rn=${limit}&tn=news`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Baidu search error: ${response.status}`);
    }

    const html = await response.text();
    return parseBaiduResults(html, limit);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseBaiduResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const itemRegex = /<div[^>]*class="result-op"[^>]*id="[\s\S]*?"[\s\S]*?<h3[^>]*class="news-title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*class="news-desc"[^>]*>([\s\S]*?)<\/p>/gi;

  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    let title = match[2] || '';
    let snippet = match[3] || '';

    title = title.replace(/<[^>]+>/g, '').trim();
    snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (title && url && url.startsWith('http')) {
      results.push({
        title,
        url,
        snippet: snippet.slice(0, 300) || `Related to ${title}`,
        source: 'Baidu',
      });
    }
  }

  if (results.length === 0) {
    const altRegex = /<div[^>]*class="c-container"[^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = altRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1];
      let title = match[2] || '';
      let snippet = match[3] || '';

      title = title.replace(/<[^>]+>/g, '').trim();
      snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      if (title && url && url.startsWith('http') && !url.includes('baidu.com')) {
        results.push({
          title,
          url,
          snippet: snippet.slice(0, 300) || `Related to ${title}`,
          source: 'Baidu',
        });
      }
    }
  }

  return results;
}

async function firecrawlSearch(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://api.firecrawl.dev/v0/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit,
        searchDepth: 'basic',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{
        title?: string;
        url?: string;
        description?: string;
      }>;
    };

    return (data.data || []).slice(0, limit).map(item => ({
      title: item.title || 'Untitled',
      url: item.url || '',
      snippet: item.description || '',
      source: 'Firecrawl',
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

async function serperSearch(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: limit,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }

    const data = await response.json() as {
      items?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
    };

    return (data.items || []).slice(0, limit).map(item => ({
      title: item.title || 'Untitled',
      url: item.link || '',
      snippet: item.snippet || '',
      source: 'Serper',
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatResults(query: string, results: SearchResult[]): string {
  const lines = [
    `搜索结果: ${query}`,
    '='.repeat(50),
    '',
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   来源: ${r.source}`);
    lines.push(`   链接: ${r.url}`);
    if (r.snippet) {
      lines.push(`   摘要: ${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? '...' : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}