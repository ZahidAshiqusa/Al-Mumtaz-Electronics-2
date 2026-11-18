'use strict';

(function () {
    const { request, formatPkr, escapeHtml } = window.AlMumtazAPI;

    const HERO_SLIDES = [
        {
            titleTop: 'Upgrade Your',
            titleBottom: 'Tech Essentials',
            subtitle: 'Curated QLED Smart TVs, Solar Hybrid Inverters, Inverter ACs & Studio Audio with Cash on Delivery across Pakistan.',
            image: '/images/hero_electronics_showcase.jpg'
        },
        {
            titleTop: 'Solar Power 2026',
            titleBottom: 'Zero Load-Shedding',
            subtitle: 'Pure sine-wave MPPT hybrid inverters & lithium battery banks delivered nationwide with official brand warranty.',
            image: '/images/product_solar_inverter.jpg'
        },
        {
            titleTop: 'Studio Audio &',
            titleBottom: 'Home Comfort COD',
            subtitle: 'Official brand warranties, open-parcel inspection & instant WhatsApp confirmation on every order.',
            image: '/images/product_audio_accessories.jpg'
        }
    ];

    const state = {
        store: {},
        categories: [],
        products: [],
        featured: [],
        flashDeals: [],
        cart: JSON.parse(localStorage.getItem('almumtaz_cart') || '[]'),
        wishlist: JSON.parse(localStorage.getItem('almumtaz_wishlist') || '[]'),
        wishlistOnly: false,
        quickTab: 'all',
        heroSlideIdx: 0,
        filters: {
            category: 'all',
            search: '',
            maxPrice: 300000,
            minDiscount: '',
            tag: '',
            inStock: false,
            sort: 'newest'
        },
        activeView: 'store',
        lastOrder: null,
        pdpProduct: null,
        pdpSelectedVariant: '',
        pdpActiveImageIdx: 0,
        cardVariantMap: {},
        customerUser: null,
        supabaseInfo: { configured: false, mode: 'local_sqlite_only' },
        authMode: 'signup',
        pendingOtpPhone: ''
    };

    async function copyTextToClipboard(text) {
        const clean = String(text || '').trim();
        if (!clean) return false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(clean);
                return true;
            } catch (_) {}
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = clean;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (_) {
            return true;
        }
    }

    function resolveVariantOption(product, requestedVariant = '') {
        if (!product) {
            return { name: '', originalPrice: 0, discountPrice: 0, discountPercentage: 0, stock: 0 };
        }
        const opts = Array.isArray(product.variantOptions) ? product.variantOptions : [];
        const target = String(requestedVariant || '').trim();
        let matched = null;
        if (target && opts.length > 0) {
            matched = opts.find((v) => String(v.name || '').trim().toLowerCase() === target.toLowerCase()) || null;
        }
        if (!matched && opts.length > 0) {
            matched = opts[0];
        }
        if (matched) {
            return {
                name: matched.name,
                originalPrice: Number(matched.originalPrice) || Number(product.originalPrice) || 0,
                discountPrice: Number(matched.discountPrice) || Number(product.discountPrice) || 0,
                discountPercentage: Number(matched.discountPercentage ?? product.discountPercentage) || 0,
                stock: matched.stock !== undefined ? Number(matched.stock) : Number(product.stock || 0)
            };
        }
        return {
            name: target || (product.variants && product.variants[0]) || '',
            originalPrice: Number(product.originalPrice) || 0,
            discountPrice: Number(product.discountPrice) || 0,
            discountPercentage: Number(product.discountPercentage) || 0,
            stock: Number(product.stock || 0)
        };
    }

    function showToast(msg, isError = false) {
        const el = document.getElementById('toast-banner');
        if (!el) return;
        el.textContent = msg;
        el.className = `fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm px-4 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-semibold border backdrop-blur-xl ${
            isError
                ? 'bg-red-50/95 text-red-700 border-red-200'
                : 'bg-white/95 text-slate-900 border-white'
        }`;
        el.classList.remove('hidden');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.add('hidden'), 3400);
    }

    function saveCart() {
        localStorage.setItem('almumtaz_cart', JSON.stringify(state.cart));
        updateCartBadges();
    }

    function saveWishlist() {
        localStorage.setItem('almumtaz_wishlist', JSON.stringify(state.wishlist));
        const badge = document.getElementById('wishlist-count');
        if (badge) {
            const count = state.wishlist.length;
            badge.textContent = String(count);
            badge.classList.toggle('hidden', count <= 0);
            badge.classList.toggle('flex', count > 0);
        }
    }

    function updateCartBadges() {
        const count = state.cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
        const badge = document.getElementById('cart-badge-count');
        if (badge) {
            badge.textContent = String(count);
            badge.classList.toggle('hidden', count <= 0);
            badge.classList.toggle('flex', count > 0);
        }
        renderCartDrawer();
    }

    function setActiveBottomNav(target) {
        document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach((btn) => {
            const active = btn.dataset.bottomNav === target;
            btn.classList.toggle('text-royal-600', active);
            btn.classList.toggle('text-slate-500', !active);
        });
    }

    function setActiveQuickTab(tabName) {
        state.quickTab = tabName;
        document.querySelectorAll('#store-quick-nav .quick-tab-btn').forEach((btn) => {
            const isActive = btn.dataset.quickTab === tabName;
            btn.classList.toggle('bg-white', isActive);
            btn.classList.toggle('text-royal-700', isActive);
            btn.classList.toggle('border-white', isActive);
            btn.classList.toggle('shadow-md', isActive);

            btn.classList.toggle('bg-white/18', !isActive);
            btn.classList.toggle('backdrop-blur-md', !isActive);
            btn.classList.toggle('text-white', !isActive);
            btn.classList.toggle('border-white/30', !isActive);
        });

        if (tabName === 'categories') setActiveBottomNav('shop');
        else if (tabName === 'sale') setActiveBottomNav('deals');
        else if (tabName === 'all') setActiveBottomNav('home');
    }

    function switchView(viewName) {
        state.activeView = viewName;
        document.querySelectorAll('.view-section').forEach((sec) => sec.classList.add('hidden'));
        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.nav-link').forEach((btn) => {
            const active = btn.dataset.nav === viewName;
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('font-bold', active);
            btn.classList.toggle('text-white/80', !active);
        });

        if (viewName === 'track') {
            setActiveQuickTab('track');
        } else if (viewName === 'store' && state.quickTab === 'track') {
            setActiveQuickTab('all');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (viewName === 'checkout') {
            prefillCheckoutFromCustomer();
            refreshCheckoutSummary();
        }
    }

    function addToCart(product, qty = 1, variant = '') {
        if (!product) return;
        const resolved = resolveVariantOption(product, variant || state.cardVariantMap[product.id] || '');
        const chosenVariant = resolved.name || (product.variants && product.variants[0]) || '';
        const existing = state.cart.find(
            (i) => i.productId === product.id && i.variant === chosenVariant
        );
        if (existing) {
            existing.quantity += qty;
            existing.originalPrice = resolved.originalPrice;
            existing.discountPrice = resolved.discountPrice;
        } else {
            state.cart.push({
                productId: product.id,
                title: product.title,
                sku: product.sku,
                variant: chosenVariant,
                quantity: qty,
                originalPrice: resolved.originalPrice,
                discountPrice: resolved.discountPrice,
                image: product.images?.[0] || '/images/product_qled_tv.jpg'
            });
        }
        saveCart();
        showToast(`Added "${product.title}"${chosenVariant ? ` (${chosenVariant})` : ''}`);
    }

    function toggleWishlist(productId) {
        const idx = state.wishlist.indexOf(productId);
        if (idx >= 0) {
            state.wishlist.splice(idx, 1);
            showToast('Removed from Saved list');
        } else {
            state.wishlist.push(productId);
            showToast('Saved to Wishlist');
        }
        saveWishlist();
        renderFlashDeals();
        renderFeaturedItems();
        renderCatalog();
    }

    function setHeroSlide(idx) {
        const safeIdx = ((idx % HERO_SLIDES.length) + HERO_SLIDES.length) % HERO_SLIDES.length;
        state.heroSlideIdx = safeIdx;
        const slide = HERO_SLIDES[safeIdx];
        const imgEl = document.getElementById('hero-banner-img');
        const titleEl = document.getElementById('hero-slide-title');
        const subEl = document.getElementById('hero-slide-sub');

        if (imgEl && slide.image) {
            imgEl.src = slide.image;
        }
        if (titleEl) {
            titleEl.innerHTML = `
                <span class="block">${escapeHtml(slide.titleTop)}</span>
                <span class="block mt-0.5">${escapeHtml(slide.titleBottom)}</span>
            `;
        }
        if (subEl) {
            subEl.textContent = slide.subtitle;
        }

        document.querySelectorAll('#hero-dots .hero-dot').forEach((dot) => {
            const active = Number(dot.dataset.heroSlide) === safeIdx;
            dot.classList.toggle('w-7', active);
            dot.classList.toggle('bg-white', active);
            dot.classList.toggle('w-2', !active);
            dot.classList.toggle('bg-white/45', !active);
        });
    }

    function promoteStoreSection(mode = 'default') {
        const hero = document.getElementById('cyber-hero-section');
        const stack = document.getElementById('store-sections-stack');
        const cats = document.getElementById('categories-section');
        const flash = document.getElementById('flash-deals-section');
        const featuredSec = document.getElementById('featured-items-section');
        const catalog = document.getElementById('catalog-section');
        if (!stack || !cats || !flash || !catalog) return;

        if (mode === 'catalog') {
            if (hero) hero.classList.add('hidden');
            cats.classList.add('hidden');
            flash.classList.add('hidden');
            if (featuredSec) featuredSec.classList.add('hidden');
            catalog.classList.remove('hidden');
            stack.appendChild(catalog);
            stack.appendChild(flash);
            if (featuredSec) stack.appendChild(featuredSec);
            stack.appendChild(cats);
            catalog.classList.remove('py-5');
            catalog.classList.add('pt-6', 'pb-12');
        } else if (mode === 'categories') {
            if (hero) hero.classList.add('hidden');
            cats.classList.remove('hidden');
            flash.classList.add('hidden');
            if (featuredSec) featuredSec.classList.add('hidden');
            if (state.filters.category && state.filters.category !== 'all') {
                catalog.classList.remove('hidden');
            } else {
                catalog.classList.add('hidden');
            }
            stack.appendChild(cats);
            stack.appendChild(catalog);
            stack.appendChild(flash);
            if (featuredSec) stack.appendChild(featuredSec);
            catalog.classList.remove('pt-6', 'pb-12');
            catalog.classList.add('py-5');
        } else {
            // 'default' -> All Electronics tab: Hero + Offered Items first, Featured Items second, All Products third; Categories hidden
            if (hero) hero.classList.remove('hidden');
            cats.classList.add('hidden');
            flash.classList.remove('hidden');
            if (featuredSec) featuredSec.classList.remove('hidden');
            catalog.classList.remove('hidden');
            stack.appendChild(flash);
            if (featuredSec) stack.appendChild(featuredSec);
            stack.appendChild(catalog);
            stack.appendChild(cats);
            catalog.classList.remove('pt-6', 'pb-12');
            catalog.classList.add('py-5');
        }

        if (window.scrollY > 120) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function hasActiveSpotlightCollection() {
        return Boolean(
            state.wishlistOnly ||
            (state.filters.category && state.filters.category !== 'all') ||
            state.filters.minDiscount ||
            state.filters.tag ||
            state.filters.search
        );
    }

    function renderCatalogQuickCategoryBar() {
        const bar = document.getElementById('catalog-quick-categories');
        if (!bar) return;

        const quickItems = [
            { slug: 'sale', label: 'Sale Offers', isSale: true },
            { slug: 'featured', label: 'Featured Items', isFeatured: true },
            ...state.categories.map((c) => ({ slug: c.slug, label: c.name }))
        ];

        bar.innerHTML = quickItems.map((item) => {
            const active =
                (item.isSale && state.filters.minDiscount === '1' && state.filters.category === 'all' && !state.filters.tag) ||
                (item.isFeatured && state.filters.tag === 'Featured' && state.filters.category === 'all') ||
                (!item.isSale && !item.isFeatured && state.filters.category === item.slug);
            return `
                <button
                    type="button"
                    data-banner-cat="${escapeHtml(item.slug)}"
                    class="banner-cat-btn h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                        active
                            ? 'bg-white text-royal-700 border-white shadow-sm'
                            : 'bg-white/18 text-white border-white/30 hover:bg-white/28'
                    }"
                >
                    ${escapeHtml(item.label)}
                </button>
            `;
        }).join('');

        bar.querySelectorAll('.banner-cat-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.bannerCat;
                if (key === 'sale') {
                    applyQuickTab('sale');
                } else if (key === 'featured') {
                    applyQuickTab('featured');
                } else {
                    selectStoreCategory(key);
                }
            });
        });
    }

    function updateActiveCollectionBanner(filteredCount, animate = false) {
        const banner = document.getElementById('active-collection-banner');
        const sweep = document.getElementById('active-banner-sweep');
        const kicker = document.getElementById('active-banner-kicker');
        const title = document.getElementById('active-banner-title');
        const subtitle = document.getElementById('active-banner-subtitle');
        if (!banner) return;

        if (!hasActiveSpotlightCollection()) {
            banner.classList.add('hidden');
            banner.classList.remove('animate-catalog-banner');
            return;
        }

        let kText = 'Showroom Collection';
        let tText = 'All Electronics';
        let sText = `${filteredCount} genuine product${filteredCount === 1 ? '' : 's'} ready for Cash on Delivery.`;

        if (state.wishlistOnly) {
            kText = 'Saved Collection';
            tText = 'Saved Wishlist Items';
        } else if (state.filters.category && state.filters.category !== 'all') {
            const cat = state.categories.find((c) => c.slug === state.filters.category);
            kText = 'Category Showcase';
            tText = cat ? cat.name : 'Selected Category';
            sText = `${filteredCount} showroom item${filteredCount === 1 ? '' : 's'} in ${tText} · Official Warranty & COD`;
        } else if (state.filters.minDiscount === '1') {
            kText = 'Limited Showroom Discounts';
            tText = 'Sale Items & Special Offers';
            sText = `${filteredCount} discounted appliance${filteredCount === 1 ? '' : 's'} with instant savings.`;
        } else if (state.filters.tag === 'Featured') {
            kText = 'Handpicked Flagship Models';
            tText = 'Featured Items';
            sText = `${filteredCount} top-rated electronics selected by Al-Mumtaz Showroom.`;
        } else if (state.filters.tag === 'Free Delivery') {
            kText = 'Zero Shipping Fee';
            tText = 'Free Delivery Electronics';
            sText = `${filteredCount} eligible appliance${filteredCount === 1 ? '' : 's'} with Free COD Delivery.`;
        } else if (state.filters.search) {
            kText = 'Instant Search Results';
            tText = `Results for "${state.filters.search}"`;
            sText = `${filteredCount} matching item${filteredCount === 1 ? '' : 's'} in live catalog.`;
        }

        if (kicker) kicker.textContent = kText;
        if (title) title.textContent = tText;
        if (subtitle) subtitle.textContent = sText;
        renderCatalogQuickCategoryBar();

        banner.classList.remove('hidden');
        if (animate) {
            banner.classList.remove('animate-catalog-banner');
            if (sweep) sweep.classList.remove('animate-banner-sweep');
            void banner.offsetWidth;
            banner.classList.add('animate-catalog-banner');
            if (sweep) sweep.classList.add('animate-banner-sweep');
        }
    }

    function selectStoreCategory(slug) {
        if (state.activeView !== 'store') {
            switchView('store');
        }
        state.wishlistOnly = false;
        state.filters.minDiscount = '';
        state.filters.tag = '';
        state.filters.search = '';
        state.filters.category = slug || 'all';
        syncFilterInputsFromState();
        setActiveQuickTab(state.filters.category === 'all' ? 'all' : 'categories');
        renderCategories();
        renderCatalog({ animate: true });
        promoteStoreSection(state.filters.category === 'all' ? 'default' : 'categories');
    }

    function renderCategories(animate = false) {
        const grid = document.getElementById('categories-grid');
        const filterSel = document.getElementById('filter-category');
        if (!grid || !filterSel) return;

        filterSel.innerHTML = '<option value="all">All Categories</option>' +
            state.categories.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
        filterSel.value = state.filters.category;

        grid.innerHTML = state.categories.map((cat, idx) => {
            const active = state.filters.category === cat.slug;
            return `
                <button
                    type="button"
                    data-cat-slug="${escapeHtml(cat.slug)}"
                    style="--cat-idx:${Math.min(idx, 10)}"
                    class="${animate ? 'animate-cat-pop ' : ''}cat-card pastel-card-${idx % 4} group text-left border ${active ? 'border-royal-600 ring-2 ring-white shadow-xl' : 'border-white/85 hover:border-white'} rounded-2xl overflow-hidden transition-all flex flex-col hover:-translate-y-1 shadow-lg"
                >
                    <div class="aspect-square bg-white/70 overflow-hidden w-full">
                        <img src="${escapeHtml(cat.image || '/images/product_qled_tv.jpg')}" alt="${escapeHtml(cat.name)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-300" />
                    </div>
                    <div class="p-2.5 sm:p-3.5">
                        <p class="font-display font-bold text-xs sm:text-sm text-slate-900 leading-tight sm:leading-snug line-clamp-2 group-hover:text-royal-600 transition-colors">${escapeHtml(cat.name)}</p>
                        <p class="text-[10px] sm:text-xs text-slate-500 tabular-nums mt-0.5">${cat.productCount || 0} ${(cat.productCount || 0) === 1 ? 'item' : 'items'}</p>
                    </div>
                </button>
            `;
        }).join('');

        grid.querySelectorAll('.cat-card').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectStoreCategory(btn.dataset.catSlug);
            });
        });
    }

    function createProductCardHtml(p, idx = 0, animate = false) {
        const isWished = state.wishlist.includes(p.id);
        const imgUrl = escapeHtml(p.images?.[0] || '/images/product_qled_tv.jpg');
        const activeVariant = resolveVariantOption(p, state.cardVariantMap[p.id] || '');
        const outOfStock = (activeVariant.stock ?? p.stock) <= 0;
        const hasMultiVariants = Array.isArray(p.variantOptions) && p.variantOptions.length > 1;
        const hasDistinctPrices = hasMultiVariants && new Set(p.variantOptions.map((v) => v.discountPrice)).size > 1;
        const cardPastelClass = `pastel-card-${idx % 4}`;
        const isHot = (p.tags || []).includes('Hot');
        const badgeHtml = activeVariant.discountPercentage > 0
            ? `<span data-card-badge="${p.id}" class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-royal-600 text-white text-[9px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full tabular-nums shadow-sm">-${activeVariant.discountPercentage}%</span>`
            : isHot
            ? `<span data-card-badge="${p.id}" class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-coral-500 text-white text-[9px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm">HOT</span>`
            : `<span data-card-badge="${p.id}" class="hidden"></span>`;

        return `
            <article data-product-id="${p.id}" style="--card-idx:${Math.min(idx, 9)}" class="${animate ? 'animate-card-reveal ' : ''}${cardPastelClass} product-card group pdp-trigger cursor-pointer rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col">
                <div class="relative aspect-square bg-white/65 overflow-hidden">
                    <img src="${imgUrl}" alt="${escapeHtml(p.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                    ${badgeHtml}
                    <button
                        type="button"
                        data-wish-id="${p.id}"
                        aria-label="Save ${escapeHtml(p.title)} to wishlist"
                        class="wish-btn absolute top-2 right-2 sm:top-3 sm:right-3 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-coral-500 shadow-sm transition-colors"
                    >
                        <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 ${isWished ? 'fill-coral-500 text-coral-500' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </button>
                </div>

                <div class="p-2.5 sm:p-4 flex-1 flex flex-col justify-between gap-2 sm:gap-3">
                    <div class="space-y-1 sm:space-y-1.5">
                        <p class="text-[9px] sm:text-[11px] font-bold text-royal-600 uppercase tracking-wide truncate">
                            ${escapeHtml(p.brand)}
                        </p>
                        <h3 class="font-display font-bold text-xs sm:text-[15px] text-slate-900 leading-tight sm:leading-snug line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] group-hover:text-royal-600 transition-colors">
                            ${escapeHtml(p.title)}
                        </h3>
                        <p class="text-[10px] sm:text-xs text-slate-600 tabular-nums truncate flex items-center gap-1">
                            <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400 shrink-0" viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.967a1 1 0 00.95.69h4.171c.969 0 1.371 1.24.588 1.81l-3.375 2.452a1 1 0 00-.364 1.118l1.287 3.966c.3.922-.755 1.688-1.54 1.118l-3.374-2.452a1 1 0 00-1.175 0l-3.374 2.452c-.784.57-1.838-.196-1.54-1.118l1.287-3.966a1 1 0 00-.364-1.118L2.049 9.394c-.783-.57-.38-1.81.588-1.81h4.171a1 1 0 00.95-.69l1.291-3.967z" />
                            </svg>
                            <span class="font-bold text-slate-800">${Number(p.rating || 4.8).toFixed(1)}</span>
                            <span class="hidden sm:inline text-slate-500">(${p.reviewCount || 12}) · ${p.soldCount || 0} sold</span>
                        </p>
                        ${hasMultiVariants ? `
                            <div class="hidden sm:flex flex-wrap gap-1 pt-1">
                                ${p.variantOptions.map((v) => {
                                    const selected = v.name === activeVariant.name;
                                    return `
                                        <button
                                            type="button"
                                            data-card-var-prod="${p.id}"
                                            data-card-var-name="${escapeHtml(v.name)}"
                                            class="card-var-btn px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                                                selected
                                                    ? 'border-royal-600 bg-blue-50 text-royal-700'
                                                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-royal-500/50'
                                            }"
                                        >
                                            ${escapeHtml(v.name)}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                    </div>

                    <div class="space-y-1.5 sm:space-y-2 pt-0.5 sm:pt-1">
                        <div class="flex items-baseline gap-1.5 sm:gap-2 flex-wrap content-end">
                            <span data-card-price="${p.id}" class="font-display font-extrabold text-sm sm:text-lg ${activeVariant.discountPercentage > 0 ? 'text-coral-600' : 'text-slate-900'} tabular-nums leading-none">${formatPkr(activeVariant.discountPrice)}</span>
                            ${activeVariant.discountPercentage > 0 ? `<span data-card-orig="${p.id}" class="text-[10px] sm:text-xs text-slate-400 line-through tabular-nums leading-none">${formatPkr(activeVariant.originalPrice)}</span>` : `<span data-card-orig="${p.id}" class="hidden"></span>`}
                            ${hasDistinctPrices ? '<span class="hidden sm:inline text-[10px] text-royal-600 font-semibold">· variant</span>' : ''}
                        </div>

                        <button
                            type="button"
                            data-add-id="${p.id}"
                            ${outOfStock ? 'disabled' : ''}
                            class="add-cart-btn w-full h-7 sm:h-9 border border-slate-200 bg-white hover:bg-blue-50 hover:border-royal-500/40 disabled:opacity-40 text-slate-800 text-[10.5px] sm:text-xs font-bold rounded-full shadow-xs transition-colors whitespace-nowrap px-2 inline-flex items-center justify-center gap-1 sm:gap-1.5"
                        >
                            ${outOfStock ? 'Sold Out' : `
                                <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-royal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span>Add to Bag</span>
                            `}
                        </button>

                        <div class="grid grid-cols-5 gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                data-direct-checkout-id="${p.id}"
                                ${outOfStock ? 'disabled' : ''}
                                class="direct-checkout-btn cta-coral-gradient col-span-4 h-7 sm:h-8 disabled:opacity-40 text-white text-[10.5px] sm:text-xs font-bold rounded-full transition-all whitespace-nowrap px-1.5 inline-flex items-center justify-center gap-1"
                            >
                                <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                <span class="sm:hidden">Checkout</span><span class="hidden sm:inline">Direct Checkout</span>
                            </button>
                            <button
                                type="button"
                                data-copy-slug="${escapeHtml(p.slug || p.id)}"
                                data-share-title="${escapeHtml(p.title)}"
                                title="Share Item Link"
                                aria-label="Share ${escapeHtml(p.title)}"
                                class="copy-card-link-btn col-span-1 h-7 sm:h-8 flex items-center justify-center border border-slate-200 bg-white hover:border-royal-500 text-slate-600 hover:text-royal-600 rounded-full transition-colors"
                            >
                                <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    function bindProductCardEvents(container) {
        if (!container) return;
        container.querySelectorAll('.card-var-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = Number(btn.dataset.cardVarProd);
                const vName = btn.dataset.cardVarName;
                const prod = state.products.find((p) => p.id === pid);
                if (!prod) return;
                state.cardVariantMap[pid] = vName;
                const resolved = resolveVariantOption(prod, vName);

                container.querySelectorAll(`.card-var-btn[data-card-var-prod="${pid}"]`).forEach((b) => {
                    const active = b.dataset.cardVarName === vName;
                    b.classList.toggle('border-royal-600', active);
                    b.classList.toggle('bg-blue-50', active);
                    b.classList.toggle('text-royal-700', active);
                    b.classList.toggle('border-slate-200', !active);
                    b.classList.toggle('bg-white/80', !active);
                    b.classList.toggle('text-slate-600', !active);
                });

                container.querySelectorAll(`[data-card-price="${pid}"]`).forEach((el) => {
                    el.textContent = formatPkr(resolved.discountPrice);
                });
                container.querySelectorAll(`[data-card-orig="${pid}"]`).forEach((el) => {
                    if (resolved.discountPercentage > 0) {
                        el.textContent = formatPkr(resolved.originalPrice);
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                    }
                });
                container.querySelectorAll(`[data-card-badge="${pid}"]`).forEach((el) => {
                    if (resolved.discountPercentage > 0) {
                        el.textContent = `-${resolved.discountPercentage}%`;
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                    }
                });
            });
        });

        container.querySelectorAll('.add-cart-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.addId);
                const prod = state.products.find((p) => p.id === id);
                addToCart(prod, 1, state.cardVariantMap[id] || '');
            });
        });

        container.querySelectorAll('.direct-checkout-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.directCheckoutId);
                const prod = state.products.find((p) => p.id === id);
                if (!prod) return;
                addToCart(prod, 1, state.cardVariantMap[id] || '');
                switchView('checkout');
            });
        });

        container.querySelectorAll('.copy-card-link-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const slug = btn.dataset.copySlug;
                const title = btn.dataset.shareTitle || 'Al-Mumtaz Electronics';
                const url = `${window.location.origin}/item/${encodeURIComponent(slug)}`;
                await copyTextToClipboard(url);
                if (navigator.share) {
                    try {
                        await navigator.share({ title, text: `${title} — Al-Mumtaz Electronics`, url });
                        return;
                    } catch (_) {}
                }
                showToast(`Item link copied to share: /item/${slug}`);
            });
        });

        container.querySelectorAll('.wish-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleWishlist(Number(btn.dataset.wishId));
            });
        });

        container.querySelectorAll('.pdp-trigger').forEach((el) => {
            el.addEventListener('click', () => {
                const id = Number(el.dataset.productId);
                const prod = state.products.find((p) => p.id === id);
                if (prod) openProductDetailModal(prod);
            });
        });
    }

    function renderFlashDeals() {
        const grid = document.getElementById('flash-deals-grid');
        if (!grid) return;
        const deals = state.flashDeals.slice(0, 6);
        grid.innerHTML = deals.map((p, idx) => createProductCardHtml(p, idx, false)).join('');
        bindProductCardEvents(grid);
    }

    function renderFeaturedItems() {
        const grid = document.getElementById('featured-items-grid');
        if (!grid) return;
        const featuredList = (state.featured && state.featured.length > 0)
            ? state.featured.slice(0, 6)
            : state.products.filter((p) => p.isFeatured || (p.tags || []).includes('Featured')).slice(0, 6);
        grid.innerHTML = featuredList.map((p, idx) => createProductCardHtml(p, idx, false)).join('');
        bindProductCardEvents(grid);
    }

    function getFilteredProducts() {
        let list = [...state.products];

        if (state.wishlistOnly) {
            list = list.filter((p) => state.wishlist.includes(p.id));
        }
        if (state.filters.category && state.filters.category !== 'all') {
            list = list.filter((p) => p.categorySlug === state.filters.category);
        }
        if (state.filters.search) {
            const q = state.filters.search.toLowerCase();
            list = list.filter((p) =>
                p.title.toLowerCase().includes(q) ||
                p.brand.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q)
            );
        }
        if (state.filters.maxPrice < 300000) {
            list = list.filter((p) => p.discountPrice <= state.filters.maxPrice);
        }
        if (state.filters.minDiscount) {
            const minD = Number(state.filters.minDiscount);
            list = list.filter((p) => p.discountPercentage >= minD);
        }
        if (state.filters.tag) {
            list = list.filter((p) => (p.tags || []).includes(state.filters.tag));
        }
        if (state.filters.inStock) {
            list = list.filter((p) => p.stock > 0);
        }

        switch (state.filters.sort) {
            case 'price_asc':
                list.sort((a, b) => a.discountPrice - b.discountPrice);
                break;
            case 'price_desc':
                list.sort((a, b) => b.discountPrice - a.discountPrice);
                break;
            case 'best_selling':
                list.sort((a, b) => b.soldCount - a.soldCount);
                break;
            case 'discount':
                list.sort((a, b) => b.discountPercentage - a.discountPercentage);
                break;
            default:
                list.sort((a, b) => b.id - a.id);
                break;
        }
        return list;
    }

    function renderCatalog(options = {}) {
        const { animate = false } = options;
        const grid = document.getElementById('catalog-grid');
        const heading = document.getElementById('catalog-heading');
        const countLabel = document.getElementById('catalog-count-label');
        if (!grid) return;

        const filtered = getFilteredProducts();
        if (state.wishlistOnly) {
            heading.textContent = 'Saved Wishlist Items';
        } else if (state.filters.category !== 'all') {
            const cat = state.categories.find((c) => c.slug === state.filters.category);
            heading.textContent = cat ? cat.name : 'Selected Category';
        } else if (state.filters.minDiscount === '1') {
            heading.textContent = 'Sale Items & Special Offers';
        } else if (state.filters.tag === 'Featured') {
            heading.textContent = 'Featured Electronics';
        } else if (state.filters.tag === 'Free Delivery') {
            heading.textContent = 'Free Delivery Electronics';
        } else if (state.filters.search) {
            heading.textContent = `Search: "${state.filters.search}"`;
        } else {
            heading.textContent = 'All Electronics';
        }

        countLabel.textContent = `Showing ${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
        updateActiveCollectionBanner(filtered.length, animate);

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full surface-frosted-white rounded-3xl p-10 text-center space-y-3 shadow-lg ${animate ? 'animate-card-reveal' : ''}">
                    <p class="font-display font-bold text-slate-900">No products match your current filters.</p>
                    <button id="empty-reset-btn" type="button" class="cta-coral-gradient h-9 px-5 text-white text-xs font-bold rounded-full">Reset All Filters</button>
                </div>
            `;
            document.getElementById('empty-reset-btn')?.addEventListener('click', () => resetFilters());
            return;
        }

        grid.innerHTML = filtered.map((p, idx) => createProductCardHtml(p, idx, animate)).join('');
        bindProductCardEvents(grid);
    }

    function openProductDetailModal(product) {
        state.pdpProduct = product;
        const initialVariant = state.cardVariantMap[product.id] || product.variants?.[0] || 'Standard';
        let activeVariant = resolveVariantOption(product, initialVariant);
        state.pdpSelectedVariant = activeVariant.name || initialVariant;
        state.pdpActiveImageIdx = 0;

        const modal = document.getElementById('pdp-modal');
        const body = document.getElementById('pdp-modal-body');
        const images = product.images?.length ? product.images : ['/images/product_qled_tv.jpg'];
        const variantList = Array.isArray(product.variantOptions) && product.variantOptions.length
            ? product.variantOptions
            : (product.variants || []).map((v) => ({
                name: v,
                originalPrice: product.originalPrice,
                discountPrice: product.discountPrice,
                discountPercentage: product.discountPercentage,
                stock: product.stock
            }));

        body.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div class="md:col-span-6 space-y-3">
                    <div id="pdp-zoom-frame" class="relative aspect-square bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden cursor-zoom-in">
                        <img id="pdp-main-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-full h-full object-cover transition-transform duration-300" />
                        <span id="pdp-discount-badge" class="${activeVariant.discountPercentage > 0 ? '' : 'hidden '}absolute top-3 left-3 bg-royal-600 text-white text-xs font-bold px-3 py-1 rounded-full tabular-nums shadow-sm">-${activeVariant.discountPercentage}% OFF</span>
                    </div>
                    ${images.length > 1 ? `
                        <div class="flex gap-2.5">
                            ${images.map((img, i) => `
                                <button type="button" data-img-idx="${i}" class="pdp-thumb w-16 h-16 border-2 ${i === 0 ? 'border-royal-600' : 'border-slate-200'} rounded-xl overflow-hidden bg-slate-50">
                                    <img src="${escapeHtml(img)}" alt="Thumbnail ${i + 1}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-full h-full object-cover" />
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="md:col-span-6 space-y-4">
                    <div class="space-y-1">
                        <p class="text-xs font-bold text-royal-600 uppercase tracking-wider">
                            ${escapeHtml(product.shopName)} · SKU: ${escapeHtml(product.sku)}
                        </p>
                        <h2 class="font-display text-2xl font-extrabold text-slate-900 leading-tight">${escapeHtml(product.title)}</h2>
                        <p class="text-xs text-slate-600 tabular-nums flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.967a1 1 0 00.95.69h4.171c.969 0 1.371 1.24.588 1.81l-3.375 2.452a1 1 0 00-.364 1.118l1.287 3.966c.3.922-.755 1.688-1.54 1.118l-3.374-2.452a1 1 0 00-1.175 0l-3.374 2.452c-.784.57-1.838-.196-1.54-1.118l1.287-3.966a1 1 0 00-.364-1.118L2.049 9.394c-.783-.57-.38-1.81.588-1.81h4.171a1 1 0 00.95-.69l1.291-3.967z" />
                            </svg>
                            <span class="font-bold text-slate-800">${Number(product.rating || 4.8).toFixed(1)}</span>
                            <span>(${product.reviewCount || 12} Verified Reviews) · ${product.soldCount || 0} units sold</span>
                        </p>
                    </div>

                    <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                        <div class="flex items-baseline gap-3">
                            <span id="pdp-sale-price" class="font-display text-2xl font-extrabold text-coral-600 tabular-nums">${formatPkr(activeVariant.discountPrice)}</span>
                            <span id="pdp-original-price" class="${activeVariant.discountPercentage > 0 ? '' : 'hidden '}text-sm text-slate-400 line-through tabular-nums">${formatPkr(activeVariant.originalPrice)}</span>
                        </div>
                        <p id="pdp-stock-line" class="text-xs font-bold text-emerald-600">
                            Cash on Delivery Available · ${(activeVariant.stock ?? product.stock) > 0 ? `${activeVariant.stock ?? product.stock} units in stock` : 'Currently out of stock'}
                        </p>
                        <p class="text-[11px] text-slate-500 pt-0.5">Warranty: ${escapeHtml(product.warranty || 'Official Brand Warranty')}</p>
                    </div>

                    <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(product.description)}</p>

                    ${variantList.length ? `
                        <div>
                            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Select Variant &amp; Price</p>
                            <div class="flex flex-wrap gap-2">
                                ${variantList.map((v) => {
                                    const isSelected = v.name === state.pdpSelectedVariant;
                                    return `
                                        <button type="button" data-variant="${escapeHtml(v.name)}" class="pdp-variant-btn px-3.5 py-1.5 text-xs font-bold rounded-full border transition-colors ${isSelected ? 'border-royal-600 bg-blue-50 text-royal-700' : 'border-slate-200 bg-white text-slate-700 hover:border-royal-500/50'}">
                                            <span>${escapeHtml(v.name)}</span>
                                            <span class="ml-1.5 font-mono text-[11px] opacity-85">${formatPkr(v.discountPrice)}</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="grid grid-cols-7 gap-2.5 pt-2">
                        <button id="pdp-add-cart-btn" type="button" ${(activeVariant.stock ?? product.stock) <= 0 ? 'disabled' : ''} class="col-span-3 h-11 border border-royal-600/30 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-royal-700 text-sm font-bold rounded-full inline-flex items-center justify-center gap-1.5 transition-colors">
                            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span>Add to Bag</span>
                        </button>
                        <button id="pdp-buy-now-btn" type="button" ${(activeVariant.stock ?? product.stock) <= 0 ? 'disabled' : ''} class="cta-coral-gradient col-span-3 h-11 disabled:opacity-40 text-white text-sm font-bold rounded-full inline-flex items-center justify-center gap-1.5 transition-all">
                            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <span>Direct Checkout</span>
                        </button>
                        <button id="pdp-share-icon-btn" type="button" title="Share Item Link" aria-label="Share Item Link" class="col-span-1 h-11 flex items-center justify-center border border-slate-200 bg-white hover:border-royal-500 text-slate-600 hover:text-royal-600 rounded-full transition-colors">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const zoomFrame = document.getElementById('pdp-zoom-frame');
        const mainImg = document.getElementById('pdp-main-img');
        let zoomed = false;
        zoomFrame?.addEventListener('click', () => {
            zoomed = !zoomed;
            mainImg.classList.toggle('scale-150', zoomed);
            zoomFrame.classList.toggle('cursor-zoom-out', zoomed);
            zoomFrame.classList.toggle('cursor-zoom-in', !zoomed);
        });

        body.querySelectorAll('.pdp-thumb').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.imgIdx);
                mainImg.src = images[idx] || images[0];
                body.querySelectorAll('.pdp-thumb').forEach((b) => {
                    b.classList.toggle('border-royal-600', Number(b.dataset.imgIdx) === idx);
                    b.classList.toggle('border-slate-200', Number(b.dataset.imgIdx) !== idx);
                });
            });
        });

        body.querySelectorAll('.pdp-variant-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.pdpSelectedVariant = btn.dataset.variant;
                state.cardVariantMap[product.id] = state.pdpSelectedVariant;
                activeVariant = resolveVariantOption(product, state.pdpSelectedVariant);

                body.querySelectorAll('.pdp-variant-btn').forEach((b) => {
                    const sel = b.dataset.variant === state.pdpSelectedVariant;
                    b.classList.toggle('border-royal-600', sel);
                    b.classList.toggle('bg-blue-50', sel);
                    b.classList.toggle('text-royal-700', sel);
                    b.classList.toggle('border-slate-200', !sel);
                    b.classList.toggle('bg-white', !sel);
                    b.classList.toggle('text-slate-700', !sel);
                });

                const saleEl = document.getElementById('pdp-sale-price');
                const origEl = document.getElementById('pdp-original-price');
                const badgeEl = document.getElementById('pdp-discount-badge');
                const stockEl = document.getElementById('pdp-stock-line');
                const addBtn = document.getElementById('pdp-add-cart-btn');
                const buyBtn = document.getElementById('pdp-buy-now-btn');

                if (saleEl) saleEl.textContent = formatPkr(activeVariant.discountPrice);
                if (origEl) {
                    origEl.textContent = formatPkr(activeVariant.originalPrice);
                    origEl.classList.toggle('hidden', activeVariant.discountPercentage <= 0);
                }
                if (badgeEl) {
                    badgeEl.textContent = `-${activeVariant.discountPercentage}% OFF`;
                    badgeEl.classList.toggle('hidden', activeVariant.discountPercentage <= 0);
                }
                const vStock = activeVariant.stock ?? product.stock;
                if (stockEl) {
                    stockEl.textContent = `Cash on Delivery Available · ${vStock > 0 ? `${vStock} units in stock` : 'Currently out of stock'}`;
                }
                if (addBtn) addBtn.disabled = vStock <= 0;
                if (buyBtn) buyBtn.disabled = vStock <= 0;
            });
        });

        document.getElementById('pdp-share-icon-btn')?.addEventListener('click', async () => {
            const url = `${window.location.origin}/item/${encodeURIComponent(product.slug || product.id)}`;
            await copyTextToClipboard(url);
            if (navigator.share) {
                try {
                    await navigator.share({ title: product.title, text: `${product.title} — Al-Mumtaz Electronics`, url });
                    return;
                } catch (_) {}
            }
            showToast(`Item link copied to share: ${url}`);
        });

        document.getElementById('pdp-add-cart-btn')?.addEventListener('click', () => {
            addToCart(product, 1, state.pdpSelectedVariant);
            modal.classList.add('hidden');
        });

        document.getElementById('pdp-buy-now-btn')?.addEventListener('click', () => {
            addToCart(product, 1, state.pdpSelectedVariant);
            modal.classList.add('hidden');
            switchView('checkout');
        });

        modal.classList.remove('hidden');
    }

    function renderCartDrawer() {
        const container = document.getElementById('cart-drawer-items');
        const subEl = document.getElementById('cart-drawer-subtotal');
        if (!container || !subEl) return;

        if (state.cart.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 space-y-3">
                    <p class="text-sm font-semibold text-slate-700">Your order bag is empty.</p>
                    <p class="text-xs text-slate-500">Browse electronics and tap "Add to Bag".</p>
                </div>
            `;
            subEl.textContent = 'Rs. 0';
            return;
        }

        let subtotal = 0;
        container.innerHTML = state.cart.map((item, idx) => {
            const line = (item.discountPrice || 0) * (item.quantity || 1);
            subtotal += line;
            return `
                <div class="flex gap-3 border border-slate-200 rounded-2xl p-3 bg-white shadow-xs">
                    <img src="${escapeHtml(item.image || '/images/product_qled_tv.jpg')}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-16 h-16 object-cover rounded-xl bg-slate-100 shrink-0" />
                    <div class="flex-1 min-w-0 space-y-1">
                        <p class="text-xs font-bold text-slate-900 line-clamp-2">${escapeHtml(item.title)}</p>
                        ${item.variant ? `<p class="text-[11px] text-slate-500">${escapeHtml(item.variant)}</p>` : ''}
                        <p class="text-xs font-extrabold text-coral-600 tabular-nums">${formatPkr(line)}</p>
                        <div class="flex items-center justify-between pt-1">
                            <div class="flex items-center border border-slate-200 bg-slate-50 rounded-full">
                                <button type="button" data-qty-idx="${idx}" data-delta="-1" aria-label="Decrease quantity" class="cart-qty-btn w-6 h-6 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-l-full">−</button>
                                <span class="px-2.5 text-xs font-bold text-slate-900 tabular-nums">${item.quantity}</span>
                                <button type="button" data-qty-idx="${idx}" data-delta="1" aria-label="Increase quantity" class="cart-qty-btn w-6 h-6 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-r-full">+</button>
                            </div>
                            <button type="button" data-remove-idx="${idx}" class="cart-remove-btn text-[11px] font-bold text-red-600 hover:underline">Remove</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        subEl.textContent = formatPkr(subtotal);

        container.querySelectorAll('.cart-qty-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.qtyIdx);
                const delta = Number(btn.dataset.delta);
                if (!state.cart[idx]) return;
                state.cart[idx].quantity += delta;
                if (state.cart[idx].quantity <= 0) state.cart.splice(idx, 1);
                saveCart();
                if (state.activeView === 'checkout') refreshCheckoutSummary();
            });
        });

        container.querySelectorAll('.cart-remove-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.cart.splice(Number(btn.dataset.removeIdx), 1);
                saveCart();
                if (state.activeView === 'checkout') refreshCheckoutSummary();
            });
        });
    }

    async function refreshCheckoutSummary() {
        const listEl = document.getElementById('checkout-items-list');
        if (!listEl) return;

        if (state.cart.length === 0) {
            listEl.innerHTML = '<p class="text-sm text-slate-500">Your order bag is empty. Add an item before checking out.</p>';
            document.getElementById('co-subtotal').textContent = 'Rs. 0';
            document.getElementById('co-discount').textContent = '-Rs. 0';
            document.getElementById('co-shipping').textContent = 'Rs. 0';
            document.getElementById('co-grand-total').textContent = 'Rs. 0';
            return;
        }

        listEl.innerHTML = state.cart.map((item) => `
            <div class="flex items-center justify-between gap-3 text-xs border-b border-slate-200 pb-2.5">
                <div class="min-w-0">
                    <p class="font-bold text-slate-900 truncate">${escapeHtml(item.title)}</p>
                    <p class="text-slate-500">${escapeHtml(item.variant || 'Standard')} × ${item.quantity}</p>
                </div>
                <span class="tabular-nums font-bold text-royal-700 shrink-0">${formatPkr(item.discountPrice * item.quantity)}</span>
            </div>
        `).join('');

        const city = document.getElementById('co-city')?.value || 'Hasilpur';
        const deliverySpeed = document.getElementById('co-speed')?.value || 'standard';

        try {
            const est = await request('/api/orders/estimate', {
                method: 'POST',
                body: JSON.stringify({ items: state.cart, city, deliverySpeed })
            });
            document.getElementById('co-subtotal').textContent = formatPkr(est.subtotal);
            document.getElementById('co-discount').textContent = `-${formatPkr(est.discountTotal)}`;
            document.getElementById('co-shipping').textContent = est.codDeliveryCharges === 0 ? 'FREE' : formatPkr(est.codDeliveryCharges);
            document.getElementById('co-grand-total').textContent = formatPkr(est.grandTotal);
        } catch (_) {}
    }

    function syncFilterInputsFromState() {
        document.getElementById('filter-category').value = state.filters.category;
        document.getElementById('filter-price-max').value = String(state.filters.maxPrice);
        document.getElementById('filter-price-label').textContent =
            state.filters.maxPrice >= 300000 ? 'Any' : formatPkr(state.filters.maxPrice);
        document.getElementById('filter-discount').value = state.filters.minDiscount;
        document.getElementById('filter-tag').value = state.filters.tag;
        document.getElementById('filter-instock').checked = state.filters.inStock;
        document.getElementById('sort-products').value = state.filters.sort;
    }

    function resetFilters(options = {}) {
        const { keepQuickTab = false, keepSectionOrder = false, animate = false } = options;
        state.wishlistOnly = false;
        state.filters = {
            category: 'all',
            search: '',
            maxPrice: 300000,
            minDiscount: '',
            tag: '',
            inStock: false,
            sort: 'newest'
        };
        syncFilterInputsFromState();
        const gSearch = document.getElementById('global-search-input');
        const mSearch = document.getElementById('mobile-search-input');
        if (gSearch) gSearch.value = '';
        if (mSearch) mSearch.value = '';
        if (!keepQuickTab) {
            setActiveQuickTab('all');
        }
        renderCategories(animate);
        renderCatalog({ animate });
        if (!keepSectionOrder) {
            promoteStoreSection('default');
        }
    }

    function applyQuickTab(tab) {
        if (tab === 'track') {
            switchView('track');
            return;
        }
        if (state.activeView !== 'store') {
            switchView('store');
        }

        setActiveQuickTab(tab);

        if (tab === 'all') {
            resetFilters({ keepQuickTab: true, animate: true });
            promoteStoreSection('default');
        } else if (tab === 'categories') {
            resetFilters({ keepQuickTab: true, keepSectionOrder: true, animate: true });
            promoteStoreSection('categories');
        } else if (tab === 'sale') {
            resetFilters({ keepQuickTab: true, keepSectionOrder: true });
            state.filters.minDiscount = '1';
            state.filters.sort = 'discount';
            syncFilterInputsFromState();
            renderCatalog({ animate: true });
            promoteStoreSection('catalog');
        } else if (tab === 'featured') {
            resetFilters({ keepQuickTab: true, keepSectionOrder: true });
            state.filters.tag = 'Featured';
            syncFilterInputsFromState();
            renderCatalog({ animate: true });
            promoteStoreSection('catalog');
        } else if (tab === 'free_delivery') {
            resetFilters({ keepQuickTab: true, keepSectionOrder: true });
            state.filters.tag = 'Free Delivery';
            syncFilterInputsFromState();
            renderCatalog({ animate: true });
            promoteStoreSection('catalog');
        }
    }

    function resetPopupCopyBtn() {
        const copyBtn = document.getElementById('popup-copy-order-btn');
        if (!copyBtn) return;
        const label = copyBtn.querySelector('span');
        if (label) label.textContent = 'Copy';
        copyBtn.classList.remove('border-emerald-300', 'bg-emerald-50', 'text-emerald-700');
        copyBtn.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    }

    function openOrderConfirmedPopup(order) {
        const modal = document.getElementById('order-confirmed-popup-modal');
        if (!modal || !order) return;

        const shortCode = String(order.orderId || '').split('-').pop() || order.orderId;
        document.getElementById('popup-order-id').textContent = `#${order.orderId}`;
        document.getElementById('popup-whatsapp-num').textContent = order.whatsappNumber || '';
        document.getElementById('popup-order-total').textContent = formatPkr(order.grandTotal);
        document.getElementById('popup-order-status').textContent = 'Waiting for WhatsApp Confirmation';
        const shortEl = document.getElementById('popup-short-code');
        if (shortEl) shortEl.textContent = shortCode;
        resetPopupCopyBtn();
        modal.classList.remove('hidden');
    }

    function closeOrderConfirmedPopup() {
        const modal = document.getElementById('order-confirmed-popup-modal');
        if (modal) modal.classList.add('hidden');
    }

    function bindSearchSuggestions(inputEl) {
        const box = document.getElementById('search-suggestions');
        if (!inputEl) return;

        inputEl.addEventListener('input', () => {
            const q = inputEl.value.trim();
            state.filters.search = q;
            if (state.activeView !== 'store') switchView('store');
            renderCatalog({ animate: Boolean(q) });
            promoteStoreSection(hasActiveSpotlightCollection() ? 'catalog' : 'default');

            if (!box || inputEl.id !== 'global-search-input') return;
            if (!q) {
                box.classList.add('hidden');
                return;
            }
            const matches = state.products.filter((p) =>
                p.title.toLowerCase().includes(q.toLowerCase()) ||
                p.brand.toLowerCase().includes(q.toLowerCase()) ||
                p.sku.toLowerCase().includes(q.toLowerCase())
            ).slice(0, 5);

            if (matches.length === 0) {
                box.innerHTML = '<div class="px-4 py-3 text-xs text-slate-500">No matching products found.</div>';
            } else {
                box.innerHTML = matches.map((p) => `
                    <button type="button" data-sug-id="${p.id}" class="sug-item w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 flex items-center justify-between gap-3 transition-colors">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <img src="${escapeHtml(p.images?.[0] || '/images/product_qled_tv.jpg')}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/product_qled_tv.jpg';" class="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0" />
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-slate-900 truncate">${escapeHtml(p.title)}</p>
                                <p class="text-[11px] text-slate-500">${escapeHtml(p.sku)}</p>
                            </div>
                        </div>
                        <span class="text-xs font-bold text-royal-700 tabular-nums shrink-0">${formatPkr(p.discountPrice)}</span>
                    </button>
                `).join('');
            }
            box.classList.remove('hidden');

            box.querySelectorAll('.sug-item').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const prod = state.products.find((p) => p.id === Number(btn.dataset.sugId));
                    box.classList.add('hidden');
                    if (prod) openProductDetailModal(prod);
                });
            });
        });

        document.addEventListener('click', (e) => {
            if (box && !box.contains(e.target) && e.target !== inputEl) {
                box.classList.add('hidden');
            }
        });
    }

    async function lookupTrackingOrder(orderId) {
        const resultEl = document.getElementById('track-order-result');
        if (!resultEl) return;
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '<p class="text-sm text-slate-500">Looking up order...</p>';

        try {
            const { order } = await request(`/api/orders/track/${encodeURIComponent(orderId.trim())}`);
            const shortCode = String(order.orderId || '').split('-').pop() || order.orderId;
            const statusColor =
                order.orderStatus === 'Confirmed' || order.orderStatus === 'Delivered'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : order.orderStatus === 'Dispatched' || order.orderStatus === 'Shipped'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : order.orderStatus === 'Cancelled'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';

            resultEl.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="font-mono text-lg font-bold text-slate-900">#${escapeHtml(order.orderId)}</p>
                            <button id="track-copy-order-btn" type="button" class="h-7 px-3 rounded-full border border-slate-200 bg-white hover:border-royal-500 text-slate-700 text-[11px] font-bold">
                                Copy ID
                            </button>
                            <span class="font-mono text-xs font-semibold text-royal-600">Code: ${escapeHtml(shortCode)}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">Placed on ${escapeHtml(order.orderDate)} · ${escapeHtml(order.paymentMethod)}</p>
                    </div>
                    <span class="px-3 py-1 text-xs font-bold border rounded-full ${statusColor}">${escapeHtml(order.orderStatus)}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
                    <div>
                        <p class="font-bold text-slate-500 uppercase">Customer</p>
                        <p class="font-bold text-slate-900 mt-0.5">${escapeHtml(order.customerName)}</p>
                        <p class="font-mono font-semibold text-royal-700">${escapeHtml(order.whatsappNumber)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-slate-500 uppercase">Shipping Destination</p>
                        <p class="font-bold text-slate-900 mt-0.5">${escapeHtml(order.shippingAddress)}, ${escapeHtml(order.city)}</p>
                        ${order.nearestLandmark ? `<p class="text-slate-500">Landmark: ${escapeHtml(order.nearestLandmark)}</p>` : ''}
                    </div>
                </div>
                <div class="space-y-2 text-sm text-slate-700">
                    ${(order.items || []).map((i) => `
                        <div class="flex justify-between border-b border-slate-200 pb-2">
                            <span>${escapeHtml(i.title)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''} × ${i.quantity}</span>
                            <span class="tabular-nums font-bold text-slate-900">${formatPkr(i.lineTotal)}</span>
                        </div>
                    `).join('')}
                    <div class="flex justify-between font-bold text-base pt-2">
                        <span class="text-slate-900">Grand Total (COD)</span>
                        <span class="tabular-nums text-coral-600">${formatPkr(order.grandTotal)}</span>
                    </div>
                </div>
            `;

            document.getElementById('track-copy-order-btn')?.addEventListener('click', async (ev) => {
                const btn = ev.currentTarget;
                const ok = await copyTextToClipboard(order.orderId);
                if (ok) {
                    btn.textContent = 'Copied';
                    showToast(`Copied ${order.orderId}`);
                    setTimeout(() => { btn.textContent = 'Copy ID'; }, 1800);
                }
            });
        } catch (err) {
            resultEl.innerHTML = `<p class="text-sm font-semibold text-red-600">${escapeHtml(err.message)}</p>`;
        }
    }

    // ── CUSTOMER ACCOUNT, CUSTOM LOGIN & FIRST-TIME WHATSAPP OTP VERIFICATION ──
    function prefillCheckoutFromCustomer() {
        if (!state.customerUser) return;
        const nameInp = document.getElementById('co-name');
        const waInp = document.getElementById('co-whatsapp');
        if (nameInp && !nameInp.value.trim()) {
            nameInp.value = state.customerUser.name || '';
        }
        if (waInp && !waInp.value.trim()) {
            waInp.value = state.customerUser.whatsappNumber || '';
        }
    }

    function setAuthFormMode(mode) {
        state.authMode = mode;
        const modeTabs = document.getElementById('auth-mode-tabs');
        const tabSignup = document.getElementById('auth-tab-signup');
        const tabLogin = document.getElementById('auth-tab-login');
        const signupForm = document.getElementById('auth-signup-form');
        const loginForm = document.getElementById('auth-login-form');
        const otpForm = document.getElementById('auth-otp-form');
        const titleEl = document.getElementById('auth-modal-title');
        const subEl = document.getElementById('auth-modal-subtitle');

        if (!signupForm || !loginForm || !otpForm) return;

        ['auth-signup-error', 'auth-login-error', 'auth-otp-error'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        const isOtp = mode === 'otp';
        if (modeTabs) modeTabs.classList.toggle('hidden', isOtp);
        signupForm.classList.toggle('hidden', mode !== 'signup');
        loginForm.classList.toggle('hidden', mode !== 'login');
        otpForm.classList.toggle('hidden', !isOtp);

        if (tabSignup && tabLogin) {
            const onSignUp = mode === 'signup';
            tabSignup.classList.toggle('bg-white', onSignUp);
            tabSignup.classList.toggle('shadow-sm', onSignUp);
            tabSignup.classList.toggle('border', onSignUp);
            tabSignup.classList.toggle('border-slate-200', onSignUp);
            tabSignup.classList.toggle('text-royal-700', onSignUp);
            tabSignup.classList.toggle('text-slate-500', !onSignUp);

            tabLogin.classList.toggle('bg-white', !onSignUp);
            tabLogin.classList.toggle('shadow-sm', !onSignUp);
            tabLogin.classList.toggle('border', !onSignUp);
            tabLogin.classList.toggle('border-slate-200', !onSignUp);
            tabLogin.classList.toggle('text-royal-700', !onSignUp);
            tabLogin.classList.toggle('text-slate-500', onSignUp);
        }

        if (titleEl && subEl) {
            if (isOtp) {
                titleEl.textContent = 'Verify WhatsApp OTP';
                subEl.textContent = 'Enter the 4-digit One Time Password sent to your WhatsApp to activate & save your account.';
            } else if (mode === 'login') {
                titleEl.textContent = 'Welcome Back';
                subEl.textContent = 'Sign in with your verified WhatsApp number & password.';
            } else {
                titleEl.textContent = 'Create Store Account';
                subEl.textContent = 'First-time users verify their ID via WhatsApp One Time Password and sync securely to Supabase.';
            }
        }
    }

    function updateAuthUI() {
        const label = document.getElementById('header-auth-label');
        const dot = document.getElementById('header-auth-dot');
        const formsView = document.getElementById('auth-forms-view');
        const profileView = document.getElementById('auth-profile-view');
        const userNameEl = document.getElementById('profile-user-name');
        const userPhoneEl = document.getElementById('profile-user-phone');
        const supaEl = document.getElementById('profile-supabase-status');
        const titleEl = document.getElementById('auth-modal-title');
        const subEl = document.getElementById('auth-modal-subtitle');

        if (state.customerUser) {
            const firstName = String(state.customerUser.name || 'Account').trim().split(/\s+/)[0];
            if (label) label.textContent = firstName;
            if (dot) dot.classList.remove('hidden');

            if (formsView) formsView.classList.add('hidden');
            if (profileView) profileView.classList.remove('hidden');
            if (userNameEl) userNameEl.textContent = state.customerUser.name || 'Customer';
            if (userPhoneEl) userPhoneEl.textContent = state.customerUser.whatsappNumber || `+${state.customerUser.whatsappDigits}`;
            if (supaEl) {
                supaEl.textContent = state.customerUser.supabaseSynced
                    ? 'Synced to Supabase'
                    : (state.supabaseInfo?.configured ? 'Verified & Ready' : 'Saved Locally');
            }
            if (titleEl) titleEl.textContent = 'Your Account';
            if (subEl) subEl.textContent = 'Your WhatsApp ID is verified for fast COD checkout.';

            prefillCheckoutFromCustomer();
        } else {
            if (label) label.textContent = 'Sign In';
            if (dot) dot.classList.add('hidden');
            if (profileView) profileView.classList.add('hidden');
            if (formsView) formsView.classList.remove('hidden');
            setAuthFormMode(state.authMode || 'signup');
        }
    }

    function openAuthModal(preferredMode) {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        if (!state.customerUser && preferredMode) {
            setAuthFormMode(preferredMode);
        }
        updateAuthUI();
        modal.classList.remove('hidden');
    }

    function closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function loadAuthSession() {
        try {
            const data = await request('/api/auth/session');
            state.customerUser = data.authenticated ? data.user : null;
            if (data.supabase) state.supabaseInfo = data.supabase;
        } catch (_) {
            state.customerUser = null;
        }
        updateAuthUI();
    }

    function startCountdown() {
        const el = document.getElementById('flash-countdown');
        if (!el) return;
        let seconds = 4 * 3600 + 28 * 60 + 19;
        setInterval(() => {
            seconds = seconds > 0 ? seconds - 1 : 4 * 3600;
            const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            el.textContent = `${h}:${m}:${s}`;
        }, 1000);
    }

    async function loadBootstrap() {
        let data;
        try {
            data = await request('/api/store/bootstrap');
        } catch (_) {
            data = await request('/data/bootstrap.json');
        }
        state.store = data.store || {};
        state.categories = data.categories || [];
        state.products = data.products || [];
        state.featured = data.featured || [];
        state.flashDeals = data.flashDeals || [];
        renderCategories();
        renderFlashDeals();
        renderFeaturedItems();
        renderCatalog();
        promoteStoreSection('default');
    }

    function bindEvents() {
        document.querySelectorAll('[data-nav]').forEach((btn) => {
            btn.addEventListener('click', () => switchView(btn.dataset.nav));
        });

        document.querySelectorAll('.quick-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => applyQuickTab(btn.dataset.quickTab));
        });

        // Hero Banner CTAs & Slide Dots
        document.getElementById('hero-deals-btn')?.addEventListener('click', () => applyQuickTab('sale'));
        document.getElementById('hero-explore-btn')?.addEventListener('click', () => applyQuickTab('categories'));
        document.querySelectorAll('#hero-dots .hero-dot').forEach((dot) => {
            dot.addEventListener('click', () => setHeroSlide(Number(dot.dataset.heroSlide || 0)));
        });

        // Mobile Bottom Nav
        document.querySelectorAll('#mobile-bottom-nav .bottom-nav-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.bottomNav;
                setActiveBottomNav(action);
                if (action === 'home') {
                    applyQuickTab('all');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (action === 'shop') {
                    applyQuickTab('categories');
                } else if (action === 'search') {
                    if (state.activeView !== 'store') switchView('store');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => document.getElementById('mobile-search-input')?.focus(), 180);
                } else if (action === 'deals') {
                    applyQuickTab('sale');
                } else if (action === 'account') {
                    openAuthModal();
                }
            });
        });

        // Mobile Hamburger Slide-out Drawer
        const mobileDrawer = document.getElementById('mobile-drawer-backdrop');
        const closeMobileDrawer = () => mobileDrawer?.classList.add('hidden');
        document.getElementById('mobile-drawer-open-btn')?.addEventListener('click', () => {
            mobileDrawer?.classList.remove('hidden');
        });
        document.getElementById('mobile-drawer-close-btn')?.addEventListener('click', closeMobileDrawer);
        mobileDrawer?.addEventListener('click', (e) => {
            if (e.target === mobileDrawer) closeMobileDrawer();
        });
        document.querySelectorAll('[data-drawer-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const act = btn.dataset.drawerAction;
                closeMobileDrawer();
                if (act === 'account') {
                    openAuthModal();
                } else {
                    applyQuickTab(act);
                }
            });
        });

        // Customer Auth Modal Triggers & Forms
        const authModal = document.getElementById('auth-modal');
        document.getElementById('open-auth-btn')?.addEventListener('click', () => openAuthModal());
        document.getElementById('auth-close-btn')?.addEventListener('click', closeAuthModal);
        authModal?.addEventListener('click', (e) => {
            if (e.target === authModal) closeAuthModal();
        });
        document.getElementById('auth-tab-signup')?.addEventListener('click', () => setAuthFormMode('signup'));
        document.getElementById('auth-tab-login')?.addEventListener('click', () => setAuthFormMode('login'));
        document.getElementById('auth-otp-back-btn')?.addEventListener('click', () => setAuthFormMode('signup'));

        document.querySelectorAll('.toggle-pass-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const inp = document.getElementById(btn.dataset.togglePass);
                if (!inp) return;
                const isPass = inp.type === 'password';
                inp.type = isPass ? 'text' : 'password';
                btn.textContent = isPass ? 'Hide' : 'Show';
            });
        });

        document.getElementById('auth-signup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('auth-signup-error');
            const submitBtn = document.getElementById('auth-signup-submit-btn');
            if (errEl) errEl.classList.add('hidden');

            const fd = new FormData(e.target);
            const name = String(fd.get('name') || '').trim();
            const whatsappNumber = String(fd.get('whatsappNumber') || '').trim();
            const password = String(fd.get('password') || '');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending WhatsApp OTP...';
            }

            try {
                const res = await request('/api/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ name, whatsappNumber, password })
                });
                state.pendingOtpPhone = res.whatsappNumber || whatsappNumber;
                const phoneDisplay = document.getElementById('auth-otp-phone-display');
                const noteEl = document.getElementById('auth-otp-delivery-note');
                const otpInput = document.getElementById('auth-otp-input');
                if (phoneDisplay) phoneDisplay.textContent = state.pendingOtpPhone;
                if (noteEl && res.message) noteEl.textContent = res.message;
                if (otpInput) otpInput.value = '';
                setAuthFormMode('otp');
                showToast('One Time Password sent to WhatsApp');
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.classList.remove('hidden');
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg><span>Send WhatsApp OTP &amp; Verify</span>';
                }
            }
        });

        document.getElementById('auth-login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('auth-login-error');
            const submitBtn = document.getElementById('auth-login-submit-btn');
            if (errEl) errEl.classList.add('hidden');

            const fd = new FormData(e.target);
            const whatsappNumber = String(fd.get('whatsappNumber') || '').trim();
            const password = String(fd.get('password') || '');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing In...';
            }

            try {
                const res = await request('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ whatsappNumber, password })
                });
                if (res.requiresOtp) {
                    state.pendingOtpPhone = res.whatsappNumber || whatsappNumber;
                    const phoneDisplay = document.getElementById('auth-otp-phone-display');
                    if (phoneDisplay) phoneDisplay.textContent = state.pendingOtpPhone;
                    setAuthFormMode('otp');
                    showToast('Verification OTP sent to WhatsApp');
                    return;
                }
                if (res.token) {
                    localStorage.setItem('almumtaz_user_token', res.token);
                }
                state.customerUser = res.user;
                updateAuthUI();
                showToast(`Welcome back, ${res.user?.name || 'Customer'}!`);
                closeAuthModal();
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.classList.remove('hidden');
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg><span>Sign In</span>';
                }
            }
        });

        document.getElementById('auth-otp-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('auth-otp-error');
            const verifyBtn = document.getElementById('auth-otp-verify-btn');
            if (errEl) errEl.classList.add('hidden');

            const otp = String(document.getElementById('auth-otp-input')?.value || '').trim();
            if (!state.pendingOtpPhone) {
                setAuthFormMode('signup');
                return;
            }

            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verifying & Saving...';
            }

            try {
                const res = await request('/api/auth/verify-otp', {
                    method: 'POST',
                    body: JSON.stringify({ whatsappNumber: state.pendingOtpPhone, otp })
                });
                if (res.token) {
                    localStorage.setItem('almumtaz_user_token', res.token);
                }
                state.customerUser = {
                    ...(res.user || {}),
                    supabaseSynced: Boolean(res.supabaseSynced)
                };
                updateAuthUI();
                showToast(
                    res.supabaseSynced
                        ? 'WhatsApp verified & saved to Supabase!'
                        : 'WhatsApp verified & account saved!'
                );
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.classList.remove('hidden');
                }
            } finally {
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg><span>Verify OTP &amp; Save Account</span>';
                }
            }
        });

        document.getElementById('auth-otp-resend-btn')?.addEventListener('click', async () => {
            if (!state.pendingOtpPhone) return;
            const errEl = document.getElementById('auth-otp-error');
            if (errEl) errEl.classList.add('hidden');
            try {
                const res = await request('/api/auth/resend-otp', {
                    method: 'POST',
                    body: JSON.stringify({ whatsappNumber: state.pendingOtpPhone })
                });
                const noteEl = document.getElementById('auth-otp-delivery-note');
                if (noteEl && res.message) noteEl.textContent = res.message;
                showToast('Fresh OTP sent to WhatsApp');
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.message;
                    errEl.classList.remove('hidden');
                }
            }
        });

        document.getElementById('profile-logout-btn')?.addEventListener('click', async () => {
            try {
                await request('/api/auth/logout', { method: 'POST' });
            } catch (_) {}
            localStorage.removeItem('almumtaz_user_token');
            state.customerUser = null;
            state.authMode = 'login';
            updateAuthUI();
            showToast('Signed out');
        });

        document.getElementById('profile-checkout-btn')?.addEventListener('click', () => {
            closeAuthModal();
            prefillCheckoutFromCustomer();
            switchView('checkout');
        });

        document.getElementById('brand-home-btn')?.addEventListener('click', () => {
            resetFilters();
            switchView('store');
        });
        document.getElementById('back-to-store-btn')?.addEventListener('click', () => switchView('store'));
        document.getElementById('reset-category-btn')?.addEventListener('click', () => resetFilters({ animate: true }));
        document.getElementById('active-banner-reset-btn')?.addEventListener('click', () => resetFilters({ animate: true }));
        document.getElementById('clear-filters-btn')?.addEventListener('click', () => resetFilters({ animate: true }));

        document.getElementById('mobile-filter-toggle-btn')?.addEventListener('click', () => {
            const panel = document.getElementById('catalog-filters-panel');
            if (panel) panel.classList.toggle('hidden');
        });

        document.getElementById('wishlist-filter-btn')?.addEventListener('click', () => {
            state.wishlistOnly = !state.wishlistOnly;
            switchView('store');
            renderCatalog({ animate: true });
            promoteStoreSection(hasActiveSpotlightCollection() ? 'catalog' : 'default');
        });

        // Order Bag drawer controls
        const drawer = document.getElementById('cart-drawer-backdrop');
        document.getElementById('open-cart-btn')?.addEventListener('click', () => drawer.classList.remove('hidden'));
        document.getElementById('close-cart-btn')?.addEventListener('click', () => drawer.classList.add('hidden'));
        drawer?.addEventListener('click', (e) => {
            if (e.target === drawer) drawer.classList.add('hidden');
        });
        document.getElementById('proceed-checkout-btn')?.addEventListener('click', () => {
            drawer.classList.add('hidden');
            switchView('checkout');
        });

        // PDP close
        const pdpModal = document.getElementById('pdp-modal');
        document.getElementById('pdp-close-btn')?.addEventListener('click', () => pdpModal.classList.add('hidden'));
        pdpModal?.addEventListener('click', (e) => {
            if (e.target === pdpModal) pdpModal.classList.add('hidden');
        });

        // Animated Order Confirmation Pop-Up controls
        const orderPopupModal = document.getElementById('order-confirmed-popup-modal');
        document.getElementById('popup-copy-order-btn')?.addEventListener('click', async () => {
            const orderIdText = state.lastOrder?.orderId ||
                document.getElementById('popup-order-id')?.textContent?.replace(/^#/, '').trim() || '';
            if (!orderIdText) return;
            const ok = await copyTextToClipboard(orderIdText);
            const copyBtn = document.getElementById('popup-copy-order-btn');
            const label = copyBtn?.querySelector('span');
            if (ok && copyBtn) {
                if (label) label.textContent = 'Copied';
                copyBtn.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
                copyBtn.classList.add('border-emerald-300', 'bg-emerald-50', 'text-emerald-700');
                showToast(`Order ID ${orderIdText} copied to clipboard`);
                setTimeout(resetPopupCopyBtn, 2200);
            }
        });
        document.getElementById('popup-close-btn')?.addEventListener('click', () => {
            closeOrderConfirmedPopup();
            switchView('store');
        });
        document.getElementById('popup-continue-btn')?.addEventListener('click', () => {
            closeOrderConfirmedPopup();
            switchView('store');
        });
        document.getElementById('popup-track-btn')?.addEventListener('click', () => {
            closeOrderConfirmedPopup();
            switchView('track');
            if (state.lastOrder) {
                document.getElementById('track-order-input').value = state.lastOrder.orderId;
                lookupTrackingOrder(state.lastOrder.orderId);
            }
        });
        orderPopupModal?.addEventListener('click', (e) => {
            if (e.target === orderPopupModal) {
                closeOrderConfirmedPopup();
                switchView('store');
            }
        });

        // Filters
        document.getElementById('filter-category')?.addEventListener('change', (e) => {
            selectStoreCategory(e.target.value);
        });
        document.getElementById('filter-price-max')?.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            state.filters.maxPrice = val;
            document.getElementById('filter-price-label').textContent = val >= 300000 ? 'Any' : formatPkr(val);
            renderCatalog({ animate: true });
        });
        document.getElementById('filter-discount')?.addEventListener('change', (e) => {
            state.filters.minDiscount = e.target.value;
            renderCatalog({ animate: true });
            promoteStoreSection(hasActiveSpotlightCollection() ? 'catalog' : 'default');
        });
        document.getElementById('filter-tag')?.addEventListener('change', (e) => {
            state.filters.tag = e.target.value;
            renderCatalog({ animate: true });
            promoteStoreSection(hasActiveSpotlightCollection() ? 'catalog' : 'default');
        });
        document.getElementById('filter-instock')?.addEventListener('change', (e) => {
            state.filters.inStock = e.target.checked;
            renderCatalog({ animate: true });
        });
        document.getElementById('sort-products')?.addEventListener('change', (e) => {
            state.filters.sort = e.target.value;
            renderCatalog({ animate: true });
        });

        bindSearchSuggestions(document.getElementById('global-search-input'));
        bindSearchSuggestions(document.getElementById('mobile-search-input'));

        // Checkout dynamic estimate
        document.getElementById('co-city')?.addEventListener('change', refreshCheckoutSummary);
        document.getElementById('co-speed')?.addEventListener('change', refreshCheckoutSummary);

        // COD Checkout Submission -> Show Animated Confirmation Pop-up Modal
        document.getElementById('cod-checkout-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('checkout-error-msg');
            errEl.classList.add('hidden');

            const fd = new FormData(e.target);
            const payload = {
                customerName: fd.get('customerName'),
                whatsappNumber: fd.get('whatsappNumber'),
                city: fd.get('city'),
                deliverySpeed: fd.get('deliverySpeed'),
                shippingAddress: fd.get('shippingAddress'),
                nearestLandmark: fd.get('nearestLandmark'),
                orderNotes: fd.get('orderNotes'),
                items: state.cart
            };

            const btn = document.getElementById('place-cod-order-btn');
            btn.disabled = true;
            btn.textContent = 'Placing Order...';

            try {
                const res = await request('/api/orders/checkout', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                state.lastOrder = res.order;
                state.cart = [];
                saveCart();
                e.target.reset();
                loadBootstrap().catch(() => {});
                switchView('store');
                openOrderConfirmedPopup(res.order);
            } catch (err) {
                errEl.textContent = err.message;
                errEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg><span>Place COD Order</span>';
            }
        });

        // Order Tracking Form (supports ORD-2026-9336 or 9336)
        document.getElementById('track-order-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = document.getElementById('track-order-input').value;
            if (val) lookupTrackingOrder(val);
        });
    }

    window.AlMumtazApp = {
        switchView,
        showToast,
        openAuthModal,
        reloadBootstrap: loadBootstrap
    };

    function findProductBySlugOrId(slugOrId) {
        const clean = String(slugOrId || '').trim().toLowerCase();
        if (!clean) return null;
        return state.products.find((p) =>
            String(p.slug || '').toLowerCase() === clean ||
            String(p.id) === clean ||
            String(p.sku || '').toLowerCase() === clean
        ) || null;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        bindEvents();
        updateCartBadges();
        saveWishlist();
        startCountdown();
        loadAuthSession();

        try {
            await loadBootstrap();
        } catch (err) {
            showToast(err.message, true);
        }

        const pathname = window.location.pathname;
        const trackMatch = pathname.match(/^\/track\/([A-Za-z0-9_-]+)/i);
        const itemMatch = pathname.match(/^\/(?:item|product)\/([A-Za-z0-9_-]+)/i);
        const checkoutMatch = pathname.match(/^\/checkout\/([A-Za-z0-9_-]+)/i);
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        const urlOrderId = trackMatch ? decodeURIComponent(trackMatch[1]) : (params.get('orderId') || '');
        const urlItemSlug = itemMatch ? decodeURIComponent(itemMatch[1]) : (params.get('item') || params.get('product') || '');
        const urlCheckoutSlug = checkoutMatch ? decodeURIComponent(checkoutMatch[1]) : (params.get('checkout') || '');

        if (trackMatch || tab === 'track') {
            switchView('track');
            if (urlOrderId) {
                const trackInp = document.getElementById('track-order-input');
                if (trackInp) trackInp.value = urlOrderId;
                lookupTrackingOrder(urlOrderId);
            }
        } else if (urlCheckoutSlug) {
            const prod = findProductBySlugOrId(urlCheckoutSlug);
            if (prod) {
                const alreadyInCart = state.cart.some((c) => Number(c.productId) === Number(prod.id));
                if (!alreadyInCart) {
                    addToCart(prod, 1, state.cardVariantMap[prod.id] || '');
                }
            }
            switchView('checkout');
        } else if (urlItemSlug) {
            const prod = findProductBySlugOrId(urlItemSlug);
            if (prod) {
                openProductDetailModal(prod);
            }
        } else if (tab === 'checkout') {
            switchView('checkout');
        } else if (params.get('login') === '1' || params.get('auth') === '1') {
            openAuthModal('signup');
        }

        // Silent background keep-alive ping to prevent bot & backend sleep
        setInterval(() => {
            fetch('/api/keepalive', { cache: 'no-store' }).catch(() => {});
        }, 20000);
    });
})();
