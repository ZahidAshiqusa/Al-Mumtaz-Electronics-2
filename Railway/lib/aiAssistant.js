'use strict';

/**
 * Railway/lib/aiAssistant.js
 * Gemini Function Calling + Live Supabase Product Search AI Shopping Assistant
 * for 24/7 Railway WhatsApp Baileys Bot.
 */

const { buildStoreBaseUrl, formatPkr } = require('./storeLogic');

const AI_MODEL = 'gemini-4-hydrogen';
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY_TURNS = 12;

const aiSessions = new Map();

const SYNONYM_GROUPS = [
    ['refrigerator', 'fridge', 'freezer', 'ice', 'cooling', 'dawlance', 'haier', 'frg'],
    ['ac', 'air conditioner', 'split', 'ton', 'gree', 'cooling', 't3', 'inverter ac'],
    ['tv', 'television', 'led', 'qled', 'uhd', '4k', 'smart tv', 'samsung', 'visionpro', 'screen'],
    ['solar', 'inverter', 'mppt', 'hybrid', 'battery', 'lithium', 'lifepo4', 'ups', 'backup', 'crown', 'ecopower'],
    ['audio', 'headphone', 'headphones', 'headset', 'earbuds', 'tws', 'watch', 'smartwatch', 'soundbar', 'speaker', 'subwoofer', 'bluetooth'],
    ['fan', 'bldc', 'ceiling fan', 'pankha', 'ac/dc', 'royal'],
    ['microwave', 'oven', 'grill', 'kitchen', 'convection', 'cooker']
];

function expandSearchKeywords(query) {
    const clean = String(query || '')
        .toLowerCase()
        .replace(/[^\w\s.-]+/g, ' ')
        .trim();
    if (!clean) return [];

    const rawTokens = clean.split(/\s+/).filter((t) => t.length >= 2);
    const expanded = new Set([clean, ...rawTokens]);

    for (const group of SYNONYM_GROUPS) {
        const hit = group.some((term) =>
            clean.includes(term) || rawTokens.some((tok) => term.includes(tok) || (tok.length >= 3 && term.startsWith(tok)))
        );
        if (hit) {
            for (const term of group) expanded.add(term);
        }
    }

    return Array.from(expanded);
}

