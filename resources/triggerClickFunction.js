(() => {
    const script = document.currentScript;
    const targetId = script.dataset.targetId;
    const targetName = script.dataset.targetName;

    const iframe = document.getElementsByTagName('iframe')[0];
    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    let el = targetId ? doc.getElementById(targetId) ?? document.getElementById(targetId) : null;
    if (!el && targetName) {
        el = doc.querySelector(`[name="${targetName}"]`);
    }

    if (el) {
        el.click();
    }
})();
