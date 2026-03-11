/* ===========================================================
   mNotes Pro - BAND MANAGER LOGIC (bandManager.js)
   Διαχειρίζεται αποκλειστικά τα μέλη, τη δημιουργία και 
   τα δικαιώματα (Roles) των ομάδων (Bands).
   =========================================================== */

/**
 * 1. Εμφάνιση του Band Dashboard (Αντικαθιστά την renderBandManager)
 * Ενοποιεί τη δημιουργία (Personal) και τη διαχείριση (Band)
 */
async function loadBandDashboard() {
    const container = document.getElementById('bandManagerContent');
    if (!container) return;

    // --- ΣΕΝΑΡΙΟ 1: PERSONAL CONTEXT (Δημιουργία) ---
    if (currentGroupId === 'personal') {
        container.innerHTML = `
            <div style="text-align:center; padding:20px 10px;">
                <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:15px;">
                    Διαχειριστείτε τις μπάντες σας ή δημιουργήστε καινούργια.
                </p>
                <button onclick="createNewBandUI()" class="footer-btn" style="width:100%; justify-content:center; background:var(--accent); color:#000; font-weight:bold;">
                    <i class="fas fa-plus-circle"></i> Create New Band
                </button>
            </div>
        `;
        return;
    }

    // --- ΣΕΝΑΡΙΟ 2: BAND CONTEXT (Διαχείριση) ---
    container.innerHTML = '<p class="loading-text" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Φόρτωση δεδομένων...</p>';

    try {
        // Α. Ανάκτηση στοιχείων της μπάντας (Κωδικός πρόσκλησης)
        const { data: groupData, error: groupErr } = await supabaseClient
            .from('groups')
            .select('invite_code')
            .eq('id', currentGroupId)
            .single();

        if (groupErr) throw groupErr;

        // Β. Ανάκτηση μελών με αυτόματο Join στο profiles (για email/username)
        const { data: members, error: memErr } = await supabaseClient
            .from('group_members')
            .select(`role, user_id, profiles ( username, email )`)
            .eq('group_id', currentGroupId);

        if (memErr) throw memErr;

        const isOwner = (currentRole === 'owner' || currentRole === 'admin');
        const MAX_BAND_MEMBERS = 5; 
        const currentCount = members.length;
        const hasAvailableSlots = currentCount < MAX_BAND_MEMBERS;

        // Γ. Χτίσιμο του HTML
        let html = `<div class="band-dashboard">`;

        // Λίστα Μελών
        html += `<div class="band-stat" style="margin-bottom:10px; font-weight:bold;">MEMBERS: ${currentCount} / ${MAX_BAND_MEMBERS}</div>`;
        html += `<div class="member-list">`;

        members.forEach(m => {
            let displayName = m.profiles?.username || (m.profiles?.email ? m.profiles.email.split('@')[0] : "User " + m.user_id.slice(0,4));
            const roleIcon = m.role === 'owner' ? '👑' : '🎸';
            const isMe = (m.user_id === currentUser.id);

            html += `
                <div id="member-card-${m.user_id}" class="member-item ${m.role}">
                    <div style="overflow:hidden; text-overflow:ellipsis;">
                        <span title="${m.role}">${roleIcon}</span> 
                        ${isMe ? '<strong>Εσύ</strong>' : displayName}
                    </div>`;
            
            // Το κουμπί αποβολής εμφανίζεται μόνο αν είμαστε owner/admin και δεν πρόκειται για τον εαυτό μας
            if (isOwner && !isMe) {
                html += `
                    <button onclick="expelMember('${currentGroupId}', '${m.user_id}')" class="icon-btn danger" title="Αποβολή" style="padding:2px 6px; font-size:0.8rem;">
                        <i class="fas fa-user-times"></i>
                    </button>`;
            }
            html += `</div>`;
        });
        html += `</div>`; // Κλείσιμο λίστας

        // Εργαλεία Admin (Invite Code & Disband)
        if (isOwner) {
            html += `
                <div class="invite-box" style="margin-top:20px; text-align:center;">
                    <div style="font-size:0.8rem; text-transform:uppercase; color:var(--text-muted);">INVITE CODE</div>
                    <span class="invite-code-display" id="invCodeDisp" style="display:block; font-size:1.5rem; font-weight:bold; letter-spacing:2px; margin:5px 0;">${groupData.invite_code || "..."}</span>
                    <button onclick="copyInviteCode()" class="footer-btn small" style="margin:0 auto 10px auto;">
                        <i class="far fa-copy"></i> Copy Link
                    </button>
                    ${!hasAvailableSlots ? '<p style="color:var(--danger); font-size:0.8rem;">Η μπάντα είναι πλήρης.</p>' : ''}
                </div>
                <button onclick="deleteBand()" class="footer-btn danger-v2" style="width:100%; margin-top:15px;">
                    <i class="fas fa-bomb"></i> DISBAND GROUP
                </button>
            `;
            if (!groupData.invite_code) setTimeout(fetchInviteCode, 100); 
        } else {
            // Εργαλεία Απλού Μέλους
            html += `
                <button onclick="leaveBand()" class="footer-btn danger-v2" style="width:100%; margin-top:20px;">
                    <i class="fas fa-sign-out-alt"></i> LEAVE BAND
                </button>
            `;
        }
        
        html += `</div>`;
        container.innerHTML = html;

    } catch (err) {
        console.error("[BAND_DASHBOARD] Σφάλμα:", err.message);
        container.innerHTML = '<p class="error-text" style="color:var(--danger); text-align:center;">Σφάλμα φόρτωσης.</p>';
    }
}