function normalizeProductRecord(item, storeBaseUrl) {
    if (!item || typeof item !== 'object') return null;
    const id = item.id ?? item.productId ?? '';
    const title = String(item.name || item.title || 'Electronics Item').trim();
    const slug = String(item.slug || '').trim() || String(id);
    const regularNum = Number(item.price ?? item.originalPrice ?? item.sale_price ?? item.discountPrice ?? 0) || 0;
    const saleRaw = item.sale_price ?? item.discountPrice;
    const saleNum = saleRaw !== undefined && saleRaw !== null && Number(saleRaw) > 0
        ? Number(saleRaw)
        : regularNum;
    const stock = Math.max(0, parseInt(item.stock ?? 0, 10) || 0);
    const base = String(storeBaseUrl || 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app').replace(/\/+$/, '');
    const productUrl = `${base}/item/${encodeURIComponent(slug || String(id || '1'))}`;

    return {
        id,
        slug,
        title,
        name: title,
        brand: String(item.brand || '').trim(),
        categorySlug: String(item.categorySlug || item.category || '').trim(),
        originalPrice: regularNum,
        discountPrice: saleNum,
        regularPrice: formatPkr(regularNum),
        discountPriceFormatted: saleNum < regularNum ? formatPkr(saleNum) : null,
        stock,
        inStock: stock > 0 ? `Available (${stock} left)` : 'Out of Stock',
        description: String(item.description || '').slice(0, 220),
        warranty: String(item.warranty || '').trim(),
        images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
        productUrl
    };
}

function searchCatalogWithReasoning(query, catalogItems = [], storeBaseUrl = '') {
    const normalizedAll = (Array.isArray(catalogItems) ? catalogItems : [])
        .map((item) => normalizeProductRecord(item, storeBaseUrl))
        .filter(Boolean);

    const clean = String(query || '').trim().toLowerCase();
    const keywords = expandSearchKeywords(clean);

    const scored = normalizedAll.map((item) => {
        const haystack = [
            item.title,
            item.slug,
            item.brand,
            item.categorySlug,
            item.description
        ].join(' ').toLowerCase();

        let score = 0;
        if (clean && item.title.toLowerCase().includes(clean)) score += 20;
        if (clean && item.slug.toLowerCase().includes(clean)) score += 16;

        for (const kw of keywords) {
            if (kw.length < 2) continue;
            if (item.title.toLowerCase().includes(kw)) score += 6;
            else if (item.categorySlug.toLowerCase().includes(kw)) score += 5;
            else if (haystack.includes(kw)) score += 3;
        }
        if (item.stock > 0 && score > 0) score += 2;
        return { item, score };
    });

    const matched = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((s) => s.item);

    if (matched.length > 0) {
        return {
            exactMatch: true,
            query,
            products: matched.map((p) => ({
                id: p.id,
                name: p.name,
                regularPrice: p.regularPrice,
                discountPrice: p.discountPriceFormatted,
                inStock: p.inStock,
                description: p.description,
                warranty: p.warranty,
                productUrl: p.productUrl
            })),
            matchedRecords: matched
        };
    }

    const availableAlternatives = normalizedAll.filter((p) => p.stock > 0).slice(0, 4);

    return {
        exactMatch: false,
        requestedQuery: query,
        message: `"${query}" is currently unavailable or not found in stock, but these similar available items are in stock at our store.`,
        products: [],
        similarProducts: availableAlternatives.map((p) => ({
            id: p.id,
            name: p.name,
            regularPrice: p.regularPrice,
            discountPrice: p.discountPriceFormatted,
            inStock: p.inStock,
            description: p.description,
            productUrl: p.productUrl
        })),
        matchedRecords: availableAlternatives
    };
}

let _cachedSupabaseClient = null;
let _cachedSupabaseSig = '';

async function getSupabaseClient() {
    const url = String(process.env.SUPABASE_URL || '').trim();
    const key = String(
        process.env.SUPABASE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        ''
    ).trim();

    if (!url || !key) return null;
    const sig = `${url}|${key}`;
    if (_cachedSupabaseClient && _cachedSupabaseSig === sig) {
        return _cachedSupabaseClient;
    }

    const { createClient } = await import('@supabase/supabase-js');
    _cachedSupabaseClient = createClient(url, key);
    _cachedSupabaseSig = sig;
    return _cachedSupabaseClient;
}

async function fetchProductsFromSupabase(query, fallbackProducts = [], storeConfig = {}) {
    const storeBaseUrl = String(process.env.STORE_BASE_URL || buildStoreBaseUrl(storeConfig)).trim();
    const cleanQuery = String(query || '').trim();

    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data: stdData, error: stdErr } = await supabase
                .from('products')
                .select('id, name, price, sale_price, stock, description, slug')
                .or(`name.ilike.%${cleanQuery}%,description.ilike.%${cleanQuery}%`)
                .limit(10);

            if (!stdErr && Array.isArray(stdData) && stdData.length > 0) {
                return searchCatalogWithReasoning(cleanQuery, stdData, storeBaseUrl);
            }

            const { data: allData, error: allErr } = await supabase
                .from('products')
                .select('*')
                .limit(60);

            if (!allErr && Array.isArray(allData) && allData.length > 0) {
                return searchCatalogWithReasoning(cleanQuery, allData, storeBaseUrl);
            }
        }
    } catch (_) {
        // Fallback to local catalog
    }

    if (Array.isArray(fallbackProducts) && fallbackProducts.length > 0) {
        return searchCatalogWithReasoning(cleanQuery, fallbackProducts, storeBaseUrl);
    }

    return {
        exactMatch: false,
        requestedQuery: cleanQuery,
        message: `"${cleanQuery}" ke naam se koi product abhi available nahi mila.`,
        products: [],
        similarProducts: [],
        matchedRecords: []
    };
}

