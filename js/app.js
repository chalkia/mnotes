/* =========================================
   APP INITIALIZATION
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    
    // PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
    }

    // Load Data & Theme
    if (typeof loadData === 'function') loadData();
    if (typeof loadSavedTheme === 'function') loadSavedTheme();

    // Init UI
    if (typeof renderSidebar === 'function') renderSidebar();
    
    // Event Listeners
    if (typeof setupAdminSwitch === 'function') setupAdminSwitch();
    if (typeof setupSidebarSwipe === 'function') setupSidebarSwipe();
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) document.getElementById('sidebar').classList.remove('active');
    });

    console.log("mNotes started.");
});