/**
 * 2. Αποβολή Μέλους (Η νέα, ασφαλής έκδοση με RLS)
 */
async function expelMember(groupId, userIdToKick) {
    if (!confirm("Είστε σίγουροι ότι θέλετε να απομακρύνετε αυτό το μέλος; Τα προσωπικά του αρχεία θα παραμείνουν στη βιβλιοθήκη της μπάντας.")) return;

    try {
        const { error } = await supabaseClient
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userIdToKick);

        if (error) {
            console.error("[EXPEL] Σφάλμα:", error.message);
            showToast("Υπήρξε πρόβλημα κατά την αποβολή. Έλεγξε τα δικαιώματά σου.", "error");
            return;
        }

        const memberCard = document.getElementById(`member-card-${userIdToKick}`);
        if (memberCard) memberCard.remove();
        
        showToast("Το μέλος απομακρύνθηκε επιτυχώς.");
        
        // Προαιρετικό: Ξαναφορτώνουμε το dashboard για να ανανεωθούν τα νούμερα
        loadBandDashboard();

    } catch (err) {
        console.error("Απρόσμενο σφάλμα:", err);
    }
}

/**
 * 3. Οικειοθελής Αποχώρηση
 */
async function leaveBand() {
    if(!confirm("Θέλετε οριστικά να αποχωρήσετε από την μπάντα;")) return;
    await supabaseClient.from('group_members').delete().eq('group_id', currentGroupId).eq('user_id', currentUser.id);
    window.location.reload();
}

/**
 * 4. Δημιουργία Μπάντας
 */
async function createNewBandUI() {
    const tier = userProfile?.subscription_tier || 'free';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.free;
    const extraBandsAllowed = userProfile?.special_unlocks?.extra_bands || 0;
    const totalAllowedBands = config.maxBandsOwned + extraBandsAllowed;

    if (totalAllowedBands === 0) {
        promptUpgrade('Δημιουργία Μπάντας');
        return;
    }

    const myOwnedGroups = myGroups.filter(g => g.role === 'owner' || g.role === 'admin');
    if (myOwnedGroups.length >= totalAllowedBands) {
        promptUpgrade(`Όριο Μπαντών (${totalAllowedBands})`);
        return;
    }

    const name = prompt("Όνομα νέας μπάντας:");
    if(!name) return;

    const { data, error } = await supabaseClient.from('groups').insert([{ name: name, owner_id: currentUser.id }]).select();

    if(error) { 
        if (error.code === '23505') alert("⚠️ Αυτό το όνομα μπάντας χρησιμοποιείται ήδη!");
        else { console.error(error); showToast("Σφάλμα κατά τη δημιουργία", "error"); }
        return; 
    }

    const newGroupId = data[0].id;
    await supabaseClient.from('group_members').insert([{ group_id: newGroupId, user_id: currentUser.id, role: 'owner' }]);

    // Προσθήκη Demo (Βεβαιώσου ότι το DEFAULT_DEMO_SONGS υπάρχει)
    if (typeof DEFAULT_DEMO_SONGS !== 'undefined') {
        const bandDemoSongs = DEFAULT_DEMO_SONGS.map((ds, idx) => ({
            ...ds,
            id: "s_" + Date.now() + idx + Math.random().toString(16).slice(2),
            user_id: currentUser.id,
            group_id: newGroupId
        }));
        await supabaseClient.from('songs').insert(bandDemoSongs);
    }

    showToast("Band Created! 🎉");
    window.location.reload(); 
}

/**
 * 5. Ανάκτηση & Αντιγραφή Κωδικού (Invite Code)
 */
async function fetchInviteCode() {
    const { data, error } = await supabaseClient.from('groups').select('invite_code').eq('id', currentGroupId).single();
        
    if(data) {
        let code = data.invite_code;
        if(!code) {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
            await supabaseClient.from('groups').update({ invite_code: code }).eq('id', currentGroupId);
        }
        const el = document.getElementById('invCodeDisp');
        if(el) el.innerText = code;
    }
}

function copyInviteCode() {
    const codeEl = document.getElementById('invCodeDisp');
    if (!codeEl) return;
    const link = `${window.location.origin}?join=${codeEl.innerText}`;
    navigator.clipboard.writeText(link);
    showToast("Invite Link Copied! 📋");
}

/**
 * 6. Οριστική Διάλυση Μπάντας
 */
async function deleteBand() {
    const conf = prompt("ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα δεδομένα της μπάντας.\nΓράψτε 'DELETE' για επιβεβαίωση:");
    if(conf === 'DELETE') {
        await supabaseClient.from('groups').delete().eq('id', currentGroupId);
        window.location.reload();
    }
}
