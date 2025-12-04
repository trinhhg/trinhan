document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v19_final';
    
    // Markers
    const MARK_REP_START = '\uE000';
    const MARK_REP_END = '\uE001';
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END = '\uE003';
    
    // Yêu cầu 5: Keyword Colors (Loại bỏ Vàng và Xanh Dương)
    const KW_COLORS = ['hl-pink', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];

    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, // Yêu cầu 6: Mặc định đóng
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        }
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';
    if (!state.keywordSettings) state.keywordSettings = { matchCase: false, wholeWord: false };

    // === DOM ELEMENTS ===
    const els = {
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        editor: document.getElementById('editor'),
        wordCount: document.getElementById('word-count-display'),
        
        // Editor Actions
        searchBtn: document.getElementById('search'),
        clearBtn: document.getElementById('clear'),
        copyBtn: document.getElementById('copy-editor-content'),
        replaceBtn: document.getElementById('replace-all'),

        // Sidebar
        sidebar: document.getElementById('keywords-sidebar'),
        sidebarToggle: document.getElementById('header-sidebar-toggle'),
        sidebarInput: document.getElementById('sidebar-input'),
        sidebarTags: document.getElementById('sidebar-tags'),
        
        // Settings Tab (Replace)
        modeSelect: document.getElementById('mode-select'),
        addModeBtn: document.getElementById('add-mode'),
        renameModeBtn: document.getElementById('rename-mode'),
        deleteModeBtn: document.getElementById('delete-mode'),
        saveSettingsBtn: document.getElementById('save-settings'),
        addPairBtn: document.getElementById('add-pair'),
        puncList: document.getElementById('punctuation-list'),
        emptyState: document.getElementById('empty-state'),
        
        // Replace Settings Buttons
        matchCaseBtn: document.getElementById('match-case-btn'),
        wholeWordBtn: document.getElementById('whole-word-btn'),
        autoCapsBtn: document.getElementById('auto-caps-btn'),

        importBtn: document.getElementById('import-csv'),
        exportBtn: document.getElementById('export-csv'),
        
        // Keywords Tab Controls
        fontFamily: document.getElementById('fontFamily'),
        fontSize: document.getElementById('fontSize'),
        // Yêu cầu 2: Nút toggle thay vì checkbox
        kwMatchCaseBtn: document.getElementById('kw-match-case-btn'),
        kwWholeWordBtn: document.getElementById('kw-whole-word-btn'),
        fullKwInput: document.getElementById('full-keywords-input'),
        fullKwTags: document.getElementById('full-keywords-tags'),
        
        notify: document.getElementById('notification-container')
    };

    // === CORE FUNCTIONS ===

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
        
        // Yêu cầu 7: Toggle Sidebar hiện ở tab Nội dung và Cài đặt
        if (tabId === 'main-tab' || tabId === 'settings-tab') {
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
            els.sidebarToggle.querySelector('.icon').textContent = '«';
        } else {
            els.sidebar.classList.add('closed');
            els.sidebarToggle.querySelector('.icon').textContent = '»';
        }
        saveState();
    }
    els.sidebarToggle.onclick = () => toggleSidebar();
    // Init state based on saved value (Yêu cầu 6: Default closed handled in defaultState)
    toggleSidebar(state.sidebarOpen);

    // --- HELPERS ---
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

    // === REPLACE LOGIC (Settings Tab) ===
    function performReplaceAll() {
        const mode = state.modes[state.activeMode];
        let rawText = els.editor.innerText;
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        els.replaceBtn.textContent = 'Đang xử lý...';
        
        setTimeout(() => {
            try {
                let processedText = normalizeText(rawText);
                let replaceCount = 0;

                // Phase 1: User Replace
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

                // Phase 2: Auto Caps
                if (mode.autoCaps) {
                    const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
                    processedText = processedText.replace(autoCapsRegex, (fullMatch, prefix, char) => {
                        return `${prefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
                    });
                }

                // Build HTML
                let finalHTML = '';
                let buffer = '';
                for (let i = 0; i < processedText.length; i++) {
                    const c = processedText[i];
                    if (c === MARK_REP_START) {
                        // Yêu cầu 5: Replace = Yellow
                        finalHTML += escapeHTML(buffer) + '<span class="hl-yellow" contenteditable="false">';
                        buffer = '';
                    } else if (c === MARK_REP_END) {
                        finalHTML += escapeHTML(buffer) + '</span>&#8203;';
                        buffer = '';
                    } else if (c === MARK_CAP_START) {
                        // Yêu cầu 5: Auto Caps = Blue
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

                els.editor.innerHTML = finalHTML;
                
                // Highlight keywords sau replace
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

    // === HIGHLIGHT KEYWORDS LOGIC ===
    function highlightKeywordsDOM() {
        const oldKws = els.editor.querySelectorAll('.keyword');
        oldKws.forEach(span => {
            const parent = span.parentNode;
            while(span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
        els.editor.normalize();

        if (!state.keywords.length) return;

        const walker = document.createTreeWalker(els.editor, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while(node = walker.nextNode()) {
            if (node.parentElement && (node.parentElement.classList.contains('hl-yellow') || node.parentElement.classList.contains('hl-blue'))) continue;
            textNodes.push(node);
        }

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        let wordCharRegex = /[\p{L}\p{N}_]/u;

        for (const textNode of textNodes) {
            if (!textNode.parentNode) continue;
            let currentNode = textNode;
            
            outer: while(currentNode && currentNode.nodeValue) {
                const text = matchCase ? currentNode.nodeValue : currentNode.nodeValue.toLowerCase();
                let bestIdx = -1, bestKw = '', colorIdx = 0;

                for (let i = 0; i < sortedKws.length; i++) {
                    const kw = sortedKws[i];
                    const searchKw = matchCase ? kw : kw.toLowerCase();
                    const idx = text.indexOf(searchKw);

                    if (idx !== -1) {
                        if (wholeWord) {
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

                const matchNode = currentNode.splitText(bestIdx);
                const afterNode = matchNode.splitText(bestKw.length);
                
                // Yêu cầu 5: Keyword highlight (random colors, no blue/yellow)
                const span = document.createElement('span');
                span.className = `keyword ${KW_COLORS[colorIdx % KW_COLORS.length]}`;
                span.textContent = matchNode.nodeValue;
                span.contentEditable = "false"; 

                matchNode.parentNode.replaceChild(span, matchNode);
                const zws = document.createTextNode('\u200B');
                span.parentNode.insertBefore(zws, afterNode);

                currentNode = afterNode;
            }
        }
    }

    // === KEYWORDS MANAGEMENT ===
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
            <div class="tag"><span>${escapeHTML(k)}</span><span class="remove-tag" data-kw="${escapeHTML(k)}">×</span></div>
        `).join('');
        els.sidebarTags.innerHTML = html;
        els.fullKwTags.innerHTML = html;

        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
                renderTags(); saveState(); highlightKeywordsDOM();
            }
        });
    }

    [els.sidebarInput, els.fullKwInput].forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(inp.value); } });
        inp.addEventListener('blur', () => addKeyword(inp.value));
    });

    // === SETTINGS UI (Replace Mode) ===
    function renderModeUI() {
        const mode = state.modes[state.activeMode];
        els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
        els.matchCaseBtn.classList.toggle('active', mode.matchCase);
        
        els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
        els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
        
        els.autoCapsBtn.textContent = `Auto Caps: ${mode.autoCaps ? 'BẬT' : 'Tắt'}`;
        els.autoCapsBtn.classList.toggle('active', mode.autoCaps);
        
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
        
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).forEach(m => els.modeSelect.add(new Option(m, m, false, m === state.activeMode)));
        els.emptyState.classList.toggle('hidden', els.puncList.children.length > 0);
        
        const isDef = state.activeMode === 'Mặc định';
        els.renameModeBtn.classList.toggle('hidden', isDef);
        els.deleteModeBtn.classList.toggle('hidden', isDef);
    }

    // Yêu cầu 10: Xóa mũi tên
    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${escapeHTML(f)}">
            <input type="text" class="replace" placeholder="Thay" value="${escapeHTML(r)}">
            <button class="remove" tabindex="-1">×</button>
        `;
        div.querySelector('.remove').onclick = () => { div.remove(); savePairs(); };
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', () => savePairs()));
        els.puncList.prepend(div);
        els.emptyState.classList.add('hidden');
    }

    function savePairs() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(d => {
            pairs.push({ find: d.querySelector('.find').value, replace: d.querySelector('.replace').value });
        });
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }

    // Handlers for Replace Settings
    els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };

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
            state.modes[n] = state.modes[state.activeMode]; delete state.modes[state.activeMode];
            state.activeMode = n; saveState(); renderModeUI();
        }
    };
    els.deleteModeBtn.onclick = () => {
        if (confirm('Xóa chế độ này?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; saveState(); renderModeUI(); }
    };
    els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('input').focus(); };
    els.saveSettingsBtn.onclick = () => { savePairs(); notify('Đã lưu tất cả!'); };

    // Import/Export CSV
    els.exportBtn.onclick = () => {
        let csv = "\uFEFFfind,replace,mode\n";
        Object.keys(state.modes).forEach(m => {
            state.modes[m].pairs.forEach(p => csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`);
        });
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
        const a = document.createElement('a'); a.href=url; a.download='settings.csv'; a.click();
    };
    els.importBtn.onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
        inp.onchange = e => {
            if(!e.target.files[0]) return;
            const r = new FileReader();
            r.onload = ev => {
                const lines = ev.target.result.split(/\r?\n/);
                if (!lines[0].includes('find,replace,mode')) return notify('Lỗi file CSV!', 'error');
                for(let i=1; i<lines.length; i++) {
                    const m = lines[i].match(/^"(.*)","(.*)","(.*)"$/);
                    if (m) {
                        const [_, f, r, mn] = m;
                        if (!state.modes[mn]) state.modes[mn] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                        state.modes[mn].pairs.push({find: f.replace(/""/g,'"'), replace: r.replace(/""/g,'"')});
                    }
                }
                saveState(); renderModeUI(); notify('Nhập CSV thành công!');
            };
            r.readAsText(e.target.files[0]);
        };
        inp.click();
    };

    // === DISPLAY & KEYWORD SETTINGS HANDLERS ===
    function updateFont() {
        els.editor.style.fontFamily = els.fontFamily.value;
        els.editor.style.fontSize = els.fontSize.value;
    }
    els.fontFamily.onchange = updateFont;
    els.fontSize.onchange = updateFont;
    
    // Yêu cầu 2: Keyword Buttons UI Handler
    function updateKwUI() {
        els.kwMatchCaseBtn.textContent = `Match Case: ${state.keywordSettings.matchCase ? 'BẬT' : 'Tắt'}`;
        els.kwMatchCaseBtn.classList.toggle('active', state.keywordSettings.matchCase);
        
        els.kwWholeWordBtn.textContent = `Whole Word: ${state.keywordSettings.wholeWord ? 'BẬT' : 'Tắt'}`;
        els.kwWholeWordBtn.classList.toggle('active', state.keywordSettings.wholeWord);
    }

    // Toggle Handlers
    els.kwMatchCaseBtn.onclick = () => {
        state.keywordSettings.matchCase = !state.keywordSettings.matchCase;
        saveState(); updateKwUI(); highlightKeywordsDOM();
    };
    els.kwWholeWordBtn.onclick = () => {
        state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord;
        saveState(); updateKwUI(); highlightKeywordsDOM();
    };
    
    // Load initial UI for Keywords
    updateKwUI();

    // === EDITOR ACTIONS ===
    function updateWordCount() {
        const txt = els.editor.innerText || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    els.editor.addEventListener('input', updateWordCount);

    els.searchBtn.onclick = () => { addKeyword(els.sidebarInput.value); highlightKeywordsDOM(); notify('Đã highlight!'); };
    els.replaceBtn.onclick = performReplaceAll;
    els.clearBtn.onclick = () => { if(confirm('Xóa hết?')) { els.editor.innerHTML = ''; updateWordCount(); } };
    els.copyBtn.onclick = () => { if (!els.editor.innerText.trim()) return notify('Trống!', 'error'); navigator.clipboard.writeText(els.editor.innerText); notify('Đã copy!'); };

    // === INIT ===
    renderTags(); renderModeUI(); updateFont(); updateWordCount();
});
