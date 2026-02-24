import axios from 'axios';
import * as cheerio from 'cheerio';
import qs from 'querystring';
import { GOOGLE_IMG_SCRAP } from 'google-img-scrap';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function searchDuckDuckGo(query) {
    try {
        // Retraso aleatorio entre 1 y 3 segundos para reducir bloqueos
        await delay(Math.floor(Math.random() * 2000) + 1000);

        const url = 'https://html.duckduckgo.com/html/';
        const data = qs.stringify({ q: query });

        const response = await axios.post(url, data, {
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.result__body').each((i, element) => {
            const title = $(element).find('.result__title a').text().trim();
            // Try to extract URL from href
            let href = $(element).find('.result__title a').attr('href');

            if (href) {
                if (href.startsWith('/l/?')) {
                    const match = href.match(/uddg=([^&]+)/);
                    if (match) {
                        href = decodeURIComponent(match[1]);
                    }
                }
                results.push({ title, url: href });
            }
        });

        return results;
    } catch (error) {
        console.error("Error scraping DDG:", error.message);
        return [];
    }
}

export async function searchPDFs(query, limit = 10) {
    const results = await searchDuckDuckGo(`${query} filetype:pdf`);
    return results
        .filter(r => r.url.toLowerCase().endsWith('.pdf'))
        .slice(0, limit);
}

export async function searchImages(query, limit = 10) {
    try {
        const results = await GOOGLE_IMG_SCRAP({
            search: query,
            limit: limit,
            safeSearch: false
        });

        if (results && results.result) {
            return results.result.map(item => ({
                title: item.title,
                url: item.url
            }));
        }
        return [];
    } catch (error) {
        console.error("Error with google-img-scrap:", error.message);
        // Fallback or return empty
        return [];
    }
}
