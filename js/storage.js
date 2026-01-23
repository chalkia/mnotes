/* =========================================
   STORAGE & USER STATUS MANAGEMENT
   ========================================= */

// --- GLOBAL STATE ---
var library = [];
var visiblePlaylist = [];
var currentSongId = null;

// State for Transpose/Capo
var state = {
    t: 0, // Transpose
    c: 0, // Capo
    meta: {},
    parsedChords: []
};

// --- USER STATUS (FREEMIUM MODEL) ---
const savedStatus = localStorage.getItem('mnotes_premium_status');
const isPremiumInitial = (savedStatus === 'true');

var USER_STATUS = {
    isPremium: isPremiumInitial,
    freeLimit: 5 // Max unlocked songs for free users (excluding Demo)
};

// --- LOCK CHECKER ---
function isSongLocked(song) {
    if (!song) return false;

    // If User is Premium, nothing is locked
    if (USER_STATUS.isPremium) return false;

    // If User is Free, check the specific song flag
    return song.isLocked === true;
}

// --- ADMIN TOGGLE ---
function setPremiumStatus(isActive) {
    USER_STATUS.isPremium = isActive;
    localStorage.setItem('mnotes_premium_status', isActive);
    
    // Reload to apply changes cleanly
    window.location.reload();
}