function buildSystemInstruction(storeConfig = {}) {
    const storeName = storeConfig.storeName || 'Al-Mumtaz Electronics';
    const storeCity = storeConfig.storeCity || 'Hasilpur';
    const storePhone = storeConfig.storePhone || '03299931199';
    const storeUrl = String(process.env.STORE_BASE_URL || buildStoreBaseUrl(storeConfig)).trim();

    return [
        `Aap ${storeName} (${storeCity}) ke official AI Shopping Assistant hain.`,
        'Guidelines:',
        '1. Customer jis zuban (Roman Urdu, Urdu, ya English) mein message kare, usi zuban mein mukhtasir, polite aur helpful jawab dein.',
        '2. Jab bhi customer kisi product, price, discount, availability, ya suggestion ke bare mein pooche, hamesha `searchStoreProducts` tool call karein — khud se prices invent na karein.',
        '3. Agar requested item exact match na ho ya out of stock ho, toh customer ko wazeh batayein aur tool se mile `similarProducts` (available alternative models) suggest karein.',
        '4. Har product ke saath uska exact naam, regular/discount price (Rs.), stock status, aur direct website link zaroor share karein.',
        `5. Delivery Info: Pure Pakistan mein 2–4 working days mein Cash on Delivery (COD). Hasilpur mein same/next day free delivery; Rs. 35,000+ orders par nationwide free COD. Helpline: ${storePhone}. Website: ${storeUrl}`,
        '6. Return/Exchange: 7-day replacement guarantee on factory defects + official brand warranty.',
        '7. End mein customer ko yaad dilayein ke standard menu par wapas aane ke liye "Menu" ya "Exit" likh sakte hain.'
    ].join('\n');
}

function activateAIMode(stateKey) {
    const key = String(stateKey || '').trim();
    if (!key) return null;
    const session = {
        active: true,
        history: [],
        lastMatchedProducts: [],
        expiresAt: Date.now() + SESSION_TTL_MS
    };
    aiSessions.set(key, session);
    return session;
}

function deactivateAIMode(stateKey) {
    const key = String(stateKey || '').trim();
    if (!key) return false;
    return aiSessions.delete(key);
}

function isAIModeActive(stateKey, nowMs = Date.now()) {
    const key = String(stateKey || '').trim();
    if (!key) return false;
    const session = aiSessions.get(key);
    if (!session || !session.active) return false;
    if (session.expiresAt <= nowMs) {
        aiSessions.delete(key);
        return false;
    }
    return true;
}

function buildFallbackCatalogReply(userMessage, searchResult, storeConfig = {}) {
    const storeName = storeConfig.storeName || 'Al-Mumtaz Electronics';
    const items = (searchResult.matchedRecords || []).slice(0, 3);
    const looksRomanUrdu = /\b(?:kya|hai|hain|ki|ka|ke|chahiye|chahie|milega|milegi|rate|qeemat|batao|bataen|dikhao|salam|aoa|bhai|koi|aur)\b/i.test(userMessage);

    if (items.length === 0) {
        return looksRomanUrdu
            ? `Maaf kijiye, is waqt *"${userMessage}"* catalog mein available nahi mila. Main Menu par jaane ke liye *Menu* likhein.`
            : `Sorry, we couldn't find *"${userMessage}"* in stock right now at *${storeName}*. Type *Menu* to return to the store menu.`;
    }

    const lines = [];
    if (searchResult.exactMatch) {
        lines.push(looksRomanUrdu
            ? `*${storeName}* mein aap ki search ke mutabiq yeh items available hain:`
            : `Here are the matching items in stock at *${storeName}*:`);
    } else {
        lines.push(looksRomanUrdu
            ? `Maaf kijiye, exact *"${searchResult.requestedQuery}"* abhi stock mein nahi hai, lekin hamare paas yeh milte-julte available items maujood hain:`
            : `*"${searchResult.requestedQuery}"* is currently unavailable, however here are similar in-stock items at *${storeName}*:`);
    }

    items.forEach((p, i) => {
        const pricePart = p.discountPriceFormatted
            ? `*${p.discountPriceFormatted}* (Was ${p.regularPrice})`
            : `*${p.regularPrice}*`;
        lines.push('');
        lines.push(`${i + 1}. *${p.name}*`);
        lines.push(`   Price: ${pricePart} • ${p.inStock}`);
        lines.push(`   Link: ${p.productUrl}`);
    });

    lines.push('');
    lines.push(looksRomanUrdu
        ? 'Order karne ke liye niche *Order Now* button dabayein, ya wapas Menu par jaane ke liye *Menu* likhein.'
        : 'Tap *Order Now* below to place a COD order, or type *Menu* to return to the main menu.');

    return lines.join('\n');
}

