/* ===========================================================
   mNotes Pro - BAND MANAGER LOGIC (bandManager.js)
   Διαχειρίζεται αποκλειστικά τα μέλη, τη δημιουργία και 
   τα δικαιώματα (Roles) των ομάδων (Bands).
   =========================================================== */

/**
 * 1. Εμφάνιση του Band Dashboard (Με σύστημα Sponsored Tickets)
 */
async function loadBandDashboard() {
    const container = document.getElementById('bandManagerContent');
    if (!container) return;

    // --- ΣΕΝΑΡΙΟ 1: PERSONAL CONTEXT ---
    if (currentGroupId === 'personal') {
        container.innerHTML = `
            <div style="text-align:center; padding:20px 10px;">
                <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:15px;">
                    Διαχειριστείτε τις μπάντες σας ή συνδεθείτε σε μια υπάρχουσα.
                </p>
                <button onclick="createNewBandUI()" class="footer-btn" style="width:100%; justify-content:center; background:var(--accent); color:#000; font-weight:bold; margin-bottom:10px;">
                    <i class="fas fa-plus-circle"></i> Create New Band
                </button>
                <button onclick="joinBandWithCode()" class="footer-btn" style="width:100%; justify-content:center; background:transparent; border: 1px solid var(--accent); color:var(--accent);">
                    <i class="fas fa-sign-in-alt"></i> Join with Code
                </button>
            </div>
        `;
        return;
    }
    
    // --- ΣΕΝΑΡΙΟ 2: BAND CONTEXT ---
    container.innerHTML = '<p class="loading-text" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Φόρτωση δεδομένων...</p>';

    try {
        const { data: groupData, error: groupErr } = await supabaseClient.from('groups').select('invite_code').eq('id', currentGroupId).single();
        if (groupErr) throw groupErr;

        // Ζητάμε πλέον ΚΑΙ το is_sponsored
        const { data: members, error: memErr } = await supabaseClient
            .from('group_members')
            .select(`role, user_id, is_sponsored, profiles ( username, email, subscription_tier )`)
            .eq('group_id', currentGroupId);
        if (memErr) throw memErr;

        const isOwner = (currentRole === 'owner' || currentRole === 'admin');
        const currentCount = members.length;
        
        // --- ΜΑΘΗΜΑΤΙΚΑ ΓΙΑ ΤΑ ΕΙΣΙΤΗΡΙΑ (TICKETS) ---
        let totalTickets = 0;
        let usedTickets = 0;
        
        const ownerMember = members.find(m => m.role === 'owner');
        if (ownerMember && ownerMember.profiles) {
            const tempOwnerProfile = { subscription_tier: ownerMember.profiles.subscription_tier };
            const baseConf = TIER_CONFIG[tempOwnerProfile.subscription_tier] || TIER_CONFIG['band_leader'];
            totalTickets = baseConf.includedBandMates || 0;
        }
        
        usedTickets = members.filter(m => m.is_sponsored).length;

        // Δ. Χτίσιμο του HTML
        let html = `<div class="band-dashboard">`;
        html += `<div class="band-stat" style="margin-bottom:5px; font-weight:bold; font-size:1.1rem;">👥 MEMBERS: ${currentCount}</div>`;
        
        // Εμφάνιση μετρητή Εισιτηρίων μόνο αν ο Leader δικαιούται
        if (totalTickets > 0) {
            html += `<div style="margin-bottom:15px; font-size:0.9rem; color:var(--accent); font-weight:bold;">🎫 SPONSORED SEATS: ${usedTickets} / ${totalTickets}</div>`;
        } else {
            html += `<div style="margin-bottom:15px;"></div>`;
        }

        html += `<div class="member-list">`;

        members.forEach(m => {
            let displayName = m.profiles?.username || (m.profiles?.email ? m.profiles.email.split('@')[0] : "User " + m.user_id.slice(0,4));
            const roleIcon = m.role === 'owner' ? '👑' : '🎸';
            const isMe = (m.user_id === currentUser.id);

            // Γραφικά για το αν έχει εισιτήριο
            const ticketBadge = m.is_sponsored ? `<span style="font-size:0.7rem; background:var(--accent); color:#000; padding:2px 5px; border-radius:4px; margin-left:5px;">🎫 VIP</span>` : '';

            html += `
                <div id="member-card-${m.user_id}" class="member-item ${m.role}">
                    <div style="overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center;">
                        <span title="${m.role}">${roleIcon}</span> 
                        <span style="margin-left:5px;">${isMe ? '<strong>Εσύ</strong>' : displayName}</span>
                        ${ticketBadge}
                    </div>
                    <div style="display:flex; gap:5px;">`;
            
            // Εργαλεία Διαχείρισης Μέλους (Μόνο ο Owner τα βλέπει, και όχι για τον εαυτό του)
            if (isOwner && !isMe) {
                const targetTier = m.profiles?.subscription_tier || 'solo_free';
                const isSelfPaid = (targetTier !== 'solo_free'); // Αν πληρώνει δική του συνδρομή
            
                // Εμφάνιση κουμπιού Εισιτηρίου ΜΟΝΟ αν ο χρήστης είναι Free
                // Αν είναι ήδη Band Mate / Maestro, δεν του χρειάζεται εισιτήριο.
                if (totalTickets > 0 && !isSelfPaid) {
                    const ticketIcon = m.is_sponsored ? 'fas fa-ticket-alt' : 'fas fa-plus';
                    const ticketColor = m.is_sponsored ? '#ff9800' : '#4db6ac';
                    const ticketTitle = m.is_sponsored ? 'Αφαίρεση Εισιτηρίου' : 'Παροχή Εισιτηρίου';
                    
                    html += `
                        <button onclick="toggleMemberTicket('${m.user_id}', ${m.is_sponsored}, ${usedTickets}, ${totalTickets})" class="icon-btn" title="${ticketTitle}" style="padding:2px 6px; font-size:0.8rem; color:${ticketColor}; border:1px solid ${ticketColor};">
                            <i class="${ticketIcon}"></i>
                        </button>`;
                } else if (isSelfPaid) {
                    // Προαιρετικά: Ένα εικονίδιο που δείχνει ότι ο χρήστης είναι αυτόνομος
                    html += `<span title="Αυτοχρηματοδοτούμενο Μέλος" style="font-size:0.8rem; color:var(--text-muted); padding:0 5px;"><i class="fas fa-check-double"></i></span>`;
                }
                
                // Κουμπί Αποβολής (Παραμένει πάντα για τον Owner)
                html += `
                    <button onclick="expelMember('${currentGroupId}', '${m.user_id}')" class="icon-btn danger" title="Αποβολή" style="padding:2px 6px; font-size:0.8rem;">
                        <i class="fas fa-user-times"></i>
                    </button>`;
            }
            html += `</div></div>`;
        });
        html += `</div>`; // Κλείσιμο λίστας

        // Εργαλεία Leader (Invite Code, Disband)
        if (isOwner) {
            html += `
                <div class="invite-box" style="margin-top:20px; text-align:center;">
                    <div style="font-size:0.8rem; text-transform:uppercase; color:var(--text-muted);">INVITE CODE</div>
                    <span class="invite-code-display" id="invCodeDisp" style="display:block; font-size:1.5rem; font-weight:bold; letter-spacing:2px; margin:5px 0;">${groupData.invite_code || "..."}</span>
                    <button onclick="copyInviteCode()" class="footer-btn small" style="margin:0 auto 10px auto;">
                        <i class="far fa-copy"></i> Copy Link
                    </button>
                </div>
                <button onclick="deleteBand()" class="footer-btn danger-v2" style="width:100%; margin-top:15px;">
                    <i class="fas fa-bomb"></i> DISBAND GROUP
                </button>
            `;
            if (!groupData.invite_code) setTimeout(fetchInviteCode, 100); 
        } else {
            // Εργαλεία Απλού Μέλους (Η Οικειοθελής Αποχώρηση που ζήτησες!)
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
 * 1.5. Διαχείριση Προπληρωμένων Εισιτηρίων (Sponsored Seats)
 */
async function toggleMemberTicket(targetUserId, currentlySponsored, usedTickets, totalTickets) {
    // Αν πάει να δώσει νέο εισιτήριο, αλλά τα έχει εξαντλήσει
    if (!currentlySponsored && usedTickets >= totalTickets) {
        if (typeof showToast === 'function') showToast("Έχετε εξαντλήσει τα διαθέσιμα εισιτήρια του πακέτου σας!", "error");
        console.log("🎟️ [TICKETS] Αποτυχία: Εξαντλημένα όρια.");
        return;
    }

    const newStatus = !currentlySponsored;
    console.log(`🎟️ [TICKETS] Ενημέρωση μέλους ${targetUserId}: Sponsored = ${newStatus}`);

    try {
        const { error } = await supabaseClient
            .from('group_members')
            .update({ is_sponsored: newStatus })
            .eq('group_id', currentGroupId)
            .eq('user_id', targetUserId);

        if (error) throw error;
        
        if (typeof showToast === 'function') {
            showToast(newStatus ? "Το εισιτήριο δόθηκε! 🎫" : "Το εισιτήριο αφαιρέθηκε.");
        }
        
        // Ξαναφορτώνουμε το dashboard για να ενημερωθούν τα νούμερα και τα κουμπιά
        loadBandDashboard();
        
    } catch (err) {
        console.error("🎟️ [TICKETS] Σφάλμα Database:", err.message);
        if (typeof showToast === 'function') showToast("Σφάλμα κατά την ενημέρωση του εισιτηρίου.", "error");
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
    // 1. Βρίσκουμε πόσες μπάντες κατέχει ΗΔΗ ο χρήστης
    const myOwnedGroups = myGroups.filter(g => g.role === 'owner' || g.role === 'admin').length;
    
    // 2. Ρωτάμε τον Πορτιέρη αν δικαιούται κι άλλη
    if (!canUserPerform('CREATE_BAND', myOwnedGroups)) {
        if (typeof promptUpgrade === 'function') {
            promptUpgrade('Όριο Δημιουργίας Μπαντών');
        } else {
            showToast("Έχετε φτάσει το όριο των συγκροτημάτων για το πακέτο σας.", "error");
        }
        return;
    }

    const name = prompt("Όνομα νέας μπάντας:");
    if(!name) return;

    try {
        const { data, error } = await supabaseClient.from('groups').insert([{ name: name, owner_id: currentUser.id }]).select();
        
        if (error) { 
            if (error.code === '23505') alert("⚠️ Αυτό το όνομα μπάντας χρησιμοποιείται ήδη!");
            else throw error;
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
        
    } catch (err) {
        console.error(err); 
        showToast("Σφάλμα κατά τη δημιουργία", "error");
    }
}

/**
 * 5. Ένταξη σε υπάρχουσα Μπάντα (με Invite Code)
 */
async function joinBandWithCode() {
    // 1. Μπορεί ο χρήστης γενικά να μπει σε μπάντες;
    if (!canUserPerform('JOIN_BANDS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Συμμετοχή σε Μπάντα');
        return;
    }

    const code = prompt("Εισάγετε τον κωδικό πρόσκλησης (Invite Code):");
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();

    try {
        const { data: groupData, error: groupErr } = await supabaseClient
            .from('groups').select('id, name, owner_id').eq('invite_code', cleanCode).single();

        if (groupErr || !groupData) {
            showToast("Ο κωδικός δεν είναι έγκυρος.", "error");
            return;
        }

        // 2. Δυναμικός Έλεγχος Χωρητικότητας της Μπάντας (βάσει του ιδιοκτήτη)
        const { data: ownerData } = await supabaseClient
            .from('profiles').select('subscription_tier, special_unlocks').eq('id', groupData.owner_id).maybeSingle();

        let maxMembers = 10; // Default
        if (ownerData) {
            const baseConf = TIER_CONFIG[ownerData.subscription_tier] || TIER_CONFIG['band_leader'];
            const extraSlots = ownerData.special_unlocks?.extra_band_mates || 0;
            maxMembers = (baseConf.includedBandMates || 0) + parseInt(extraSlots, 10) + 1; // +1 για τον owner
        }

        const { data: currentMembers, error: countErr } = await supabaseClient
            .from('group_members').select('id').eq('group_id', groupData.id);
        
        if (!countErr && currentMembers.length >= maxMembers) {
            alert(`Λυπούμαστε, η μπάντα "${groupData.name}" είναι πλήρης (${maxMembers} μέλη).`);
            return;
        }

        // 3. Εγγραφή στη Μπάντα
        const { error: joinErr } = await supabaseClient
            .from('group_members').insert([{ group_id: groupData.id, user_id: currentUser.id, role: 'member' }]);

        if (joinErr) throw joinErr;
        
        showToast(`Καλώς ήρθατε στην μπάντα "${groupData.name}"! 🎉`);
        setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
        console.error("Join Error:", err);
        showToast("Σφάλμα κατά την ένταξη.", "error");
    }
}
/**
 * 6. Ανάκτηση & Αντιγραφή Κωδικού (Invite Code)
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
 * 7. Οριστική Διάλυση Μπάντας
 */
async function deleteBand() {
    const conf = prompt("ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα δεδομένα της μπάντας.\nΓράψτε 'DELETE' για επιβεβαίωση:");
    if(conf === 'DELETE') {
        await supabaseClient.from('groups').delete().eq('id', currentGroupId);
        window.location.reload();
    }
}
