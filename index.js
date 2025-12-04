document.addEventListener('DOMContentLoaded', () => {
    // === 1. CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v17_optimized';
    
    // Markers (Logic tham khảo)
    const MARK_REP_START = '\uE000';
    const MARK_REP_END = '\uE001';
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END = '\uE003';
    
    // Keyword Colors
    const KW_COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red']; // hl-blue ở đây sẽ bị Auto Caps chiếm, nhưng logic keywords sẽ random

    const defaultState = {
        keywords: [],
        activeMode: 'Mặc định',
        sidebarOpen: true,
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        }
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';

    // === 2. DOM ELEMENTS ===
    const els = {
        // Tabs
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        // Editor
        editor: document.getElementById('editor'),
        wordCount: document.getElementById('word-count-display'),
        
        // Actions
        searchBtn: document.getElementById('search'),
        clearBtn: document.getElementById('clear'),
        copyBtn: document.getElementById('copy-editor-content'),
        replaceBtn: document.getElementById('replace-all'),

        // Sidebar Elements
        sidebar: document.getElementById('keywords-sidebar'),
        sidebarToggle: document.getElementById('header-sidebar-toggle'),
        sidebarClose: document.getElementById('sidebar-close-btn'),
        sidebarInput: document.getElementById('sidebar-input'),
        sidebarTags: document.getElementById('sidebar-tags'),
        
        // Display & Full Keywords Tab
        fontFamily: document.getElementById('fontFamily'),
        fontSize: document.getElementById('fontSize'),
        matchCaseBtn: document.getElementById('match-case-btn'),
        wholeWordBtn: document.getElementById('whole-word-btn'),
        autoCapsBtn: document.getElementById('auto-caps-btn'),
        fullKwInput: document.getElementById('full-keywords-input'),
        fullKwTags: document.getElementById('full-keywords-tags'),
        
        // Settings Tab (Replace)
        modeSelect: document.getElementById('mode-select'),
        addModeBtn: document.getElementById('add-mode'),
        renameModeBtn: document.getElementById('rename-mode'),
        deleteModeBtn: document.getElementById('delete-mode'),
        saveSettingsBtn: document.getElementById('save-settings'),
        addPairBtn: document.getElementById('add-pair'),
        puncList: document.getElementById('punctuation-list'),
        emptyState: document.getElementById('empty-state'),
        importBtn: document.getElementById('import-csv'),
        exportBtn: document.getElementById('export-csv'),
        
        notify: document.getElementById('notification-container')
    };

    // === 3. CORE FUNCTIONS ===

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    // --- TAB LOGIC ---
    function switchTab(tabId) {
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        els.contents.forEach(c => {
            if (c.id === tabId) {
                c.classList.remove('hidden');
                c.classList.add('active');
            } else {
                c.classList.add('hidden');
                c.classList.remove('active');
            }
        });
        
        // Xử lý nút Sidebar Toggle trên Header
        if (tabId === 'main-tab') {
            els.sidebarToggle.classList.remove('hidden');
        } else {
            els.sidebarToggle.classList.add('hidden');
        }
    }

    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));

    // --- SIDEBAR LOGIC ---
    function toggleSidebar(forceState) {
        const isOpen = forceState !== undefined ? forceState : !state.sidebarOpen;
        state.sidebarOpen = isOpen;
        
        if (isOpen) {
            els.sidebar.classList.remove('closed');
            els.sidebarToggle.querySelector('.icon').textContent = '«'; // Icon đóng
        } else {
            els.sidebar.classList.add('closed');
            els.sidebarToggle.querySelector('.icon').textContent = '»'; // Icon mở
        }
        saveState();
    }
    
    els.sidebarToggle.onclick = () => toggleSidebar();
    els.sidebarClose.onclick = () => toggleSidebar(false);
    // Init sidebar state
    toggleSidebar(state.sidebarOpen);

    // --- HELPER: TEXT NORMALIZATION ---
    function normalizeText(text) {
        if (!text) return '';
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
            .replace(/\u00A0/g, ' ');
    }

    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]);
    }
    
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // === 4. REPLACE LOGIC (INTEGRATED FROM REFERENCE) ===
    
    function performReplaceAll() {
        const mode = state.modes[state.activeMode];
        let rawText = els.editor.innerText; // Lấy text thuần từ editor
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        els.replaceBtn.textContent = 'Đang xử lý...';
        
        setTimeout(() => {
            try {
                // 1. Normalize
                let processedText = normalizeText(rawText);
                let replaceCount = 0;

                // 2. Phase 1: Custom Replace (Yellow)
                if (mode.pairs.length > 0) {
                    const rules = mode.pairs
                        .filter(p => p.find && p.find.trim())
                        .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
                        .sort((a,b) => b.find.length - a.find.length);

                    rules.forEach(rule => {
                        const pattern = escapeRegExp(rule.find);
                        const flags = mode.matchCase ? 'g' : 'gi';
                        let regex;
                        
                        if (mode.wholeWord) {
                            regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
                        } else {
                            regex = new RegExp(pattern, flags);
                        }

                        processedText = processedText.replace(regex, (match) => {
                            replaceCount++;
                            let replacement = rule.replace;
                            if (!mode.matchCase) replacement = preserveCase(match, replacement);
                            return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                        });
                    });
                }

                // 3. Phase 2: Auto Caps (Blue)
                if (mode.autoCaps) {
                    // Logic: Tìm ký tự thường sau dấu câu, bỏ qua các marker đã có
                    const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
                    processedText = processedText.replace(autoCapsRegex, (fullMatch, prefix, char) => {
                        return `${prefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
                    });
                }

                // 4. Build HTML
                let finalHTML = '';
                let buffer = '';
                
                for (let i = 0; i < processedText.length; i++) {
                    const c = processedText[i];
                    if (c === MARK_REP_START) {
                        finalHTML += escapeHTML(buffer) + '<span class="hl-yellow" contenteditable="false">'; // contenteditable="false" để chặn sửa
                        buffer = '';
                    } else if (c === MARK_REP_END) {
                        finalHTML += escapeHTML(buffer) + '</span>&#8203;'; // Zero width space để thoát span
                        buffer = '';
                    } else if (c === MARK_CAP_START) {
                        finalHTML += escapeHTML(buffer) + '<span class="hl-blue" contenteditable="false">';
                        buffer = '';
                    } else if (c === MARK_CAP_END) {
                        finalHTML += escapeHTML(buffer) + '</span>&#8203;';
                        buffer = '';
                    } else {
                        buffer += c;
                    }
                }
                finalHTML += escapeHTML(buffer);

                // 5. Update DOM
                els.editor.innerHTML = finalHTML;
                
                // 6. Highlight Keywords sau khi thay thế
                if (state.keywords.length > 0) highlightKeywordsDOM();

                updateWordCount();
                
                if (replaceCount > 0) notify(`Thay thế ${replaceCount} từ!`);
                else if (mode.autoCaps) notify('Đã Auto Caps!');
                else notify('Không có gì để thay thế.', 'warning');

            } catch (e) {
                console.error(e);
                notify('Lỗi: ' + e.message, 'error');
            } finally {
                els.replaceBtn.textContent = 'Thực Hiện Thay Thế';
            }
        }, 50);
    }

    // === 5. KEYWORD HIGHLIGHT LOGIC (DOM BASED) ===
    function highlightKeywordsDOM() {
        // Xóa highlight cũ của keywords (giữ lại replaced/autocaps)
        const oldKws = els.editor.querySelectorAll('.keyword');
        oldKws.forEach(span => {
            const parent = span.parentNode;
            while(span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
        els.editor.normalize();

        if (!state.keywords.length) return;

        // TreeWalker để tìm text nodes
        const walker = document.createTreeWalker(els.editor, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while(node = walker.nextNode()) {
            // Bỏ qua text bên trong các thẻ hl-yellow, hl-blue đã replace
            if (node.parentElement && (node.parentElement.classList.contains('hl-yellow') || node.parentElement.classList.contains('hl-blue'))) continue;
            textNodes.push(node);
        }

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const mode = state.modes[state.activeMode]; // Lấy setting hiển thị từ mode hiện tại
        
        let wordCharRegex = /[\p{L}\p{N}_]/u;

        for (const textNode of textNodes) {
            if (!textNode.parentNode) continue;
            let currentNode = textNode;
            
            // Loop tìm kiếm trong text node
            outer: while(currentNode && currentNode.nodeValue) {
                const text = mode.matchCase ? currentNode.nodeValue : currentNode.nodeValue.toLowerCase();
                let bestIdx = -1, bestKw = '', colorIdx = 0;

                for (let i = 0; i < sortedKws.length; i++) {
                    const kw = sortedKws[i];
                    const searchKw = mode.matchCase ? kw : kw.toLowerCase();
                    const idx = text.indexOf(searchKw);

                    if (idx !== -1) {
                        // Check Whole Word
                        if (mode.wholeWord) {
                            const prev = idx > 0 ? text[idx-1] : '';
                            const next = idx + searchKw.length < text.length ? text[idx+searchKw.length] : '';
                            if (wordCharRegex.test(prev) || wordCharRegex.test(next)) continue;
                        }

                        if (bestIdx === -1 || idx < bestIdx) {
                            bestIdx = idx; bestKw = kw; colorIdx = i;
                        }
                    }
                }

                if (bestIdx === -1) break;

                // Split & Wrap
                const matchNode = currentNode.splitText(bestIdx);
                const afterNode = matchNode.splitText(bestKw.length);
                
                const span = document.createElement('span');
                span.className = `keyword ${KW_COLORS[colorIdx % KW_COLORS.length]}`;
                span.textContent = matchNode.nodeValue;
                span.contentEditable = "false"; // Chặn sửa bên trong keyword

                matchNode.parentNode.replaceChild(span, matchNode);
                
                // Chèn zero-width space sau highlight để sửa lỗi bleeding
                const zws = document.createTextNode('\u200B');
                span.parentNode.insertBefore(zws, afterNode);

                currentNode = afterNode;
            }
        }
    }

    // === 6. TYPING BUG FIX (Prevent highlight bleeding) ===
    // Mặc dù đã dùng contenteditable="false" cho span, ta cần đảm bảo
    // người dùng có thể gõ tiếp sau từ đó một cách tự nhiên.
    els.editor.addEventListener('keydown', (e) => {
        // Nếu nhấn mũi tên phải hoặc gõ phím khi đang ở sát biên của span
        // Trình duyệt đôi khi kẹt con trỏ. contenteditable="false" giúp giảm điều này.
        // Zero-width space (\u200B) giúp con trỏ thoát ra.
    });

    // === 7. KEYWORDS MANAGEMENT ===
    function addKeyword(val) {
        if (!val.trim()) return;
        const keys = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        keys.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                changed = true;
            }
        });
        if (changed) {
            renderTags();
            saveState();
            highlightKeywordsDOM();
        }
        els.sidebarInput.value = '';
        els.fullKwInput.value = '';
    }

    function renderTags() {
        const html = state.keywords.map(k => `
            <div class="tag">
                <span>${escapeHTML(k)}</span>
                <span class="remove-tag" data-kw="${escapeHTML(k)}">×</span>
            </div>
        `).join('');
        els.sidebarTags.innerHTML = html;
        els.fullKwTags.innerHTML = html; // Sync cả 2 chỗ

        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                const kw = e.target.dataset.kw;
                state.keywords = state.keywords.filter(k => k !== kw);
                renderTags();
                saveState();
                highlightKeywordsDOM(); // Re-run highlight removal
            }
        });
    }

    [els.sidebarInput, els.fullKwInput].forEach(inp => {
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); addKeyword(inp.value); }
        });
        inp.addEventListener('blur', () => addKeyword(inp.value));
    });

    // === 8. SETTINGS & MODE UI ===
    function renderModeUI() {
        const mode = state.modes[state.activeMode];
        
        // Buttons
        els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
        els.matchCaseBtn.classList.toggle('active', mode.matchCase);
        
        els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
        els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
        
        els.autoCapsBtn.textContent = `Auto Caps: ${mode.autoCaps ? 'BẬT' : 'Tắt'}`;
        els.autoCapsBtn.classList.toggle('active', mode.autoCaps);
        
        // Pairs
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
        checkEmpty();
        
        // Select Options
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).forEach(m => {
            els.modeSelect.add(new Option(m, m, false, m === state.activeMode));
        });
        
        const isDef = state.activeMode === 'Mặc định';
        els.renameModeBtn.classList.toggle('hidden', isDef);
        els.deleteModeBtn.classList.toggle('hidden', isDef);
    }

    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${escapeHTML(f)}">
            <span class="text-gray-400">→</span>
            <input type="text" class="replace" placeholder="Thay" value="${escapeHTML(r)}">
            <button class="remove" tabindex="-1">×</button>
        `;
        div.querySelector('.remove').onclick = () => { div.remove(); checkEmpty(); savePairsFromUI(); };
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', () => savePairsFromUI()));
        els.puncList.prepend(div);
    }

    function checkEmpty() {
        els.emptyState.classList.toggle('hidden', els.puncList.children.length > 0);
    }

    function savePairsFromUI() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(d => {
            pairs.push({
                find: d.querySelector('.find').value,
                replace: d.querySelector('.replace').value
            });
        });
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }

    // Toggle Handlers
    els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };

    // Mode Management
    els.modeSelect.onchange = () => { state.activeMode = els.modeSelect.value; saveState(); renderModeUI(); };
    els.addModeBtn.onclick = () => {
        const n = prompt('Tên chế độ mới:');
        if (n && !state.modes[n]) {
            state.modes[n] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false };
            state.activeMode = n; saveState(); renderModeUI();
        }
    };
    els.renameModeBtn.onclick = () => {
        const n = prompt('Tên mới:', state.activeMode);
        if (n && !state.modes[n]) {
            state.modes[n] = state.modes[state.activeMode];
            delete state.modes[state.activeMode];
            state.activeMode = n; saveState(); renderModeUI();
        }
    };
    els.deleteModeBtn.onclick = () => {
        if (confirm('Xóa chế độ này?')) {
            delete state.modes[state.activeMode];
            state.activeMode = 'Mặc định'; saveState(); renderModeUI();
        }
    };
    els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('input').focus(); checkEmpty(); };
    els.saveSettingsBtn.onclick = () => { savePairsFromUI(); notify('Đã lưu cài đặt!'); };

    // Import/Export CSV
    els.exportBtn.onclick = () => {
        let csv = "\uFEFFfind,replace,mode\n";
        Object.keys(state.modes).forEach(m => {
            state.modes[m].pairs.forEach(p => {
                csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`;
            });
        });
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
        const a = document.createElement('a'); a.href=url; a.download='settings.csv'; a.click();
    };

    els.importBtn.onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
        inp.onchange = e => {
            const file = e.target.files[0];
            const r = new FileReader();
            r.onload = ev => {
                const lines = ev.target.result.split(/\r?\n/);
                if (!lines[0].includes('find,replace,mode')) return notify('CSV sai định dạng!', 'error');
                let count = 0;
                for(let i=1; i<lines.length; i++) {
                    const m = lines[i].match(/^"(.*)","(.*)","(.*)"$/); // Regex đơn giản cho CSV generated
                    if (m) {
                        const [_, f, r, modeName] = m;
                        if (!state.modes[modeName]) state.modes[modeName] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                        state.modes[modeName].pairs.push({find: f.replace(/""/g,'"'), replace: r.replace(/""/g,'"')});
                        count++;
                    }
                }
                saveState(); renderModeUI(); notify(`Đã nhập ${count} dòng.`);
            };
            r.readAsText(file);
        };
        inp.click();
    };

    // === 9. EDITOR UTILS ===
    function updateFont() {
        els.editor.style.fontFamily = els.fontFamily.value;
        els.editor.style.fontSize = els.fontSize.value;
    }
    els.fontFamily.onchange = updateFont;
    els.fontSize.onchange = updateFont;
    
    function updateWordCount() {
        const txt = els.editor.innerText || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    els.editor.addEventListener('input', updateWordCount);

    els.searchBtn.onclick = () => {
        addKeyword(els.sidebarInput.value); 
        highlightKeywordsDOM(); 
        notify('Đã highlight keywords!'); 
    };
    els.replaceBtn.onclick = performReplaceAll;
    els.clearBtn.onclick = () => { 
        if(confirm('Xóa hết nội dung?')) { 
            els.editor.innerHTML = ''; 
            updateWordCount(); 
        } 
    };
    els.copyBtn.onclick = () => {
        if (!els.editor.innerText.trim()) return notify('Trống!', 'error');
        navigator.clipboard.writeText(els.editor.innerText);
        notify('Đã sao chép!');
    };

    // === INIT ===
    renderTags();
    renderModeUI();
    updateFont();
});
