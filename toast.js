// ============================================================
//  toast.js — Lightweight toast notification utility.
//  Usage:  toast('Profile saved!', 'success')
//          toast('Something went wrong.', 'error')
//          toast('Loading…', 'info')
// ============================================================

(function () {
    // Inject styles once
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            #toast-container {
                position: fixed;
                bottom: 28px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                z-index: 9999;
                pointer-events: none;
            }
            .toast {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                padding: 12px 20px;
                border-radius: 100px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-size: 14px;
                font-weight: 600;
                backdrop-filter: blur(16px);
                border: 1px solid transparent;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                opacity: 0;
                transform: translateY(12px);
                transition: opacity 0.25s ease, transform 0.25s ease;
                pointer-events: auto;
                max-width: 420px;
                text-align: center;
            }
            .toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .toast.success {
                background: rgba(16, 185, 129, 0.15);
                border-color: rgba(16, 185, 129, 0.35);
                color: #6ee7b7;
            }
            .toast.error {
                background: rgba(239, 68, 68, 0.15);
                border-color: rgba(239, 68, 68, 0.35);
                color: #fca5a5;
            }
            .toast.info {
                background: rgba(59, 130, 246, 0.12);
                border-color: rgba(59, 130, 246, 0.3);
                color: #93c5fd;
            }
        `;
        document.head.appendChild(style);
    }

    // Create container
    function getContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    const ICONS = { success: '✓', error: '✕', info: 'ℹ' };

    window.toast = function (message, type = 'info', durationMs = 3500) {
        const container = getContainer();
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<span>${ICONS[type] || ''}</span><span>${message}</span>`;
        container.appendChild(el);

        // Trigger animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('show'));
        });

        // Auto-remove
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, durationMs);
    };
})();