'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizePakistanWhatsApp,
    normalizeOrderLookupInput,
    isGreetingMessage,
    calculateDiscountPercentage,
    calculateOrderTotals,
    generateOrderId,
    formatOrderReceiptText,
    formatOrderConfirmationThanksAndShopPrompt,
    formatOrderTrackingMessage,
    formatProductWhatsAppCard,
    formatPaymentOptionsMessage,
    buildOrderConfirmationButtons,
    buildMainBotButtons,
    buildWelcomeMenuButtons,
    buildProductCardButtons,
    parseIncomingBotAction,
    formatAdminInquiryForward,
    verifyAdminCredentials,
    generateAdminToken,
    parseCloudinaryUri,
    normalizeRailwayUrl,
    normalizeOrderStatus,
    computeStoreAnalytics,
    normalizeVariantOptions,
    resolveProductVariantPrice,
    buildStoreBaseUrl,
    buildSiteApiUrl,
    formatStoreAboutMessage,
    formatSiteDetailsSummary,
    formatOrderRejectionApologyMessage,
    formatOrderStatusUpdateMessage,
    formatWarrantyDeliveryMessage,
    formatSolarAdvisorMessage,
    buildWelcomeStoreMenuLists
} = require('./storeLogic');
const railwayLogic = require('../Railway/lib/storeLogic');

test('normalizePakistanWhatsApp accepts 03XXXXXXXXX, +923XXXXXXXXX, and 923XXXXXXXXX', () => {
    const local = normalizePakistanWhatsApp('03299931199');
    assert.equal(local.valid, true);
    assert.equal(local.digits, '923299931199');
    assert.equal(local.e164, '+923299931199');
    assert.equal(local.jid, '923299931199@s.whatsapp.net');

    const plus = normalizePakistanWhatsApp('+92 300-1234567');
    assert.equal(plus.valid, true);
    assert.equal(plus.digits, '923001234567');

    const invalid = normalizePakistanWhatsApp('0312');
    assert.equal(invalid.valid, false);
    assert.ok(invalid.error);
});

test('calculateDiscountPercentage computes accurate integer discount percentage', () => {
    assert.equal(calculateDiscountPercentage(10000, 7500), 25);
    assert.equal(calculateDiscountPercentage(24500, 15900), 35);
    assert.equal(calculateDiscountPercentage(5000, 5000), 0);
});

test('calculateOrderTotals computes subtotal, discount savings, city COD shipping, and free threshold', () => {
    const shippingCfg = {
        codFlatRate: 250,
        expressCodRate: 550,
        freeDeliveryThreshold: 35000,
        cityRates: { Hasilpur: 0, Multan: 300, Karachi: 450 }
    };

    const lowTotal = calculateOrderTotals(
        [{ productId: 1, title: 'Fan', quantity: 1, originalPrice: 13500, discountPrice: 10900 }],
        shippingCfg,
        'Multan',
        'standard'
    );
    assert.equal(lowTotal.subtotal, 10900);
    assert.equal(lowTotal.discountTotal, 2600);
    assert.equal(lowTotal.codDeliveryCharges, 300);
    assert.equal(lowTotal.freeDeliveryApplied, false);
    assert.equal(lowTotal.grandTotal, 11200);

    const hasilpurLocal = calculateOrderTotals(
        [{ productId: 1, title: 'Fan', quantity: 1, originalPrice: 13500, discountPrice: 10900 }],
        shippingCfg,
        'Hasilpur',
        'standard'
    );
    assert.equal(hasilpurLocal.codDeliveryCharges, 0);

    const freeThresholdOrder = calculateOrderTotals(
        [{ productId: 2, title: 'Smart TV', quantity: 1, originalPrice: 165000, discountPrice: 132500 }],
        shippingCfg,
        'Karachi',
        'standard'
    );
    assert.equal(freeThresholdOrder.codDeliveryCharges, 0);
    assert.equal(freeThresholdOrder.freeDeliveryApplied, true);
    assert.equal(freeThresholdOrder.grandTotal, 132500);
});

test('buildMainBotButtons returns store shopping, track order, and inquiry buttons with zero Admin Direct button', () => {
    const buttons = buildMainBotButtons();
    assert.equal(buttons.length, 6);
    const texts = buttons.map((b) => b.text);
    assert.deepEqual(texts, [
        'Items Categories',
        'Offered Items',
        'Featured Items',
        'Browse Online Store',
        'Track Order',
        'Contact For Inquiry'
    ]);
    assert.equal(texts.some((t) => /admin\s*direct/i.test(t)), false);
});

