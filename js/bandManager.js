/* ===========================================================
   mNotes Pro - BAND MANAGER LOGIC (bandManager.js)
   Διαχειρίζεται αποκλειστικά τα μέλη, τη δημιουργία, τα εισιτήρια
   (Sponsored Seats), τις προαγωγές και τη Μαύρη Λίστα.
   =========================================================== */

/**
 * 1. Εμφάνιση του Band Dashboard (Mε Σύστημα Sponsored & Banned)
 */
async function loadBandDashboard() {
    const container = document.getElementById('bandManagerContent');
    if (!container) return;

    // --- ΣΕΝΑΡΙΟ 1: PERSONAL CONTEXT ---
    if (currentGroupId === 'personal') {
        container.innerHTML = `
            <div style="text-align:center; padding:20px 10px;">
                <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:15px;">
                    ${currentLang === 'en' ? "Manage your bands or join an existing one." : "Διαχειριστείτε τις μπάντες σας ή συνδεθείτε σε μια υπάρχουσα."}
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
        console.log(`📡 [BAND MANAGER] Φόρτωση δεδομένων για μπάντα: ${currentGroupId}`);
        
        const { data: groupData, error: groupErr } = await supabaseClient.from('groups').select('invite_code').eq('id', currentGroupId).single();
        if (groupErr) throw groupErr;

        // Φέρνουμε ΜΟΝΟ τους ενεργούς χρήστες (όχι τους is_banned)
        const { data: members, error: memErr } = await supabaseClient
            .from('group_members')
            .select(`role, user_id, is_sponsored, is_banned, profiles ( username, email, subscription_tier )`)
            .eq('group_id', currentGroupId)
            .is('is_banned', false); 

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
        console.log(`📊 [TICKETS] Χρησιμοποιημένα: ${usedTickets} / ${totalTickets}`);

        // Δ. Χτίσιμο του HTML
        let html = `<div class="band-dashboard">`;

        // --- ΝΕΟ: ΚΟΥΜΠΙ MNOTES STUDIO (Ορατό μόνο στον Owner) ---
        if (currentRole === 'owner') {
            html += `
                <button onclick="showToast(currentLang === 'en' ? 'mNotes Studio: Coming Soon for Pro Users!' : 'mNotes Studio: Έρχεται σύντομα για Pro χρήστες!', 'info')" 
                        style="width: 100%; padding: 12px; margin-bottom: 15px; font-size: 1.05rem; font-weight: bold; background: var(--bg-panel); color: var(--text-main); border: 2px solid var(--accent); border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer; transition: 0.2s transform; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-desktop" style="color: var(--accent);"></i> 
                    <span>mStudio</span> 
                    <i class="fas fa-lock" style="font-size: 0.8rem; color: var(--text-muted);"></i>
                </button>
            `;
        }
        
        html += `<div class="band-stat" style="margin-bottom:5px; font-weight:bold; font-size:1.1rem;">👥 MEMBERS: ${currentCount}</div>`;
        
        if (totalTickets > 0) {
            html += `<div style="margin-bottom:15px; font-size:0.9rem; color:var(--accent); font-weight:bold;">🎫 SPONSORED SEATS: ${usedTickets} / ${totalTickets}</div>`;
        } else {
            html += `<div style="margin-bottom:15px;"></div>`;
        }

        html += `<div class="member-list">`;

        members.forEach(m => {
            let displayName = m.profiles?.username || (m.profiles?.email ? m.profiles.email.split('@')[0] : "User " + m.user_id.slice(0,4));
            let roleIcon = '🎸';
            
            // Γραφικά ρόλων
            if (m.role === 'owner') roleIcon = '👑';
            else if (m.role === 'admin') roleIcon = '⭐';
            else if (m.profiles?.subscription_tier === 'solo_free' && !m.is_sponsored) roleIcon = '👁️'; // Viewer

            const isMe = (m.user_id === currentUser.id);
            const ticketBadge = m.is_sponsored ? `<span style="font-size:0.7rem; background:var(--accent); color:#000; padding:2px 5px; border-radius:4px; margin-left:5px;">🎫 VIP</span>` : '';

            html += `
                <div id="member-card-${m.user_id}" class="member-item ${m.role}">
                    <div style="overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center;">
                        <span title="${m.role}">${roleIcon}</span> 
                        <span style="margin-left:5px;">${isMe ? '<strong>Εσύ</strong>' : displayName}</span>
                        ${ticketBadge}
                    </div>
                    <div style="display:flex; gap:5px;">`;
            
            // Εργαλεία Διαχείρισης Μέλους
            if (isOwner && !isMe) {
                const targetTier = m.profiles?.subscription_tier || 'solo_free';
                const isSelfPaid = (targetTier !== 'solo_free');

                // 1. Κουμπί Εισιτηρίου
                if (totalTickets > 0 && !isSelfPaid) {
                    const ticketIcon = m.is_sponsored ? 'fas fa-ticket-alt' : 'fas fa-plus';
                    const ticketColor = m.is_sponsored ? '#ff9800' : '#4db6ac';
                    html += `
                        <button onclick="toggleMemberTicket('${m.user_id}', ${m.is_sponsored}, ${usedTickets}, ${totalTickets})" class="icon-btn" title="Εισιτήριο" style="padding:2px 6px; font-size:0.8rem; color:${ticketColor}; border:1px solid ${ticketColor};">
                            <i class="${ticketIcon}"></i>
                        </button>`;
                } else if (isSelfPaid) {
                    html += `<span title="Αυτοχρηματοδοτούμενο Μέλος" style="font-size:0.8rem; color:var(--text-muted); padding:0 5px;"><i class="fas fa-check-double"></i></span>`;
                }
                
                // 2. Κουμπί Προαγωγής σε Leader
                if (currentRole === 'owner' && (m.role === 'member' || m.role === 'admin')) {
                    const promoIcon = m.role === 'admin' ? 'fas fa-arrow-down' : 'fas fa-arrow-up';
                    const promoColor = m.role === 'admin' ? '#f44336' : '#2196f3';
                    const promoTitle = m.role === 'admin' ? 'Υποβιβασμός' : 'Προαγωγή σε Leader';
                    html += `
                        <button onclick="toggleMemberRole('${m.user_id}', '${m.role}')" class="icon-btn" title="${promoTitle}" style="padding:2px 6px; font-size:0.8rem; color:${promoColor}; border:1px solid ${promoColor};">
                            <i class="${promoIcon}"></i>
                        </button>`;
                }
                // 3. Κουμπί Μεταβίβασης Ηγεσίας (Make Owner & Transfer Assets)
                if (currentRole === 'owner' && (m.role === 'member' || m.role === 'admin')) {
                    html += `
                        <button onclick="transferBandLeadership('${m.user_id}')" class="icon-btn" title="Μεταβίβαση Ηγεσίας (Make Owner)" style="padding:2px 6px; font-size:0.8rem; color:#ffc107; border:1px solid #ffc107; margin-left:2px;">
                            <i class="fas fa-crown"></i>
                        </button>`;
                }
                //  4. Κουμπί Αποβολής (Blacklist)
                if (currentRole === 'owner') {
                    html += `
                        <button onclick="expelMember('${currentGroupId}', '${m.user_id}')" class="icon-btn danger" title="Αποβολή" style="padding:2px 6px; font-size:0.8rem;">
                            <i class="fas fa-user-times"></i>
                        </button>`;
                }
            }
            html += `</div></div>`;
        });
        html += `</div>`; 

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
            `;
            if (currentRole === 'owner') {
                html += `
                    <button onclick="showLeaderExitModal()" class="footer-btn danger-v2" style="width:100%; margin-top:15px;">
                        <i class="fas fa-sign-out-alt"></i> ΔΙΑΧΕΙΡΙΣΗ ΑΠΟΧΩΡΗΣΗΣ
                    </button>
                `;
            }
            if (!groupData.invite_code) setTimeout(fetchInviteCode, 100); 
        } else {
            // Οικειοθελής Αποχώρηση (Για Members & Viewers)
            html += `
                <button onclick="leaveBand()" class="footer-btn danger-v2" style="width:100%; margin-top:20px;">
                    <i class="fas fa-sign-out-alt"></i> LEAVE BAND
                </button>
            `;
        }
        
        html += `</div>`;
        container.innerHTML = html;

    } catch (err) {
        console.error("❌ [BAND_DASHBOARD] Σφάλμα:", err.message);
        container.innerHTML = '<p class="error-text" style="color:var(--danger); text-align:center;">Σφάλμα φόρτωσης.</p>';
    }
}

