'use strict';

window.AlMumtazAPI = {
    async request(url, options = {}) {
        const extraHeaders = { ...(options.headers || {}) };
        if (!extraHeaders.Authorization && !extraHeaders.authorization) {
            try {
                const customerToken = localStorage.getItem('almumtaz_user_token');
                if (customerToken && customerToken.startsWith('usr_')) {
                    extraHeaders.Authorization = `Bearer ${customerToken}`;
                }
            } catch (_) {}
        }
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...extraHeaders
            }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }
        return data;
    },

    formatPkr(amount) {
        const num = Math.max(0, Math.round(Number(amount) || 0));
        return `Rs. ${num.toLocaleString('en-PK')}`;
    },

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