test('formatOrderReceiptText & buildOrderConfirmationButtons produce complete COD receipt', () => {
    const orderId = generateOrderId(new Date('2026-06-01T10:00:00Z'), 4242);
    assert.equal(orderId, 'ORD-2026-4242');

    const receipt = formatOrderReceiptText({
        orderId,
        customerName: 'Bilal Ahmed',
        whatsappNumber: '+923299931199',
        shippingAddress: 'Street 4, Satellite Town',
        city: 'Hasilpur',
        nearestLandmark: 'Baldia Park',
        items: [{ title: 'QLED TV 55"', variant: '55-Inch', quantity: 1, lineTotal: 132500 }],
        subtotal: 132500,
        discountTotal: 32500,
        codDeliveryCharges: 0,
        grandTotal: 132500
    });

    assert.match(receipt, /Al-Mumtaz Electronics/);
    assert.match(receipt, /#ORD-2026-4242/);
    assert.match(receipt, /Grand Total \(COD\): Rs\. 132,500/);

    const btns = buildOrderConfirmationButtons(orderId);
    assert.equal(btns.length, 3);
    assert.equal(btns[0].id, 'confirm_order_ORD-2026-4242');
    assert.equal(btns[1].id, 'pay_ORD-2026-4242');
    assert.equal(btns[2].id, 'cancel_order_ORD-2026-4242');
});

test('buildWelcomeMenuButtons & buildProductCardButtons return required interactive buttons & URLs', () => {
    const welcomeBtns = buildWelcomeMenuButtons({ storeUrl: 'https://shop.almumtaz.pk/' });
    const ids = welcomeBtns.map((b) => b.id);
    assert.ok(ids.includes('menu_categories'));
    assert.ok(ids.includes('menu_search'));
    assert.ok(ids.includes('menu_track'));
    assert.ok(ids.includes('menu_pay'));
    const urlBtn = welcomeBtns.find((b) => b.type === 'cta_url');
    assert.equal(urlBtn.url, 'https://shop.almumtaz.pk');

    const cardBtns = buildProductCardButtons(12, { storeUrl: 'https://shop.almumtaz.pk' });
    assert.equal(cardBtns.length, 2);
    assert.deepEqual(cardBtns[0], { id: 'buy_12', text: '🛒 Order Now', type: 'quick_reply' });
    assert.deepEqual(cardBtns[1], {
        id: 'shop_now_12',
        text: '🛍️ Shop Now',
        type: 'cta_url',
        url: 'https://shop.almumtaz.pk/item/12'
    });
});

test('parseIncomingBotAction handles order confirm/cancel, buy/pay/search, greetings, Track Order, and inquiry triggers', () => {
    assert.deepEqual(parseIncomingBotAction('confirm_order_ORD-2026-4242'), {
        type: 'order_decision',
        decision: 'Confirmed',
        orderId: 'ORD-2026-4242'
    });
    assert.deepEqual(parseIncomingBotAction('cancel_order_ORD-2026-4242'), {
        type: 'order_decision',
        decision: 'Cancelled',
        orderId: 'ORD-2026-4242'
    });
    assert.deepEqual(parseIncomingBotAction('buy_1'), { type: 'buy_product', productId: 1 });
    assert.deepEqual(parseIncomingBotAction('pay_1'), { type: 'pay_target', targetId: '1' });
    assert.deepEqual(parseIncomingBotAction('pay_ORD-2026-9336'), { type: 'pay_target', targetId: 'ORD-2026-9336' });
    assert.deepEqual(parseIncomingBotAction('menu_search'), { type: 'menu_search' });
    assert.deepEqual(parseIncomingBotAction('menu_pay'), { type: 'menu_pay' });
    assert.deepEqual(parseIncomingBotAction('search qled tv'), { type: 'search_query', query: 'qled tv' });
    assert.deepEqual(parseIncomingBotAction('almumtaz_track'), { type: 'menu_track' });
    assert.deepEqual(parseIncomingBotAction('Track Order'), { type: 'menu_track' });
    assert.deepEqual(parseIncomingBotAction('track 9336'), { type: 'track_order_lookup', query: '9336' });
    assert.deepEqual(parseIncomingBotAction('ORD-2026-9336'), { type: 'track_order_lookup', query: 'ORD-2026-9336' });
    assert.deepEqual(parseIncomingBotAction('almumtaz_inquiry'), { type: 'menu_inquiry' });
    assert.deepEqual(parseIncomingBotAction('Offered Items'), { type: 'menu_offers' });
    assert.equal(parseIncomingBotAction('Assalamualaikum').type, 'greeting_menu');
    assert.equal(parseIncomingBotAction('Salam').type, 'greeting_menu');
    assert.equal(parseIncomingBotAction('Hey 👋').type, 'greeting_menu');
    assert.equal(parseIncomingBotAction('👋').type, 'greeting_menu');
    assert.equal(parseIncomingBotAction('Hello').type, 'greeting_menu');
    assert.equal(isGreetingMessage('Assalam-o-Alaikum bhai'), true);
    assert.equal(isGreetingMessage('I want 6kW inverter pricing in Hasilpur'), false);
    assert.deepEqual(parseIncomingBotAction('I want 6kW inverter pricing'), {
        type: 'general_message',
        raw: 'I want 6kW inverter pricing'
    });
});

test('normalizeOrderLookupInput & formatOrderConfirmationThanksAndShopPrompt + formatOrderTrackingMessage work cleanly', () => {
    const full = normalizeOrderLookupInput('#ord-2026-9336');
    assert.equal(full.clean, 'ORD-2026-9336');
    assert.equal(full.isFullId, true);
    assert.equal(full.isShortDigits, false);

    const short = normalizeOrderLookupInput('9336');
    assert.equal(short.clean, '9336');
    assert.equal(short.isFullId, false);
    assert.equal(short.isShortDigits, true);

    const sampleOrder = {
        orderId: 'ORD-2026-9336',
        customerName: 'Bilal Tariq',
        whatsappNumber: '+923299931199',
        shippingAddress: 'Street 7, Model Town',
        city: 'Hasilpur',
        orderStatus: 'Confirmed',
        grandTotal: 145000,
        items: [{ title: '6kW Solar Inverter', variant: '6kW MPPT', quantity: 1, lineTotal: 145000 }]
    };

    const thanksMsg = formatOrderConfirmationThanksAndShopPrompt(sampleOrder);
    assert.match(thanksMsg, /Thank You, Bilal Tariq/);
    assert.match(thanksMsg, /#ORD-2026-9336/);
    assert.match(thanksMsg, /9336/);
    assert.match(thanksMsg, /start shopping on WhatsApp/i);

    const trackMsg = formatOrderTrackingMessage(sampleOrder);
    assert.match(trackMsg, /ORD-2026-9336/);
    assert.match(trackMsg, /Quick Code: \*9336\*/);
    assert.match(trackMsg, /Confirmed/);
});

test('formatAdminInquiryForward includes sender details and inquiry description', () => {
    const msg = formatAdminInquiryForward({
        senderNumber: '923001112233',
        senderName: 'Usman Khan',
        senderJid: '923001112233@s.whatsapp.net',
        description: 'Need pricing for 6kW Solar Inverter installation in Hasilpur',
        createdAt: '2026-11-14T06:00:00Z'
    });
    assert.match(msg, /Usman Khan/);
    assert.match(msg, /\+923001112233/);
    assert.match(msg, /6kW Solar Inverter/);
});

test('verifyAdminCredentials validates matching username/password safely and rejects invalid credentials', () => {
    assert.equal(verifyAdminCredentials('admin', 'AlMumtaz@2026', 'admin', 'AlMumtaz@2026'), true);
    assert.equal(verifyAdminCredentials(' admin ', 'AlMumtaz@2026', 'admin', 'AlMumtaz@2026'), true);
    assert.equal(verifyAdminCredentials('admin', 'wrongpass', 'admin', 'AlMumtaz@2026'), false);
    assert.equal(verifyAdminCredentials('other', 'AlMumtaz@2026', 'admin', 'AlMumtaz@2026'), false);
    assert.equal(verifyAdminCredentials('', '', 'admin', 'AlMumtaz@2026'), false);
    assert.equal(verifyAdminCredentials('admin', 'AlMumtaz@2026', '', ''), false);
});

test('generateAdminToken generates unique prefixed hex session tokens', () => {
    const t1 = generateAdminToken();
    const t2 = generateAdminToken();
    assert.match(t1, /^adm_[a-f0-9]{64}$/);
    assert.match(t2, /^adm_[a-f0-9]{64}$/);
    assert.notEqual(t1, t2);
});

test('parseCloudinaryUri parses valid cloudinary:// URIs and rejects invalid ones', () => {
    const ok = parseCloudinaryUri('cloudinary://123456789:secretKeyHere@almumtazcloud');
    assert.equal(ok.valid, true);
    assert.equal(ok.apiKey, '123456789');
    assert.equal(ok.apiSecret, 'secretKeyHere');
    assert.equal(ok.cloudName, 'almumtazcloud');

    assert.equal(parseCloudinaryUri('').valid, false);
    assert.equal(parseCloudinaryUri('https://example.com').valid, false);
    assert.equal(parseCloudinaryUri('cloudinary://onlykey@cloud').valid, false);
});

test('normalizeRailwayUrl normalizes https:// URLs and strips trailing slashes', () => {
    assert.equal(normalizeRailwayUrl('https://almumtaz-bot.up.railway.app/'), 'https://almumtaz-bot.up.railway.app');
    assert.equal(normalizeRailwayUrl('almumtaz-bot.up.railway.app///'), 'https://almumtaz-bot.up.railway.app');
    assert.equal(normalizeRailwayUrl('  '), '');
});

test('computeStoreAnalytics & normalizeOrderStatus map ACCEPTED/CANCELLED/Shipped cleanly', () => {
    assert.equal(normalizeOrderStatus('ACCEPTED'), 'Confirmed');
    assert.equal(normalizeOrderStatus('CANCELLED'), 'Cancelled');
    assert.equal(normalizeOrderStatus('Shipped'), 'Dispatched');
    assert.equal(normalizeOrderStatus('Dispatched'), 'Dispatched');

    const card = formatProductWhatsAppCard({
        id: 1,
        title: '55" QLED Smart TV',
        sku: 'AME-TV-55',
        originalPrice: 165000,
        discountPrice: 132500,
        discountPercentage: 20,
        stock: 9
    }, { storeUrl: 'https://shop.almumtaz.pk' });
    assert.match(card, /55" QLED Smart TV/);
    assert.match(card, /Rs\. 132,500/);

    const payMsg = formatPaymentOptionsMessage({ storeUrl: 'https://shop.almumtaz.pk' }, { orderId: 'ORD-2026-9336', grandTotal: 55000 });
    assert.match(payMsg, /ORD-2026-9336/);
    assert.match(payMsg, /track\/ORD-2026-9336/);

    const categories = [
        { slug: 'smart-tvs', name: 'Smart TVs' },
        { slug: 'solar-inverters', name: 'Solar Inverters' }
    ];
    const products = [
        { id: 1, title: '55" QLED TV', sku: 'TV-55', categorySlug: 'smart-tvs', stock: 5 },
        { id: 2, title: '6kW Inverter', sku: 'SOL-6', categorySlug: 'solar-inverters', stock: 3 }
    ];
    const orders = [
        {
            orderId: 'ORD-1',
            city: 'Hasilpur',
            orderStatus: 'Confirmed',
            grandTotal: 100000,
            items: [{ productId: 1, title: '55" QLED TV', quantity: 1, lineTotal: 100000 }]
        },
        {
            orderId: 'ORD-2',
            city: 'Multan',
            orderStatus: 'Dispatched',
            grandTotal: 200000,
            items: [{ productId: 2, title: '6kW Inverter', quantity: 1, lineTotal: 200000 }]
        },
        {
            orderId: 'ORD-3',
            city: 'Hasilpur',
            orderStatus: 'Delivered',
            grandTotal: 50000,
            items: [{ productId: 1, title: '55" QLED TV', quantity: 2, lineTotal: 50000 }]
        },
        {
            orderId: 'ORD-4',
            city: 'Lahore',
            orderStatus: 'Shipped',
            grandTotal: 40000,
            items: [{ productId: 1, title: '55" QLED TV', quantity: 1, lineTotal: 40000 }]
        },
        {
            orderId: 'ORD-5',
            city: 'Karachi',
            orderStatus: 'Cancelled',
            grandTotal: 90000,
            items: [{ productId: 2, title: '6kW Inverter', quantity: 1, lineTotal: 90000 }]
        }
    ];

    const report = computeStoreAnalytics({ orders, products, categories });
    assert.equal(report.summary.totalOrders, 5);
    assert.equal(report.summary.confirmedOrders, 1);
    assert.equal(report.summary.dispatchedOrders, 2);
    assert.equal(report.summary.deliveredOrders, 1);
    assert.equal(report.summary.cancelledOrders, 1);
    assert.equal(report.summary.grossRevenue, 390000);
    assert.equal(report.summary.deliveredRevenue, 50000);
    assert.equal(report.summary.confirmationRate, 80);

    const solar = report.byCategories.find((c) => c.slug === 'solar-inverters');
    assert.equal(solar.dispatchedOrders, 1);
    assert.equal(solar.cancelledOrders, 1);
    assert.equal(solar.revenue, 200000);
    assert.equal(solar.unitsSold, 1);

    const tv = report.byCategories.find((c) => c.slug === 'smart-tvs');
    assert.equal(tv.confirmedOrders, 1);
    assert.equal(tv.dispatchedOrders, 1);
    assert.equal(tv.deliveredOrders, 1);
    assert.equal(tv.unitsSold, 4);
    assert.equal(tv.revenue, 190000);

    const filteredTv = computeStoreAnalytics({ orders, products, categories, filterCategory: 'smart-tvs' });
    assert.equal(filteredTv.summary.totalOrders, 3);
    assert.equal(filteredTv.summary.grossRevenue, 190000);
});

test('normalizeVariantOptions and resolveProductVariantPrice handle distinct per-variant prices and fallback cleanly', () => {
    const normalized = normalizeVariantOptions(
        ['43-Inch 4K UHD', '55-Inch QLED', '65-Inch QLED'],
        [
            { name: '43-Inch 4K UHD', originalPrice: 120000, discountPrice: 99000, stock: 8 },
            { name: '65-Inch QLED', originalPrice: 230000, discountPrice: 192000, stock: 4 }
        ],
        165000,
        132500,
        14
    );

    assert.deepEqual(normalized.variantNames, ['43-Inch 4K UHD', '55-Inch QLED', '65-Inch QLED']);
    assert.equal(normalized.variantOptions[0].discountPrice, 99000);
    assert.equal(normalized.variantOptions[0].discountPercentage, 18);
    assert.equal(normalized.variantOptions[1].discountPrice, 132500);
    assert.equal(normalized.variantOptions[2].originalPrice, 230000);
    assert.equal(normalized.variantOptions[2].discountPrice, 192000);
    assert.equal(normalized.variantOptions[2].stock, 4);

    const product = {
        originalPrice: 165000,
        discountPrice: 132500,
        stock: 14,
        variants: normalized.variantNames,
        variantOptions: normalized.variantOptions
    };

    const sixtyFive = resolveProductVariantPrice(product, '65-Inch QLED');
    assert.equal(sixtyFive.variant, '65-Inch QLED');
    assert.equal(sixtyFive.originalPrice, 230000);
    assert.equal(sixtyFive.discountPrice, 192000);
    assert.equal(sixtyFive.stock, 4);

    const fallback = resolveProductVariantPrice(product, 'Unknown Edition');
    assert.equal(fallback.originalPrice, 165000);
    assert.equal(fallback.discountPrice, 132500);
});

test('buildStoreBaseUrl & buildSiteApiUrl normalize STORE_URL and SITE_API_URL cleanly', () => {
    const storeUrl = 'https://ais-pre-example.run.app';
    assert.equal(buildStoreBaseUrl({ storeUrl: `${storeUrl}/` }), storeUrl);
    assert.equal(buildSiteApiUrl({ siteApiUrl: `${storeUrl}/api/` }), `${storeUrl}/api`);
    assert.equal(buildSiteApiUrl({ siteApiUrl: storeUrl }), `${storeUrl}/api`);
    assert.equal(buildSiteApiUrl({ mainSiteUrl: storeUrl }), `${storeUrl}/api`);
    assert.equal(buildSiteApiUrl({}), '');
});

test('Extra Store Bot Features (Showroom & Timings, Warranty & Delivery, Solar Load Guide) and Railway parity work cleanly', () => {
    const cfg = {
        storeName: 'Al-Mumtaz Electronics',
        storeCity: 'Hasilpur',
        storeAddress: 'Main Railway Road, Hasilpur',
        storePhone: '03299931199',
        storeUrl: 'https://shop.example.com'
    };

    const about = formatStoreAboutMessage(cfg);
    assert.match(about, /Main Railway Road, Hasilpur/);
    assert.match(about, /03299931199/);
    assert.match(about, /10:00 AM/);

    const warranty = formatWarrantyDeliveryMessage(cfg);
    assert.match(warranty, /Brand Warranty/);
    assert.match(warranty, /Hasilpur: \*FREE\*/);
    assert.match(warranty, /FREE Nationwide COD/);

    const solar = formatSolarAdvisorMessage(cfg);
    assert.match(solar, /3kW Hybrid System/);
    assert.match(solar, /6kW Dual-MPPT Hybrid/);
    assert.match(solar, /solar-inverters/);

    const lists = buildWelcomeStoreMenuLists(cfg);
    assert.equal(lists.length, 1);
    const allRowIds = lists[0].sections.flatMap((s) => s.rows.map((r) => r.id));
    assert.ok(allRowIds.includes('menu_about'));
    assert.ok(allRowIds.includes('menu_warranty'));
    assert.ok(allRowIds.includes('menu_solar'));
    assert.ok(allRowIds.includes('menu_categories'));
    assert.ok(allRowIds.includes('menu_track'));

    assert.deepEqual(parseIncomingBotAction('menu_about'), { type: 'menu_about' });
    assert.deepEqual(parseIncomingBotAction('timings'), { type: 'menu_about' });
    assert.deepEqual(parseIncomingBotAction('menu_warranty'), { type: 'menu_warranty' });
    assert.deepEqual(parseIncomingBotAction('delivery'), { type: 'menu_warranty' });
    assert.deepEqual(parseIncomingBotAction('menu_solar'), { type: 'menu_solar' });
    assert.deepEqual(parseIncomingBotAction('solar'), { type: 'menu_solar' });

    // Verify Railway/lib/storeLogic parity
    assert.deepEqual(railwayLogic.parseIncomingBotAction('menu_solar'), { type: 'menu_solar' });
    assert.equal(railwayLogic.buildSiteApiUrl({ siteApiUrl: 'https://x.run.app/api/' }), 'https://x.run.app/api');
    assert.equal(railwayLogic.normalizePakistanWhatsApp('923299931199@s.whatsapp.net').digits, '923299931199');
});

test('Site details, Accept Thank-You, and Reject Apology formatting + action parsing work on both Root and Railway', () => {
    const cfg = {
        storeName: 'Al-Mumtaz Electronics',
        storeCity: 'Hasilpur',
        storeAddress: 'Main Railway Road, Hasilpur, District Bahawalpur',
        storePhone: '03299931199',
        storeUrl: 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app'
    };

    const siteDetails = formatSiteDetailsSummary(cfg);
    assert.match(siteDetails, /https:\/\/ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863\.asia-east1\.run\.app/);
    assert.match(siteDetails, /Main Railway Road, Hasilpur/);
    assert.match(siteDetails, /03299931199/);
    assert.match(siteDetails, /Mon–Sat 10:00 AM – 9:30 PM/);

    const sampleOrder = {
        orderId: 'ORD-2026-9336',
        customerName: 'Bilal Ahmad',
        city: 'Hasilpur',
        grandTotal: 132500,
        items: [{ quantity: 1 }]
    };

    const acceptedMsg = formatOrderStatusUpdateMessage({ ...sampleOrder, orderStatus: 'Confirmed' }, cfg);
    assert.match(acceptedMsg, /Thank You, Bilal Ahmad/);
    assert.match(acceptedMsg, /ACCEPTED & CONFIRMED/);
    assert.match(acceptedMsg, /ORD-2026-9336/);

    const rejectedMsg = formatOrderStatusUpdateMessage({ ...sampleOrder, orderStatus: 'Cancelled' }, cfg);
    assert.match(rejectedMsg, /Sincerely Apologize/);
    assert.match(rejectedMsg, /CANCELLED \/ REJECTED/);
    assert.match(rejectedMsg, /03299931199/);
    assert.match(rejectedMsg, /No Cash on Delivery/);

    const receiptMsg = formatOrderReceiptText({
        ...sampleOrder,
        whatsappNumber: '+923001234567',
        shippingAddress: 'Model Town',
        subtotal: 132500,
        codDeliveryCharges: 0,
        items: [{ title: 'QLED TV', variant: '55"', quantity: 1, lineTotal: 132500 }]
    }, cfg);
    assert.match(receiptMsg, /CONFIRM/);
    assert.match(receiptMsg, /REJECT/);

    assert.deepEqual(parseIncomingBotAction('accept_order_ORD-2026-9336'), {
        type: 'order_decision',
        decision: 'Confirmed',
        orderId: 'ORD-2026-9336'
    });
    assert.deepEqual(parseIncomingBotAction('REJECT ORD-2026-9336'), {
        type: 'order_decision',
        decision: 'Cancelled',
        orderId: 'ORD-2026-9336'
    });
    assert.deepEqual(parseIncomingBotAction('DECLINE'), {
        type: 'order_decision_latest',
        decision: 'Cancelled'
    });
    assert.deepEqual(parseIncomingBotAction('site details'), { type: 'menu_about' });
    assert.deepEqual(parseIncomingBotAction('where is your shop'), { type: 'menu_about' });

    // Railway parity checks
    assert.match(railwayLogic.formatSiteDetailsSummary(cfg), /Main Railway Road/);
    assert.match(railwayLogic.formatOrderRejectionApologyMessage(sampleOrder, cfg), /Sincerely Apologize/);
    assert.deepEqual(railwayLogic.parseIncomingBotAction('website'), { type: 'menu_about' });
    assert.deepEqual(railwayLogic.parseIncomingBotAction('YES CONFIRM'), {
        type: 'order_decision_latest',
        decision: 'Confirmed'
    });
});

test('WhatsApp buttonHelper attaches kango-wa <biz> native_flow nodes, messageQueue rate-limits relayMessage without deadlock, and toJid preserves @lid JIDs', async () => {
    const { sendInteractiveMessage, formatKangoButtons } = require('./buttonHelper');
    const railwayButtonHelper = require('../Railway/lib/buttonHelper');
    const { patchSocket } = require('./messageQueue');
    const { toJid, extractTextFromBaileysMessage } = require('./whatsappService');
    const railwayWaService = require('../Railway/lib/whatsappService');

    // 1. Verify @lid JID and :device suffix normalization in toJid
    assert.equal(toJid('18472918472918@lid'), '18472918472918@lid');
    assert.equal(toJid('18472918472918:4@lid'), '18472918472918@lid');
    assert.equal(toJid('923299931199:12@s.whatsapp.net'), '923299931199@s.whatsapp.net');
    assert.equal(toJid('03299931199'), '923299931199@s.whatsapp.net');
    assert.equal(railwayWaService.toJid('18472918472918@lid'), '18472918472918@lid');

    // 2. Verify templateButtonReplyMessage & nativeFlowResponseMessage extraction
    assert.equal(
        extractTextFromBaileysMessage({
            message: {
                templateButtonReplyMessage: {
                    selectedId: 'confirm_order_ORD-2026-9336',
                    selectedDisplayText: '✅ Confirm Order'
                }
            }
        }),
        'confirm_order_ORD-2026-9336'
    );
    assert.equal(
        extractTextFromBaileysMessage({
            message: {
                viewOnceMessageV2Extension: {
                    message: {
                        interactiveResponseMessage: {
                            nativeFlowResponseMessage: {
                                paramsJson: JSON.stringify({ id: 'menu_categories' })
                            }
                        }
                    }
                }
            }
        }),
        'menu_categories'
    );

    // 3. Verify formatKangoButtons converts quick_reply, cta_url, and lists into kango-wa button descriptors
    const formatted = formatKangoButtons(
        [
            { id: 'confirm_order_ORD-2026-9336', text: '✅ Confirm Order', type: 'quick_reply' },
            { id: 'visit_url', text: '🌐 Visit Store', type: 'cta_url', url: 'https://shop.example.com' }
        ],
        [
            {
                title: 'Store Menu',
                sections: [{ title: 'Shop', rows: [{ id: 'menu_about', title: 'Showroom & Timings' }] }]
            }
        ]
    );
    assert.equal(formatted.length, 3);
    assert.equal(formatted[0].id, 'confirm_order_ORD-2026-9336');
    assert.equal(formatted[1].name, 'cta_url');
    assert.equal(formatted[2].id, 'menu_about');
    assert.equal(railwayButtonHelper.formatKangoButtons([{ id: 'buy_1', text: 'Buy Now' }]).length, 1);

    // 4. Verify sendInteractiveMessage with patched socket invokes relayMessage with <biz> native_flow node
    const relayedCalls = [];
    const mockSock = {
        user: { id: '923299931199:1@s.whatsapp.net' },
        sendPresenceUpdate: async () => {},
        relayMessage: async (jid, message, opts) => {
            relayedCalls.push({ jid, message, opts });
            return { key: { id: opts?.messageId || 'msg_1' } };
        },
        sendMessage: async (jid, content) => {
            return { key: { id: 'fallback_1' }, message: content };
        }
    };
    patchSocket(mockSock, 'test_session_99');

    const res = await sendInteractiveMessage(mockSock, '18472918472918@lid', {
        title: 'Al-Mumtaz Electronics',
        text: 'Welcome to Al-Mumtaz Electronics',
        footer: 'Hasilpur',
        buttons: [
            { id: 'menu_categories', text: '🛍️ Browse Categories', type: 'quick_reply' },
            { id: 'visit_store', text: '🌐 Visit Online Store', type: 'cta_url', url: 'https://shop.example.com' }
        ],
        lists: buildWelcomeStoreMenuLists({ storeName: 'Al-Mumtaz Electronics' })
    });

    assert.equal(relayedCalls.length, 1);
    assert.equal(relayedCalls[0].jid, '18472918472918@lid');
    assert.ok(relayedCalls[0].message.interactiveMessage, 'Must send top-level interactiveMessage');
    assert.ok(Array.isArray(relayedCalls[0].opts.additionalNodes), 'Must include additionalNodes for WhatsApp delivery');
    assert.equal(relayedCalls[0].opts.additionalNodes[0].tag, 'biz');
    assert.ok(res?.key?.id);
});

test('Item URL slugs generate direct item links, direct checkout links, and WhatsApp direct checkout buttons', () => {
    const { buildProductDirectLinks } = require('./storeLogic');
    const database = require('./database');

    const created = database.createProduct({
        title: 'Gree 1.5 Ton Inverter AC Pular',
        slug: 'gree-15-ton-pular-inverter',
        sku: 'AME-AC-GREE15',
        categorySlug: 'air-conditioners',
        originalPrice: 175000,
        discountPrice: 158000,
        stock: 9
    });
    assert.equal(created.slug, 'gree-15-ton-pular-inverter');

    const updated = database.updateProduct(created.id, {
        slug: 'gree-pular-dc-inverter-15ton'
    });
    assert.equal(updated.slug, 'gree-pular-dc-inverter-15ton');

    const links = buildProductDirectLinks(updated, { publicStoreUrl: 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app' });
    assert.equal(links.itemUrl, 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app/item/gree-pular-dc-inverter-15ton');
    assert.equal(links.checkoutUrl, 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app/checkout/gree-pular-dc-inverter-15ton');

    const cardText = formatProductWhatsAppCard(updated, { publicStoreUrl: 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app' });
    assert.match(cardText, /\/item\/gree-pular-dc-inverter-15ton/);
    assert.match(cardText, /\/checkout\/gree-pular-dc-inverter-15ton/);

    const buttons = buildProductCardButtons(updated, { publicStoreUrl: 'https://ais-pre-hiuyw6voetxjeqvop7f4jn-955644874863.asia-east1.run.app' });
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].id, `buy_${updated.id}`);
    assert.equal(buttons[0].text, '🛒 Order Now');
    assert.equal(buttons[1].type, 'cta_url');
    assert.equal(buttons[1].text, '🛍️ Shop Now');
    assert.ok(buttons[1].url.endsWith('/item/gree-pular-dc-inverter-15ton'));

    assert.deepEqual(parseIncomingBotAction('/checkout/gree-pular-dc-inverter-15ton'), {
        type: 'buy_product',
        productId: 'gree-pular-dc-inverter-15ton'
    });
    assert.deepEqual(parseIncomingBotAction('/item/gree-pular-dc-inverter-15ton'), {
        type: 'search_query',
        query: 'gree-pular-dc-inverter-15ton'
    });

    database.deleteProduct(created.id);
});

test('Unique Menu for New & 24h Comeback Users contains Username, Store Name, Shop Now, Main Menu & Stop WhatsApp Alerts', async () => {
    const {
        buildUniqueComebackMenuButtons,
        formatUniqueWelcomeOrComebackMessage,
        buildMainMenuInteractiveButtons,
        formatMainMenuPromptMessage,
        formatStopAlertsConfirmationMessage,
        evaluateUserMenuEligibility,
        TWENTY_FOUR_HOURS_MS
    } = require('./storeLogic');
    const database = require('./database');
    const whatsappService = require('./whatsappService');

    const cfg = { storeName: 'Al-Mumtaz Electronics', storeCity: 'Hasilpur', storeUrl: 'https://shop.almumtaz.pk' };
    const uniqueText = formatUniqueWelcomeOrComebackMessage('Zahid Ashiq', cfg, false);
    assert.match(uniqueText, /Zahid Ashiq/);
    assert.match(uniqueText, /Al-Mumtaz Electronics/);
    assert.match(uniqueText, /Shop Now/);
    assert.match(uniqueText, /Main Menu/);
    assert.match(uniqueText, /Stop WhatsApp Alerts/);

    const uniqueBtns = buildUniqueComebackMenuButtons(cfg);
    assert.equal(uniqueBtns.length, 4);
    assert.deepEqual(uniqueBtns[0], {
        id: 'activate_ai',
        text: '🤖 AI Assistant',
        type: 'quick_reply'
    });
    assert.deepEqual(uniqueBtns[1], {
        id: 'shop_now_url',
        text: '🛍️ Shop Now',
        type: 'cta_url',
        url: 'https://shop.almumtaz.pk'
    });
    assert.deepEqual(uniqueBtns[2], {
        id: 'main_menu',
        text: '📋 Main Menu',
        type: 'quick_reply'
    });
    assert.deepEqual(uniqueBtns[3], {
        id: 'stop_alerts',
        text: '🔕 Stop WhatsApp Alerts',
        type: 'quick_reply'
    });

    // Main Menu asks for Categories and Items List
    const mainMenuText = formatMainMenuPromptMessage('Zahid Ashiq', cfg);
    assert.match(mainMenuText, /Categories/);
    assert.match(mainMenuText, /Items List/);
    const mainMenuBtns = buildMainMenuInteractiveButtons(cfg);
    assert.ok(mainMenuBtns.some((b) => b.id === 'menu_categories'));
    assert.ok(mainMenuBtns.some((b) => b.id === 'menu_items_list'));

    // Stop Alerts confirmation message
    const stopMsg = formatStopAlertsConfirmationMessage('Zahid Ashiq', cfg);
    assert.match(stopMsg, /Zahid Ashiq/);
    assert.match(stopMsg, /24 hours|tomorrow|next day/i);

    // Eligibility checks: New User -> true; <24h -> false; >=24h -> true; Muted -> false
    const now = 1700000000000;
    assert.equal(evaluateUserMenuEligibility(null, now).shouldSendUniqueMenu, true);
    assert.equal(evaluateUserMenuEligibility({ lastMenuSentAt: now - 3600_000 }, now).shouldSendUniqueMenu, false);
    const comeback = evaluateUserMenuEligibility({ lastMenuSentAt: now - TWENTY_FOUR_HOURS_MS - 1000 }, now);
    assert.equal(comeback.isComeback24h, true);
    assert.equal(comeback.shouldSendUniqueMenu, true);
    const muted = evaluateUserMenuEligibility({ lastMenuSentAt: now - TWENTY_FOUR_HOURS_MS * 2, mutedUntil: now + 60_000 }, now);
    assert.equal(muted.isMuted, true);
    assert.equal(muted.shouldSendUniqueMenu, false);

    // Action parsing for main_menu, menu_items_list, stop_alerts
    assert.deepEqual(parseIncomingBotAction('main_menu'), { type: 'main_menu' });
    assert.deepEqual(parseIncomingBotAction('📋 Main Menu'), { type: 'main_menu' });
    assert.deepEqual(parseIncomingBotAction('menu_items_list'), { type: 'menu_items_list' });
    assert.deepEqual(parseIncomingBotAction('📦 Items List'), { type: 'menu_items_list' });
    assert.deepEqual(parseIncomingBotAction('stop_alerts'), { type: 'stop_alerts' });
    assert.deepEqual(parseIncomingBotAction('🔕 Stop WhatsApp Alerts'), { type: 'stop_alerts' });
    assert.deepEqual(railwayLogic.parseIncomingBotAction('stop_alerts'), { type: 'stop_alerts' });

    // End-to-end processIncomingMessage test for New User -> Within 24h Skip -> Stop Alerts -> Muted Suppression -> Main Menu Resume
    const testPhone = '923009998877';
    database.db.prepare('DELETE FROM whatsapp_users WHERE phone_digits = ?').run(testPhone);

    const firstRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Zahid Ashiq',
        rawText: 'Salam'
    });
    assert.ok(firstRes);

    // Second greeting within 24 hours should skip sending duplicate Unique Menu
    const secondRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Zahid Ashiq',
        rawText: 'Hello again'
    });
    assert.equal(secondRes.skippedDuplicateMenuWithin24h, true);

    // Stop WhatsApp Alerts mutes for 24 hours
    const stopRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Zahid Ashiq',
        rawText: 'stop_alerts'
    });
    assert.equal(stopRes.stoppedAlerts, true);

    // Subsequent message while muted is suppressed
    const mutedRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Zahid Ashiq',
        rawText: 'Hi'
    });
    assert.equal(mutedRes.suppressedByMute, true);

    // Clean up test row
    database.db.prepare('DELETE FROM whatsapp_users WHERE phone_digits = ?').run(testPhone);
});