/**
 * 2. Διαχείριση Προπληρωμένων Εισιτηρίων (Sponsored Seats)
 */
async function toggleMemberTicket(targetUserId, currentlySponsored, usedTickets, totalTickets) {
    if (!currentlySponsored && usedTickets >= totalTickets) {
        if (typeof showToast === 'function') showToast(currentLang === 'en' ? "Ticket limit reached!" : "Έχετε εξαντλήσει τα εισιτήρια!", "error");
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
        
        if (typeof showToast === 'function') showToast(newStatus ? "Το εισιτήριο δόθηκε! 🎫" : "Το εισιτήριο αφαιρέθηκε.");
        loadBandDashboard();
        
    } catch (err) {
        console.error("❌ [TICKETS] Σφάλμα Database:", err.message);
    }
}

/**
 * 3. Προαγωγή / Υποβιβασμός σε Leader (Admin)
 */
async function toggleMemberRole(targetUserId, currentMemberRole) {
    const newRole = currentMemberRole === 'admin' ? 'member' : 'admin';
    const msg = newRole === 'admin' ? "Το μέλος έγινε Leader! ⭐" : "Το μέλος επέστρεψε σε απλό ρόλο. 🎸";
    
    if (!confirm(currentLang === 'en' ? `Change role to ${newRole.toUpperCase()}?` : `Αλλαγή ρόλου σε ${newRole.toUpperCase()};`)) return;

    try {
        console.log(`⭐ [ROLES] Ενημέρωση μέλους ${targetUserId} σε ρόλο: ${newRole}`);
        const { error } = await supabaseClient
            .from('group_members')
            .update({ role: newRole })
            .eq('group_id', currentGroupId)
            .eq('user_id', targetUserId);

        if (error) throw error;
        if (typeof showToast === 'function') showToast(msg);
        loadBandDashboard(); 
    } catch (err) {
        console.error("❌ [ROLES] Σφάλμα αλλαγής ρόλου:", err.message);
    }
}