async function generateAIReply(stateKey, userMessage, { storeConfig = {}, fallbackProducts = [] } = {}) {
    const key = String(stateKey || '').trim();
    let session = aiSessions.get(key);
    if (!session) {
        session = activateAIMode(key);
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;

    const cleanInput = String(userMessage || '').trim();
    if (!cleanInput) {
        return {
            text: 'Ji farmayein, aap kis electronics product ke bare mein maloomat lena chahte hain? (Menu ke liye "Menu" likhein)',
            matchedProducts: []
        };
    }

    let matchedRecords = [];
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (apiKey) {
        try {
            const { GoogleGenAI, Type } = await import('@google/genai');
            const ai = new GoogleGenAI({
                apiKey,
                httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
            });

            const searchProductTool = {
                name: 'searchStoreProducts',
                description:
                    'Supabase store database se kisi bhi product ka naam, price, discount, stock availability, aur website link hasil karne ke liye is function ko call karein. Agar exact match na ho to similar available products milenge.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        query: {
                            type: Type.STRING,
                            description: 'Product ka naam, category, brand ya keyword'
                        }
                    },
                    required: ['query']
                }
            };

            const chat = ai.chats.create({
                model: AI_MODEL,
                history: session.history.slice(-MAX_HISTORY_TURNS),
                config: {
                    systemInstruction: buildSystemInstruction(storeConfig),
                    tools: [{ functionDeclarations: [searchProductTool] }]
                }
            });

            let response = await chat.sendMessage({ message: cleanInput });
            let toolIterations = 0;

            while (response?.functionCalls && response.functionCalls.length > 0 && toolIterations < 3) {
                toolIterations += 1;
                const call = response.functionCalls[0];
                if (call?.name === 'searchStoreProducts') {
                    const searchQuery = String(call.args?.query || cleanInput);
                    const toolResult = await fetchProductsFromSupabase(searchQuery, fallbackProducts, storeConfig);
                    if (Array.isArray(toolResult.matchedRecords)) {
                        matchedRecords = toolResult.matchedRecords;
                    }
                    const cleanToolPayload = {
                        exactMatch: toolResult.exactMatch,
                        requestedQuery: toolResult.requestedQuery || searchQuery,
                        message: toolResult.message || null,
                        products: toolResult.products || [],
                        similarProducts: toolResult.similarProducts || []
                    };
                    response = await chat.sendMessage({
                        message: [{
                            functionResponse: {
                                name: 'searchStoreProducts',
                                response: { result: cleanToolPayload }
                            }
                        }]
                    });
                } else {
                    break;
                }
            }

            const replyText = String(response?.text || '').trim();
            if (replyText) {
                session.history.push({ role: 'user', parts: [{ text: cleanInput }] });
                session.history.push({ role: 'model', parts: [{ text: replyText }] });
                if (session.history.length > MAX_HISTORY_TURNS * 2) {
                    session.history = session.history.slice(-MAX_HISTORY_TURNS * 2);
                }
                if (matchedRecords.length > 0) {
                    session.lastMatchedProducts = matchedRecords;
                }
                return {
                    text: replyText,
                    matchedProducts: matchedRecords.length > 0 ? matchedRecords : session.lastMatchedProducts.slice(0, 2),
                    usedFallback: false
                };
            }
        } catch (err) {
            console.warn('[aiAssistant] Gemini fallback triggered:', err.message);
        }
    }

    const searchRes = await fetchProductsFromSupabase(cleanInput, fallbackProducts, storeConfig);
    matchedRecords = searchRes.matchedRecords || [];
    if (matchedRecords.length > 0) {
        session.lastMatchedProducts = matchedRecords;
    }

    const fallbackText = buildFallbackCatalogReply(cleanInput, searchRes, storeConfig);
    session.history.push({ role: 'user', parts: [{ text: cleanInput }] });
    session.history.push({ role: 'model', parts: [{ text: fallbackText }] });
    if (session.history.length > MAX_HISTORY_TURNS * 2) {
        session.history = session.history.slice(-MAX_HISTORY_TURNS * 2);
    }

    return {
        text: fallbackText,
        matchedProducts: matchedRecords,
        usedFallback: true
    };
}

module.exports = {
    AI_MODEL,
    SESSION_TTL_MS,
    aiSessions,
    expandSearchKeywords,
    searchCatalogWithReasoning,
    fetchProductsFromSupabase,
    activateAIMode,
    deactivateAIMode,
    isAIModeActive,
    generateAIReply
};