test('Custom Customer Login, 4-Digit WhatsApp OTP with Copy Button, Customer Token & SQLite/Supabase Persistence work end-to-end', async () => {
    const {
        hashUserPassword,
        verifyUserPassword,
        generateOtpCode,
        formatWhatsAppOtpMessage,
        buildWhatsAppOtpButtons,
        generateCustomerToken,
        verifyCustomerToken
    } = require('./storeLogic');
    const { formatKangoButtons } = require('./buttonHelper');
    const railwayButtonHelper = require('../Railway/lib/buttonHelper');
    const database = require('./database');
    const whatsappService = require('./whatsappService');
    const supabaseUsers = require('./supabaseUsers');

    // 1. Password hashing & verification
    assert.throws(() => hashUserPassword('123'), /at least 4 characters/);
    const pwHash = hashUserPassword('Secret#2026');
    assert.ok(pwHash.startsWith('scrypt$'));
    assert.equal(verifyUserPassword('Secret#2026', pwHash), true);
    assert.equal(verifyUserPassword('WrongPass', pwHash), false);

    // 2. 4-digit OTP generation, exact message copy & cta_copy button
    const otp = generateOtpCode();
    assert.match(otp, /^\d{4}$/);

    const otpMsg = formatWhatsAppOtpMessage(otp);
    assert.equal(otpMsg, `Al Mumtaz Electronics\nOne Time Password\n${otp}`);

    const otpBtns = buildWhatsAppOtpButtons(otp);
    assert.equal(otpBtns.length, 1);
    assert.deepEqual(otpBtns[0], {
        id: 'copy_otp_code',
        text: 'Copy OTP',
        type: 'cta_copy',
        copyCode: otp
    });

    // Verify kango-wa buttonHelper & Railway parity convert cta_copy properly
    const kangoOtpBtns = formatKangoButtons(otpBtns);
    assert.equal(kangoOtpBtns[0].name, 'cta_copy');
    const parsedParams = JSON.parse(kangoOtpBtns[0].buttonParamsJson);
    assert.equal(parsedParams.display_text, 'Copy OTP');
    assert.equal(parsedParams.copy_code, otp);

    const railwayKangoOtpBtns = railwayButtonHelper.formatKangoButtons(otpBtns);
    assert.equal(railwayKangoOtpBtns[0].name, 'cta_copy');
    assert.equal(JSON.parse(railwayKangoOtpBtns[0].buttonParamsJson).copy_code, otp);

    // 3. Railway/lib/storeLogic OTP & password parity
    const railHash = railwayLogic.hashUserPassword('RailPass99');
    assert.equal(railwayLogic.verifyUserPassword('RailPass99', railHash), true);
    assert.equal(railwayLogic.formatWhatsAppOtpMessage('7492'), 'Al Mumtaz Electronics\nOne Time Password\n7492');
    assert.equal(railwayLogic.buildWhatsAppOtpButtons('7492')[0].copyCode, '7492');

    // 4. Customer token signing & verification
    const secret = 'unit-test-secret-key';
    const token = generateCustomerToken({
        whatsappDigits: '923001122334',
        whatsappNumber: '+923001122334',
        name: 'Zahid Ashiq',
        isVerified: true
    }, secret);
    assert.match(token, /^usr_/);
    const verifiedPayload = verifyCustomerToken(token, secret);
    assert.equal(verifiedPayload.digits, '923001122334');
    assert.equal(verifiedPayload.name, 'Zahid Ashiq');
    assert.equal(verifiedPayload.verified, true);
    assert.equal(verifyCustomerToken(`${token}tamper`, secret), null);

    // 5. SQLite OTP & store_users persistence + WhatsApp OTP dispatch log
    const testDigits = '923001122999';
    database.deleteUserOtpByDigits(testDigits);
    database.db.prepare('DELETE FROM store_users WHERE whatsapp_digits = ?').run(testDigits);

    database.createOrReplaceUserOtp({
        whatsappDigits: testDigits,
        whatsappNumber: `+${testDigits}`,
        name: 'Test Customer',
        passwordHash: pwHash,
        otpCode: otp,
        ttlMinutes: 10
    });
    const pending = database.getUserOtpByDigits(testDigits);
    assert.equal(pending.otpCode, otp);
    assert.equal(pending.name, 'Test Customer');

    const expectedStore = database.getAllVariables().config.storeName || 'Al Mumtaz Electronics';
    const dispatch = await whatsappService.sendWhatsAppOtp(testDigits, otp);
    assert.equal(dispatch.text, `${expectedStore}\nOne Time Password\n${otp}`);
    assert.equal(dispatch.buttons[0].type, 'cta_copy');
    assert.equal(dispatch.buttons[0].copyCode, otp);

    const logRow = database.db
        .prepare('SELECT * FROM whatsapp_logs WHERE messageType = ? AND recipient = ? ORDER BY id DESC LIMIT 1')
        .get('auth_otp', `+${testDigits}`);
    assert.ok(logRow);
    assert.equal(logRow.summary, `${expectedStore}\nOne Time Password\n${otp}`);
    const parsedLogPayload = JSON.parse(logRow.payloadJson || '{}');
    assert.equal(parsedLogPayload.buttons[0].type, 'cta_copy');
    assert.equal(parsedLogPayload.buttons[0].copyCode, otp);

    const savedUser = database.saveStoreUser({
        whatsappDigits: testDigits,
        whatsappNumber: `+${testDigits}`,
        name: 'Test Customer',
        passwordHash: pwHash,
        isVerified: true,
        supabaseSynced: false
    });
    assert.equal(savedUser.isVerified, true);
    assert.equal(database.getStoreUserByDigits(testDigits).name, 'Test Customer');

    const supaStatus = supabaseUsers.getSupabaseUserStoreStatus();
    assert.equal(typeof supaStatus.configured, 'boolean');

    // Clean up test rows & log
    database.deleteUserOtpByDigits(testDigits);
    database.db.prepare('DELETE FROM store_users WHERE whatsapp_digits = ?').run(testDigits);
    if (logRow?.id) {
        database.db.prepare('DELETE FROM whatsapp_logs WHERE id = ?').run(logRow.id);
    }
});

