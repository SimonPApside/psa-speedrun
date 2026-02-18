function loadRestForm() {
    const iframe = document.getElementsByTagName('iframe')[0];
    const doc = iframe.contentWindow.document;
    const link = doc.getElementById('UC_EX_WRK_UC_TI_FRA_LINK');
    link.click();
}

loadRestForm();