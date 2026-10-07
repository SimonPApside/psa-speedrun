(() => {
    const script = document.currentScript;
    const targetId = script.dataset.targetId;
    const targetName = script.dataset.targetName;
    const targetSelector = script.dataset.targetSelector;

    const docs = [];
    const collectDocs = (doc) => {
        if (!doc || docs.includes(doc)) return;
        docs.push(doc);

        for (const frame of doc.querySelectorAll('iframe')) {
            try {
                collectDocs(frame.contentDocument ?? frame.contentWindow?.document);
            } catch {
                // Ignore frames that are not accessible from this page.
            }
        }
    };
    collectDocs(document);

    const el = docs.map(doc => {
        if (targetId) {
            const byId = doc.getElementById(targetId);
            if (byId) return byId;
        }
        if (targetName) {
            const byName = Array.from(doc.querySelectorAll('[name]'))
                .find(candidate => candidate.getAttribute('name') === targetName);
            if (byName) return byName;
        }
        return targetSelector ? doc.querySelector(targetSelector) : null;
    }).find(Boolean);

    if (el) {
        el.click();
    }
})();
