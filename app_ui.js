// --- app_ui.js (DMS 4.0 UI Motion / Button Feedback / Mobile Nav) ---
(function () {
    const css = `
        @keyframes dmsPageIn { from { opacity: 0; transform: translateY(10px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
        @keyframes dmsCardIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes dmsOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dmsSpin { to { transform: rotate(360deg); } }
        @keyframes dmsToastIn { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        html { scroll-behavior: smooth; }
        body { animation: dmsPageIn .38s ease-out both; }
        main > * { animation: dmsCardIn .45s ease-out both; }
        main > *:nth-child(2) { animation-delay: .04s; }
        main > *:nth-child(3) { animation-delay: .08s; }
        main > *:nth-child(4) { animation-delay: .12s; }
        .cyber-card, .dms-motion-card { transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease, background-color .22s ease; }
        .cyber-card:hover { transform: translateY(-2px); border-color: rgba(59,130,246,.35); box-shadow: 0 18px 42px rgba(15,23,42,.28), 0 0 18px rgba(59,130,246,.08); }
        button, a, select, input, textarea { transition-duration: .18s; }
        button:not(:disabled), a[href] { cursor: pointer; }
        button:active, a[href]:active { transform: scale(.975); }
        .dms-ripple-host { position: relative; overflow: hidden; }
        .dms-ripple { position: absolute; border-radius: 9999px; pointer-events: none; transform: scale(0); animation: dmsRipple .55s ease-out; background: rgba(255,255,255,.25); }
        @keyframes dmsRipple { to { transform: scale(4); opacity: 0; } }
        .dms-page-cover { position: fixed; inset: 0; z-index: 9998; background: radial-gradient(circle at 50% 35%, rgba(59,130,246,.22), rgba(15,23,42,.96) 55%, #020617 100%); opacity: 0; pointer-events: none; display: flex; align-items: center; justify-content: center; transition: opacity .22s ease; }
        .dms-page-cover.show { opacity: 1; pointer-events: auto; }
        .dms-loader { width: 38px; height: 38px; border-radius: 9999px; border: 3px solid rgba(148,163,184,.24); border-top-color: #3b82f6; animation: dmsSpin .7s linear infinite; box-shadow: 0 0 24px rgba(59,130,246,.35); }
        .dms-toast-wrap { position: fixed; top: 18px; right: 18px; z-index: 10000; display: grid; gap: 10px; max-width: min(420px, calc(100vw - 28px)); }
        .dms-toast { animation: dmsToastIn .2s ease-out both; border-radius: 14px; padding: 12px 14px; font-size: 12px; font-weight: 700; background: rgba(15,23,42,.96); border: 1px solid rgba(51,65,85,.95); color: #cbd5e1; box-shadow: 0 18px 40px rgba(2,6,23,.35); }
        .dms-toast.success { color: #34d399; border-color: rgba(52,211,153,.35); background: rgba(6,78,59,.24); }
        .dms-toast.error { color: #fb7185; border-color: rgba(251,113,133,.35); background: rgba(127,29,29,.24); }
        .dms-toast.info { color: #60a5fa; border-color: rgba(96,165,250,.35); background: rgba(30,58,138,.24); }
        .dms-mobile-nav { display: none; }
        @media (max-width: 1279px) {
            body:has(.dms-mobile-nav) { padding-bottom: 82px; }
            .dms-mobile-nav { display: flex; position: fixed; left: 10px; right: 10px; bottom: 10px; z-index: 60; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 8px; border: 1px solid rgba(30,41,59,.95); border-radius: 20px; background: rgba(15,23,42,.94); backdrop-filter: blur(18px); box-shadow: 0 16px 42px rgba(2,6,23,.55); }
            .dms-mobile-nav::-webkit-scrollbar { display: none; }
            .dms-mobile-nav a { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-width: 70px; padding: 9px 10px; border-radius: 14px; color: #94a3b8; font-size: 10px; font-weight: 700; white-space: nowrap; }
            .dms-mobile-nav a i { font-size: 15px; margin: 0 !important; }
            .dms-mobile-nav a.active { color: #60a5fa; background: rgba(37,99,235,.18); border: 1px solid rgba(59,130,246,.35); box-shadow: 0 0 16px rgba(59,130,246,.16); }
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
        }
    `;

    function injectStyles() {
        if (document.getElementById('dms-ui-motion-style')) return;
        const style = document.createElement('style');
        style.id = 'dms-ui-motion-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function ensureOverlay() {
        let overlay = document.querySelector('.dms-page-cover');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'dms-page-cover';
            overlay.innerHTML = '<div class="dms-loader" aria-label="Loading"></div>';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function showPageOverlay() {
        const overlay = ensureOverlay();
        overlay.classList.add('show');
    }

    function wirePageTransitions() {
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || link.target === '_blank') return;
            link.addEventListener('click', event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin || url.href === window.location.href) return;
                event.preventDefault();
                showPageOverlay();
                window.setTimeout(() => { window.location.href = url.href; }, 180);
            });
        });
    }

    function wireRipples() {
        document.addEventListener('click', event => {
            const target = event.target.closest('button, a[href]');
            if (!target || target.disabled) return;
            target.classList.add('dms-ripple-host');
            const rect = target.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ripple = document.createElement('span');
            ripple.className = 'dms-ripple';
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
            target.appendChild(ripple);
            window.setTimeout(() => ripple.remove(), 600);
        });
    }

    function buildMobileNav() {
        const mainNav = document.getElementById('main-nav');
        if (!mainNav || document.querySelector('.dms-mobile-nav')) return;

        const role = localStorage.getItem('user_role');
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const nav = document.createElement('nav');
        nav.className = 'dms-mobile-nav';
        nav.setAttribute('aria-label', 'Mobile navigation');

        mainNav.querySelectorAll('a[href]').forEach(link => {
            const roles = link.getAttribute('data-roles');
            if (roles && role && !roles.split(',').includes(role)) return;
            const clone = link.cloneNode(true);
            clone.removeAttribute('class');
            clone.className = clone.getAttribute('href') === currentPage ? 'active' : '';
            nav.appendChild(clone);
        });

        if (nav.children.length > 0) document.body.appendChild(nav);
    }

    window.showToast = function (message, type = 'info') {
        let wrap = document.querySelector('.dms-toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'dms-toast-wrap';
            document.body.appendChild(wrap);
        }
        const toast = document.createElement('div');
        toast.className = `dms-toast ${type}`;
        toast.textContent = message;
        wrap.appendChild(toast);
        window.setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-8px) scale(.98)';
            window.setTimeout(() => toast.remove(), 180);
        }, 2800);
    };

    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        ensureOverlay();
        buildMobileNav();
        wirePageTransitions();
        wireRipples();
    });
})();