/**
 * 4. Αποβολή Μέλους (Blacklisting)
 */
async function expelMember(groupId, userIdToKick) {
    if (!confirm(currentLang === 'en' ? "Are you sure you want to ban this member?" : "Είστε σίγουροι ότι θέλετε να αποβάλετε και να μπλοκάρετε αυτό το μέλος;")) return;

    try {
        console.log(`🚫 [EXPEL] Εφαρμογή Ban στο μέλος: ${userIdToKick}`);
        const { error } = await supabaseClient
            .from('group_members')
            .update({ 
                is_banned: true, 
                is_sponsored: false, 
                role: 'viewer'       
            })
            .eq('group_id', groupId)
            .eq('user_id', userIdToKick);

        if (error) throw error;

        const memberCard = document.getElementById(`member-card-${userIdToKick}`);
        if (memberCard) memberCard.remove();
        
        if (typeof showToast === 'function') showToast("Το μέλος αποβλήθηκε οριστικά (Blacklisted).");
        loadBandDashboard();
    } catch (err) {
        console.error("❌ [EXPEL] Σφάλμα:", err.message);
    }
}

/**
 * 5. Δημιουργία Μπάντας
 */
async function createNewBandUI() {
    const myOwnedGroups = myGroups.filter(g => g.role === 'owner').length;
    
    if (!canUserPerform('CREATE_BAND', myOwnedGroups)) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Όριο Δημιουργίας Μπαντών');
        else if (typeof showToast === 'function') showToast("Έχετε φτάσει το όριο των συγκροτημάτων για το πακέτο σας.", "error");
        return;
    }

    const name = prompt(currentLang === 'en' ? "New band name:" : "Όνομα νέας μπάντας:");
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

        if (typeof DEFAULT_DEMO_SONGS !== 'undefined') {
            const bandDemoSongs = DEFAULT_DEMO_SONGS.map((ds, idx) => ({
                ...ds,
                id: "s_" + Date.now() + idx + Math.random().toString(16).slice(2),
                user_id: currentUser.id,
                group_id: newGroupId
            }));
            await supabaseClient.from('songs').insert(bandDemoSongs);
        }

        if (typeof showToast === 'function') showToast("Band Created! 🎉");
        window.location.reload(); 
    } catch (err) {
        console.error(err); 
        if (typeof showToast === 'function') showToast("Σφάλμα κατά τη δημιουργία", "error");
    }
}