test('WhatsApp AI Assistant Mode activates, reasons with synonyms/similar recommendations, attaches max 2 buttons, and exits cleanly on Menu/Exit', async () => {
    const aiAssistant = require('./aiAssistant');
    const railwayAi = require('../Railway/lib/aiAssistant');
    const database = require('./database');
    const whatsappService = require('./whatsappService');

    const catalog = database.getProducts();
    assert.ok(catalog.length > 0);

    // 1. Synonym reasoning: "fridge" finds Haier/Dawlance Refrigerator
    const fridgeSearch = aiAssistant.searchCatalogWithReasoning('fridge price kya hai', catalog, 'https://shop.almumtaz.pk');
    assert.equal(fridgeSearch.exactMatch, true);
    assert.ok(fridgeSearch.products.length >= 1);
    assert.match(fridgeSearch.products[0].name, /refrigerator|dawlance|haier/i);
    assert.match(fridgeSearch.products[0].productUrl, /^https:\/\/shop\.almumtaz\.pk\/item\//);

    // 2. Non-exact query returns exactMatch: false + in-stock similarProducts
    const missingSearch = aiAssistant.searchCatalogWithReasoning('playstation console xbox', catalog, 'https://shop.almumtaz.pk');
    assert.equal(missingSearch.exactMatch, false);
    assert.ok(missingSearch.similarProducts.length >= 1);

    // Verify Railway AI module parity
    assert.equal(typeof railwayAi.generateAIReply, 'function');
    assert.equal(railwayAi.AI_MODEL, aiAssistant.AI_MODEL);

    // 3. Action parsing for activate_ai & exit
    assert.deepEqual(parseIncomingBotAction('activate_ai'), { type: 'activate_ai' });
    assert.deepEqual(parseIncomingBotAction('🤖 AI Assistant'), { type: 'activate_ai' });
    assert.deepEqual(parseIncomingBotAction('Exit'), { type: 'exit_ai' });
    assert.deepEqual(railwayLogic.parseIncomingBotAction('activate_ai'), { type: 'activate_ai' });

    // 4. End-to-end WhatsApp AI flow (with local catalog fallback when offline/no key)
    const testPhone = '923007776655';
    database.db.prepare('DELETE FROM whatsapp_users WHERE phone_digits = ?').run(testPhone);
    aiAssistant.deactivateAIMode(testPhone);

    const activateRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Ayesha',
        rawText: 'activate_ai'
    });
    assert.equal(activateRes.aiActivated, true);
    assert.equal(aiAssistant.isAIModeActive(testPhone), true);

    const aiReplyRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Ayesha',
        rawText: 'fridge price kya hai'
    });
    assert.equal(aiReplyRes.aiReply, true);
    assert.ok(aiReplyRes.text.length > 10);
    assert.equal(aiReplyRes.buttons.length, 2);
    assert.match(aiReplyRes.buttons[0].id, /^buy_/);
    assert.equal(aiReplyRes.buttons[0].text, '🛒 Order Now');
    assert.equal(aiReplyRes.buttons[1].type, 'cta_url');
    assert.equal(aiReplyRes.buttons[1].text, '🛍️ Shop Now');

    // Sending "Exit" or "Menu" deactivates AI Mode and opens standard store menu
    const exitRes = await whatsappService.processIncomingMessage({
        senderJid: `${testPhone}@s.whatsapp.net`,
        senderName: 'Ayesha',
        rawText: 'Menu'
    });
    assert.equal(aiAssistant.isAIModeActive(testPhone), false);
    assert.ok(exitRes);

    // Clean up test row
    aiAssistant.deactivateAIMode(testPhone);
    database.db.prepare('DELETE FROM whatsapp_users WHERE phone_digits = ?').run(testPhone);
    database.db.prepare('DELETE FROM whatsapp_logs WHERE recipient = ?').run(`+${testPhone}`);
});

