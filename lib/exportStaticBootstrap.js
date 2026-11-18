'use strict';

const fs = require('fs');
const path = require('path');
const database = require('./database');

function exportStaticBootstrap() {
    const { config } = database.getAllVariables();
    const categories = database.getCategories();
    const products = database.getProducts({ sort: 'newest' });
    const featured = products.filter((p) => p.isFeatured);
    const flashDeals = products
        .filter((p) => p.isFlashSale || p.discountPercentage > 0)
        .sort((a, b) => b.discountPercentage - a.discountPercentage);

    const payload = {
        store: {
            name: config.storeName,
            city: config.storeCity,
            address: config.storeAddress,
            phone: config.storePhone,
            codFlatRate: config.codFlatRate,
            expressCodRate: config.expressCodRate,
            freeDeliveryThreshold: config.freeDeliveryThreshold,
            cityRates: config.cityRates
        },
        categories,
        products,
        featured,
        flashDeals
    };

    const outDir = path.join(__dirname, '..', 'public', 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'bootstrap.json');
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[build] Static bootstrap snapshot written to ${outFile} (${products.length} products, ${categories.length} categories)`);
}

if (require.main === module) {
    exportStaticBootstrap();
}

module.exports = { exportStaticBootstrap };
