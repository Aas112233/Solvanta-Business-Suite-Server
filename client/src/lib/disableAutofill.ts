function shouldTreatAsEmailInput(input: HTMLInputElement) {
    const type = (input.getAttribute('type') || '').toLowerCase();
    if (type === 'email') return true;

    const name = (input.getAttribute('name') || '').toLowerCase();
    const id = (input.getAttribute('id') || '').toLowerCase();
    const marker = `${name} ${id}`;
    return marker.includes('email') || marker.includes('username') || marker.includes('login');
}

function shouldTreatAsPasswordInput(input: HTMLInputElement) {
    const type = (input.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return true;

    const name = (input.getAttribute('name') || '').toLowerCase();
    const id = (input.getAttribute('id') || '').toLowerCase();
    const marker = `${name} ${id}`;
    return marker.includes('password') || marker.includes('passcode') || marker.includes('secret');
}

function hardenInputAutocomplete(input: HTMLInputElement) {
    if (shouldTreatAsEmailInput(input)) {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('data-form-type', 'other');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
    }

    if (shouldTreatAsPasswordInput(input)) {
        input.setAttribute('autocomplete', 'new-password');
        input.setAttribute('data-form-type', 'other');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
    }
}

function hardenAllForms(root: ParentNode = document) {
    root.querySelectorAll('form').forEach((form) => {
        form.setAttribute('autocomplete', 'off');
    });

    root.querySelectorAll('input').forEach((el) => {
        if (el instanceof HTMLInputElement) {
            hardenInputAutocomplete(el);
        }
    });
}

export function installGlobalAutofillBlocker() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

    hardenAllForms();

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches('form')) {
                    node.setAttribute('autocomplete', 'off');
                }
                if (node.matches('input') && node instanceof HTMLInputElement) {
                    hardenInputAutocomplete(node);
                }
                hardenAllForms(node);
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    const focusInHandler = (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            hardenInputAutocomplete(target);
        }
    };

    document.addEventListener(
        'focusin',
        focusInHandler,
        true,
    );

    return () => {
        observer.disconnect();
        document.removeEventListener('focusin', focusInHandler, true);
    };
}
