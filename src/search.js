import axios from 'axios';
import * as cheerio from 'cheerio';
import qs from 'querystring';
import { GOOGLE_IMG_SCRAP } from 'google-img-scrap';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Decodes Bing tracking URLs to get the direct link.
 * Bing uses Base64 in the 'u' parameter prefixed by 'a1'.
 */
function decodeBingUrl(bingUrl) {
    try {
        const urlObj = new URL(bingUrl);
        const uParam = urlObj.searchParams.get('u');
        if (!uParam || !uParam.startsWith('a1')) return bingUrl;

        let base64 = uParam.substring(2)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        while (base64.length % 4 !== 0) {
            base64 += '=';
        }

        return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (e) {
        return bingUrl;
    }
}

async function searchBing(query, limit = 10) {
    try {
        await delay(Math.floor(Math.random() * 2000) + 500);

        const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&FORM=QBLH`;

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.bing.com/',
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const results = new Map(); // Use Map to avoid duplicates

        // Primary selector: Standard Bing results
        $('.b_algo').each((i, el) => {
            const link = $(el).find('h2 a');
            if (link.length) {
                const title = link.text().trim();
                let href = link.attr('href');
                if (href && href.startsWith('http')) {
                    href = decodeBingUrl(href);
                    results.set(href, { title, url: href });
                }
            }
        });

        // Fallback: Scan ALL links in the page for PDF files
        if (results.size === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('http') && href.toLowerCase().split('?')[0].endsWith('.pdf')) {
                    const title = $(el).text().trim() || 'PDF Document';
                    const decodedUrl = decodeBingUrl(href);
                    results.set(decodedUrl, { title, url: decodedUrl });
                }
            });
        }

        return Array.from(results.values()).slice(0, limit);
    } catch (error) {
        console.error("Error scraping Bing:", error.message);
        return [];
    }
}

export async function searchPDFs(query, limit = 10) {
    // Try with filetype:pdf first
    let results = await searchBing(`${query} filetype:pdf`, limit * 2);

    // Fallback: If no results, try searching for "pdf" in the query
    if (results.length === 0) {
        results = await searchBing(`${query} pdf`, limit * 2);
    }

    return results
        .filter(r => r.url.toLowerCase().split('?')[0].endsWith('.pdf'))
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