test('SQLite storagePaths and openDatabaseWithFallback recover cleanly when preferred path is unwritable or invalid', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const storagePaths = require('./storagePaths');
    const database = require('./database');

    assert.equal(storagePaths.isDirectoryWritable(storagePaths.DATA_DIR), true);
    assert.equal(storagePaths.isSqliteTargetWritable(storagePaths.DB_PATH), true);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'almumtaz_ro_test_'));
    const blockedFileAsDir = path.join(tmpDir, 'not_a_dir');
    fs.writeFileSync(blockedFileAsDir, 'file', 'utf8');

    const prevSqlitePath = process.env.SQLITE_PATH;
    try {
        process.env.SQLITE_PATH = path.join(blockedFileAsDir, 'cant_open.db');
        const resolved = storagePaths.resolveWritableDbPath(tmpDir);
        assert.notEqual(resolved, process.env.SQLITE_PATH);
        assert.equal(storagePaths.isSqliteTargetWritable(resolved), true);

        const fallback = database.openDatabaseWithFallback(process.env.SQLITE_PATH);
        assert.ok(fallback.conn);
        assert.notEqual(fallback.dbPath, process.env.SQLITE_PATH);
        fallback.conn.close();
    } finally {
        if (prevSqlitePath === undefined) {
            delete process.env.SQLITE_PATH;
        } else {
            process.env.SQLITE_PATH = prevSqlitePath;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