/**
 * 6. Ένταξη σε υπάρχουσα Μπάντα (με Invite Code & Blacklist Check)
 */
async function joinBandWithCode() {
    if (!canUserPerform('JOIN_BANDS')) {
        if (typeof promptUpgrade === 'function') promptUpgrade('Συμμετοχή σε Μπάντα');
        return;
    }

    const code = prompt(currentLang === 'en' ? "Enter Invite Code:" : "Εισάγετε τον κωδικό πρόσκλησης:");
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();

    try {
        const { data: groupData, error: groupErr } = await supabaseClient
            .from('groups').select('id, name, owner_id').eq('invite_code', cleanCode).single();

        if (groupErr || !groupData) {
            if (typeof showToast === 'function') showToast("Ο κωδικός δεν είναι έγκυρος.", "error");
            return;
        }

        console.log(`🔍 [JOIN] Έλεγχος Blacklist για μπάντα: ${groupData.id}`);
        const { data: existingMember } = await supabaseClient
            .from('group_members')
            .select('is_banned')
            .eq('group_id', groupData.id)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (existingMember) {
            if (existingMember.is_banned) {
                alert(currentLang === 'en' ? "🚫 You have been banned from this band." : "🚫 Η είσοδός σας έχει απαγορευτεί οριστικά από τον διαχειριστή.");
                return;
            } else {
                if (typeof showToast === 'function') showToast("Είστε ήδη μέλος αυτής της μπάντας!", "info");
                return;
            }
        }

        const { error: joinErr } = await supabaseClient
            .from('group_members').insert([{ group_id: groupData.id, user_id: currentUser.id, role: 'member' }]);

        if (joinErr) throw joinErr;
        
        if (typeof showToast === 'function') showToast(`Καλώς ήρθατε στην μπάντα "${groupData.name}"! 🎉`);
        setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
        console.error("❌ Join Error:", err);
        if (typeof showToast === 'function') showToast("Σφάλμα κατά την ένταξη.", "error");
    }
}

/**
 * 7. Ανάκτηση, Αντιγραφή Κωδικού 
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
    if (typeof showToast === 'function') showToast("Invite Link Copied! 📋");
}

// Ανοίγει το παράθυρο διαχείρισης και φορτώνει τα δεδομένα
function showBandManagerModal() {
    const modal = document.getElementById('bandManagerModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof loadBandDashboard === 'function') {
            loadBandDashboard();
        }
    }
}

// ==========================================
// 8. ΔΙΑΧΕΙΡΙΣΗ ΑΠΟΧΩΡΗΣΗΣ / ΔΙΑΛΥΣΗΣ ΜΠΑΝΤΑΣ
// ==========================================

async function leaveBand() {
    // 1. ΑΠΛΑ ΜΕΛΗ (Members / Admins / Viewers) - Φεύγουν ελεύθερα
    if (currentRole !== 'owner') {
        if(!confirm(currentLang === 'en' ? "Leave band permanently?" : "Θέλετε οριστικά να αποχωρήσετε από την μπάντα;")) return;
        await supabaseClient.from('group_members').delete().eq('group_id', currentGroupId).eq('user_id', currentUser.id);
        window.location.reload();
        return;
    }

    // 2. LEADERS / OWNERS - Μπαίνουν στη διαδικασία "Διαχείρισης Αποχώρησης"
    showLeaderExitModal();
}

async function showLeaderExitModal() {
    const modal = document.getElementById('leaderExitModal');
    const select = document.getElementById('selSuccessor');
    if (!modal || !select) return;

    select.innerHTML = '<option value="">-- Επιλέξτε Διάδοχο --</option>';

    try {
        const { data: members, error } = await supabaseClient
            .from('group_members')
            .select(`user_id, role, profiles (username, email)`)
            .eq('group_id', currentGroupId)
            .is('is_banned', false);

        if (error) throw error;

        let hasCandidates = false;
        members.forEach(m => {
            if (m.user_id !== currentUser.id && m.role !== 'viewer') {
                const displayName = m.profiles?.username || m.profiles?.email || `User ${m.user_id.slice(0,4)}`;
                const opt = document.createElement('option');
                opt.value = m.user_id;
                opt.innerText = `${displayName} (${m.role.toUpperCase()})`;
                select.appendChild(opt);
                hasCandidates = true;
            }
        });

        if (!hasCandidates) select.innerHTML = '<option value="" disabled>Δεν υπάρχουν άλλα ενεργά μέλη.</option>';

        // Κλείνουμε το από πίσω modal αν είναι ανοιχτό
        const bandModal = document.getElementById('bandManagerModal');
        if (bandModal) bandModal.style.display = 'none';

        // Εμφανίζουμε το σωστό modal
        modal.style.display = 'flex';

    } catch (err) {
        console.error("Σφάλμα στο showLeaderExitModal:", err);
    }
}

async function executeBandDisband() {
    const conf = prompt(currentLang === 'en' ? "Type 'DELETE' to confirm disbanding the band:" : "Γράψτε 'DELETE' για να διαλύσετε τη μπάντα:");
    if (conf !== 'DELETE') return;

    try {
        console.log(`💣 [DISBAND] Διάλυση μπάντας: ${currentGroupId}`);
        showToast("Η μπάντα διαλύεται...", "info");
        
        // Σβήνουμε μόνο το Group. 
        // 1. Τα φυσικά αρχεία (Storage) μένουν άθικτα στον φάκελο του καθενός!
        // 2. Οι Κλώνοι των μελών (songs) θα διασωθούν μέσω του Μηχανισμού Διάσωσης
        await supabaseClient.from('groups').delete().eq('id', currentGroupId);
        
        showToast("Η μπάντα διαλύθηκε επιτυχώς.");
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        console.error("Disband Error:", err);
        showToast("Σφάλμα κατά τη διάλυση.", "error");
    }
}

async function executeLeadershipTransfer() {
    const successorId = document.getElementById('selSuccessor').value;
    const transferAssets = document.getElementById('cbTransferAssets').checked;

    if (!successorId) {
        showToast("Παρακαλώ επιλέξτε διάδοχο.", "error");
        return;
    }

    if (!confirm("Είστε σίγουροι για τη μεταβίβαση της ηγεσίας;")) return;

    try {
        showToast("Εκτέλεση μεταβίβασης... Μην κλείσετε το παράθυρο.", "info");

        // 1. Αλλαγή Ρόλων
        await supabaseClient.from('group_members').update({ role: 'owner' }).eq('group_id', currentGroupId).eq('user_id', successorId);
        await supabaseClient.from('group_members').update({ role: 'member' }).eq('group_id', currentGroupId).eq('user_id', currentUser.id);
        await supabaseClient.from('groups').update({ owner_id: successorId }).eq('id', currentGroupId);

        // 2. Μεταφορά Αρχείων (Storage & URLs)
        if (transferAssets) {
            console.log("📦 Μετακίνηση φυσικών αρχείων στον νέο Leader...");
            
            const { data: myAssets } = await supabaseClient
                .from('user_assets') 
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('group_id', currentGroupId); 

            if (myAssets && myAssets.length > 0) {
                for (let asset of myAssets) {
                    let fileName = asset.file_url.split('/').pop(); 
                    let oldPath = `${currentUser.id}/${fileName}`; 
                    let newPath = `${successorId}/${fileName}`;
                    let newFileUrl = asset.file_url.replace(currentUser.id, successorId);

                    const { error: moveErr } = await supabaseClient.storage.from('user_assets').move(oldPath, newPath);
                    
                    if (!moveErr) {
                        await supabaseClient.from('user_assets')
                            .update({ user_id: successorId, file_url: newFileUrl })
                            .eq('id', asset.id);
                    } else {
                        console.warn(`⚠️ Αποτυχία μετακίνησης:`, moveErr);
                    }
                }
            }
        } else {
            console.log("🔒 Ο χρήστης πήρε τα αρχεία του πίσω.");
            await supabaseClient.from('user_assets').update({ group_id: null }).eq('user_id', currentUser.id).eq('group_id', currentGroupId);
        }

        showToast("Η μεταβίβαση ολοκληρώθηκε! 🤝");
        setTimeout(() => window.location.reload(), 2000);

    } catch (err) {
        console.error("Transfer Error:", err);
        showToast("Σφάλμα κατά τη μεταβίβαση.", "error");
    }
}

// ==========================================
// 9. ΛΕΙΤΟΥΡΓΙΕΣ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΜΕΤΑΦΕΡΘΟΥΝ
// (Σημείωση: Ιδανικά η importJSON πάει στο storage.js 
//  και η deleteMyAccount στο supabase-client.js)
// ==========================================

async function importJSON(input) {
    const file = input.files[0];
    if(!file) return;

    // ✨ 1. ΕΛΕΓΧΟΣ ΚΑΤΑΛΗΞΗΣ (Απορρίπτει λάθος αρχεία)
    const validExtensions = ['.mnote', '.mnotes', '.json'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
        alert("Λάθος τύπος αρχείου! Παρακαλώ επιλέξτε ένα αρχείο .mnote ή .json");
        input.value = ''; 
        return;
    }

    const isBandContext = (typeof currentGroupId !== 'undefined' && currentGroupId !== 'personal');

    if (isBandContext) {
        const isGod = (typeof currentRole !== 'undefined') && (currentRole === 'admin' || currentRole === 'owner' || currentRole === 'maestro');
        if (!isGod) {
            alert("Μόνο οι διαχειριστές της μπάντας μπορούν να κάνουν μαζική εισαγωγή αρχείων.");
            input.value = '';
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            let importedSongs = [];

            if (imported.app_version && imported.songs) {
                importedSongs = imported.songs;
            } else {
                importedSongs = Array.isArray(imported) ? imported : [imported];
            }

            let confirmMsg = isBandContext 
                ? `⚠️ ΠΡΟΣΟΧΗ! ⚠️\n\nΠάτε να εισάγετε ${importedSongs.length} τραγούδια στην ΚΟΙΝΗ βιβλιοθήκη της Μπάντας!\nΑυτό θα επηρεάσει όλα τα μέλη.\n\nΘέλετε σίγουρα να συνεχίσετε;`
                : `Βρέθηκαν ${importedSongs.length} τραγούδια.\nΘέλετε να τα εισάγετε στην Προσωπική σας Βιβλιοθήκη;`;

            if (!confirm(confirmMsg)) {
                input.value = ''; return;
            }

            console.log("📥 [IMPORT] Ξεκινάει ο έξυπνος έλεγχος διπλοεγγραφών...");

            let addedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            
            // ✨ 2. ΚΑΛΑΘΙΑ ΟΜΑΔΙΚΟΥ UPLOAD (Batching)
            let batchCloudPayloads = []; 
            let batchOfflineQueue = [];

            for (let song of importedSongs) {
                if (typeof convertBracketsToBang === 'function' && song.body) {
                    song.body = convertBracketsToBang(song.body);
                }
                
                let safeSong = typeof ensureSongStructure === 'function' ? ensureSongStructure(song) : song;
                
                safeSong.group_id = isBandContext ? currentGroupId : null;
                safeSong.user_id = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : safeSong.user_id;
                safeSong.attachments = [];
                safeSong.recordings = [];

                const idxById = library.findIndex(x => x.id === safeSong.id);
                const safeTitle = (safeSong.title || "").toLowerCase().trim();
                const safeArtist = (safeSong.artist || "").toLowerCase().trim();
                const idxByContent = library.findIndex(x => 
                    (x.title || "").toLowerCase().trim() === safeTitle && 
                    (x.artist || "").toLowerCase().trim() === safeArtist
                );

                let needsCloudSync = false;

                if (idxById !== -1) {
                    const existingSong = library[idxById];
                    const importedTime = new Date(safeSong.updated_at || 0).getTime();
                    const existingTime = new Date(existingSong.updated_at || 0).getTime();

                    if (importedTime > existingTime) {
                        library[idxById] = safeSong;
                        updatedCount++;
                        needsCloudSync = true;
                    } else {
                        skippedCount++;
                    }
                } 
                else if (idxByContent !== -1) {
                    skippedCount++;
                } 
                else {
                    safeSong.id = "s_" + Date.now() + Math.random().toString(16).slice(2);
                    library.push(safeSong);
                    addedCount++;
                    needsCloudSync = true;
                }

                // Προσθήκη στο καλάθι (Αντί για 1-1 upload)
                if (needsCloudSync) {
                    const userIdToUse = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : 'offline';
                    const safePayload = window.sanitizeForDatabase(safeSong, userIdToUse, safeSong.group_id);
                    
                    if (navigator.onLine && typeof supabaseClient !== 'undefined' && currentUser) {
                        batchCloudPayloads.push(safePayload);
                    } else {
                        batchOfflineQueue.push(safePayload);
                    }
                }
            }

            // ✨ 3. ΟΜΑΔΙΚΟ UPLOAD ΣΤΗ SUPABASE
            if (batchCloudPayloads.length > 0) {
                console.log(`☁️ Ομαδικό ανέβασμα ${batchCloudPayloads.length} τραγουδιών...`);
                await supabaseClient.from('songs').upsert(batchCloudPayloads);
            }
            
            if (batchOfflineQueue.length > 0 && typeof addToSyncQueue === 'function') {
                batchOfflineQueue.forEach(payload => addToSyncQueue('SAVE_SONG', payload));
            }

            saveToLocal();
            
            if (typeof loadContextData === 'function') {
                await loadContextData(); 
            } else {
                if(typeof updatePlaylistDropdown === 'function') updatePlaylistDropdown();
                if(typeof applyFilters === 'function') applyFilters();
            }
            
            const resultMsg = `Η Εισαγωγή Ολοκληρώθηκε!\n\nΝέα: ${addedCount}\nΕνημερώθηκαν: ${updatedCount}\nΠαραλείφθηκαν (Διπλά): ${skippedCount}`;
            alert(resultMsg);
            
        } catch(err) {
            console.error("❌ [IMPORT ERROR]", err);
            alert("Σφάλμα στην ανάγνωση του αρχείου ❌");
        }
    };
    reader.readAsText(file);
    input.value = ''; 
}

async function deleteMyAccount() {
    if (!currentUser) return;

    // ✨ ΝΕΟΣ ΕΛΕΓΧΟΣ ΑΣΦΑΛΕΙΑΣ: Είναι ο χρήστης Leader σε κάποια μπάντα;
    if (typeof myGroups !== 'undefined') {
        const ownedBands = myGroups.filter(g => g.role === 'owner');
        if (ownedBands.length > 0) {
            alert("⚠️ Είστε Ιδρυτής/Leader σε τουλάχιστον μία μπάντα!\n\nΠρέπει πρώτα να μεταβιβάσετε την ηγεσία ή να διαλύσετε τη μπάντα σας (από το Band Manager) πριν μπορέσετε να διαγράψετε οριστικά τον λογαριασμό σας.");
            document.getElementById('accountModal').style.display = 'none';
            return; // Σταματάμε τη διαγραφή!
        }
    }

    // Το κλασικό confirm
    if (confirm("ΠΡΟΣΟΧΗ: Είστε σίγουροι; Αυτή η ενέργεια θα διαγράψει τον λογαριασμό σας, όλα σας τα τραγούδια, τους ρυθμούς και τα αρχεία σας ΟΡΙΣΤΙΚΑ!")) {
        
        console.log("🗑️ Εκκίνηση διαδικασίας διαγραφής λογαριασμού...");
        if (typeof showToast === 'function') showToast("Γίνεται διαγραφή δεδομένων... Παρακαλώ περιμένετε.", "info");

        try {
            // 1. Καθαρίζουμε τα "παιδιά"
            console.log("Διαγραφή ρυθμών...");
            await supabaseClient.from('rhythms').delete().eq('owner_id', currentUser.id);
            
            console.log("Διαγραφή τραγουδιών...");
            await supabaseClient.from('songs').delete().eq('user_id', currentUser.id);

            // 2. Σβήνουμε το Προφίλ
            console.log("Διαγραφή προφίλ...");
            await supabaseClient.from('profiles').delete().eq('id', currentUser.id);

            if (typeof showToast === 'function') showToast("Τα δεδομένα σας διαγράφηκαν επιτυχώς. Αντίο! 👋");
            
            // 3. Τον πετάμε έξω
            if (typeof doLogout === 'function') {
                await doLogout();
            } else {
                await supabaseClient.auth.signOut();
                window.location.reload();
            }

        } catch (err) {
            console.error("❌ Σφάλμα κατά τη διαγραφή:", err.message);
            alert("Υπήρξε ένα σφάλμα κατά τη διαγραφή των δεδομένων σας: " + err.message);
        }
    } else {
        console.log("ℹ️ Η διαγραφή ακυρώθηκε από τον χρήστη.");
    }
}
