document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v30_perfect'; 
    
    const RANGE_TYPE = {
        REPLACE: 'rep',
        AUTOCAPS: 'cap',
        REPLACE_CAP: 'rep-cap',
        KEYWORD: 'kw'
    };
    
    const KW_COLORS = ['hl-pink', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red']; 
    
    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
        fontFamily: "'Montserrat', sans-serif",
        fontSize: '16px',
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        }
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes || !state.modes[state.activeMode]) {
        state.modes = defaultState.modes;
        state.activeMode = 'Mặc định';
    }

    // === DOM ELEMENTS ===
    const els = {
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        editorWrapper: document.getElementById('editor-wrapper'),
        editorInput: document.getElementById('editor-input'), 
        highlightLayer: document.getElementById('highlight-layer'),

        wordCount: document.getElementById('word-count-display'),
        
        searchBtn: document.getElementById('search'),
        clearBtn: document.getElementById('clear'),
        copyBtn: document.getElementById('copy-editor-content'),
        replaceBtn: document.getElementById('replace-all'),
        
        sidebar: document.getElementById('keywords-sidebar'),
        sidebarToggle: document.getElementById('header-sidebar-toggle'),
        sidebarInput: document.getElementById('sidebar-input'),
        sidebarTags: document.getElementById('sidebar-tags'),
        
        modeSelect: document.getElementById('mode-select'),
        addModeBtn: document.getElementById('add-mode'),
        renameModeBtn: document.getElementById('rename-mode'),
        deleteModeBtn: document.getElementById('delete-mode'),
        saveSettingsBtn: document.getElementById('save-settings'),
        addPairBtn: document.getElementById('add-pair'),
        puncList: document.getElementById('punctuation-list'),
        emptyState: document.getElementById('empty-state'),
        
        matchCaseBtn: document.getElementById('match-case-btn'),
        wholeWordBtn: document.getElementById('whole-word-btn'),
        autoCapsBtn: document.getElementById('auto-caps-btn'),

        importReplaceBtn: document.getElementById('import-replace-csv'),
        exportReplaceBtn: document.getElementById('export-replace-csv'),
        csvFileInput: document.getElementById('csv-file-input'),

        fontFamily: document.getElementById('fontFamily'),
        fontSize: document.getElementById('fontSize'),
        kwMatchCaseBtn: document.getElementById('kw-match-case-btn'),
        kwWholeWordBtn: document.getElementById('kw-whole-word-btn'),
        fullKwInput: document.getElementById('full-keywords-input'),
        addKwBtn: document.getElementById('add-kw-btn'),
        deleteAllKwBtn: document.getElementById('delete-all-kw-btn'),
        fullKwTags: document.getElementById('full-keywords-tags'),
        
        copyKwBtn: document.getElementById('copy-kw-csv'), 
        
        notify: document.getElementById('notification-container')
    };
    
    // === UTILS ===
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
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]);
    }
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function normalizeTextForSearch(text) {
        if (!text) return '';
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'");
    }
    function createSmartQuotePattern(keyword) {
        let normKw = normalizeTextForSearch(keyword);
        let escaped = escapeRegExp(normKw);
        escaped = escaped.replace(/"/g, '["\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]');
        escaped = escaped.replace(/'/g, "['\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]");
        return escaped;
    }
    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // === CORE LOGIC ===
    function performReplaceAndGetRanges(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs.filter(p => p.find && p.find.trim());
        let processedText = "";
        let lastIndex = 0;
        let ranges = [];
        let replaceCount = 0;
        let autoCapsCount = 0;
        
        const patterns = rules.map(rule => {
            const pattern = escapeRegExp(rule.find);
            return mode.wholeWord ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` : `(${pattern})`;
        });

        if (rules.length > 0) {
            const flags = mode.matchCase ? "gu" : "giu";
            const regex = new RegExp(patterns.join("|"), flags);
            let match;
            while (match = regex.exec(rawText)) {
                const start = match.index;
                const end = regex.lastIndex;
                let ruleIndex = match.findIndex((m, i) => i > 0 && m !== undefined) - 1;
                if (ruleIndex >= 0) {
                    const rule = rules[ruleIndex];
                    let replacement = rule.replace || ''; 
                    if (!mode.matchCase) replacement = preserveCase(match[ruleIndex + 1], replacement);

                    processedText += rawText.slice(lastIndex, start);
                    const newStart = processedText.length;
                    const newEnd = newStart + replacement.length;
                    ranges.push({ start: newStart, end: newEnd, type: RANGE_TYPE.REPLACE });
                    processedText += replacement;
                    replaceCount++; 
                    lastIndex = end;
                } else {
                    processedText += rawText.slice(lastIndex, end);
                    lastIndex = end;
                }
            }
        }
        processedText += rawText.slice(lastIndex);
        
        if (mode.autoCaps) {
            const autoCapsRegex = /(^|[\.?!\n]\s*)([\p{Ll}])/gmu;
            let capsRanges = [];
            const finalProcessedText = processedText.replace(autoCapsRegex, (match, prefix, char, offset) => {
                const upperChar = char.toUpperCase();
                if (char !== upperChar) { 
                    const charStart = offset + prefix.length;
                    const isWithinReplace = ranges.some(r => r.type === RANGE_TYPE.REPLACE && charStart >= r.start && charStart < r.end);
                    if (!isWithinReplace) {
                        capsRanges.push({ start: charStart, end: charStart + 1, type: RANGE_TYPE.AUTOCAPS });
                        autoCapsCount++;
                    } else {
                         const repRange = ranges.find(r => r.type === RANGE_TYPE.REPLACE && charStart >= r.start && charStart < r.end);
                         if(repRange) repRange.type = RANGE_TYPE.REPLACE_CAP;
                    }
                    return prefix + upperChar;
                }
                return match;
            });
            processedText = finalProcessedText;
            ranges = ranges.concat(capsRanges);
        }
        ranges.sort((a, b) => a.start - b.start);
        return { text: processedText, ranges, repCount: replaceCount, acCount: autoCapsCount };
    }
    
    // SYNCHRONOUS HIGHLIGHT to avoid flicker/loss
    function performHighlight(text, existingRanges) {
        if (!state.keywords.length) return { ranges: existingRanges, count: 0 };
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        let keywordRanges = [];
        let highlightCount = 0;
        
        const patterns = sortedKws.map(kw => {
            const pattern = createSmartQuotePattern(kw);
            return wholeWord ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` : `(${pattern})`; 
        });

        const flags = matchCase ? 'gu' : 'giu';
        const masterRegex = new RegExp(patterns.join("|"), flags);
        
        text.replace(masterRegex, (match, ...args) => {
            const offset = args.at(-2);
            let startOffset = offset;
            let matchText = match;
            let matchedKwIndex = -1;

            for (let i = 0; i < sortedKws.length; i++) {
                if (args[i] !== undefined) {
                    matchedKwIndex = i;
                    matchText = args[i]; 
                    if(wholeWord) {
                        const groupIndex = match.indexOf(matchText);
                        startOffset = (groupIndex !== -1) ? offset + groupIndex : offset;
                    }
                    break; 
                }
            }
            if (matchedKwIndex !== -1) {
                const endOffset = startOffset + matchText.length;
                keywordRanges.push({ start: startOffset, end: endOffset, type: RANGE_TYPE.KEYWORD, color: matchedKwIndex });
            }
            return match;
        });

        let finalRanges = [...existingRanges];
        for (const kwRange of keywordRanges) {
            let shouldAdd = true;
            const existingKwRanges = finalRanges.filter(r => r.type === RANGE_TYPE.KEYWORD);
            for (const prevKwRange of existingKwRanges) {
                if (kwRange.start >= prevKwRange.start && kwRange.end <= prevKwRange.end) {
                    shouldAdd = false; break;
                }
            }
            if (shouldAdd) {
                finalRanges.push(kwRange);
                highlightCount++;
            }
        }
        finalRanges.sort((a, b) => {
             if (a.start !== b.start) return a.start - b.start;
             const typeOrder = { [RANGE_TYPE.REPLACE]: 1, [RANGE_TYPE.AUTOCAPS]: 2, [RANGE_TYPE.REPLACE_CAP]: 3, [RANGE_TYPE.KEYWORD]: 4 };
             return typeOrder[a.type] - typeOrder[b.type];
        });
        return { ranges: finalRanges, count: highlightCount };
    }

    function updateHighlightPreserveCaret(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        const selStart = els.editorInput.selectionStart;
        const selEnd = els.editorInput.selectionEnd;
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
        els.highlightLayer.scrollTop = els.editorInput.scrollTop;
        els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
        els.editorInput.setSelectionRange(selStart, selEnd);
    }
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) return escapeHTML(text);
        let html = '';
        let lastEnd = 0;
        
        for (const range of ranges) {
            if (range.end <= range.start) continue;
            if (range.start < lastEnd) {
                 if (range.type === RANGE_TYPE.KEYWORD) {
                    if (range.end <= lastEnd) continue; 
                    range.start = lastEnd; 
                } else {
                     range.start = lastEnd;
                     if (range.start >= range.end) continue;
                }
            }
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) className = 'hl-yellow'; 
            else if (range.type === RANGE_TYPE.AUTOCAPS) className = 'hl-blue';
            else if (range.type === RANGE_TYPE.REPLACE_CAP) className = 'hl-orange-dark'; 
            else if (range.type === RANGE_TYPE.KEYWORD) className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`; 

            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            lastEnd = range.end;
        }
        html += escapeHTML(text.substring(lastEnd));
        return html;
    }

    // === ACTION HANDLERS ===
    function handleInput() {
        if (!els.editorInput) return;
        const text = els.editorInput.value;
        updateWordCount();
        // Synchronous call to prevent flashing/missing highlights
        const res = performHighlight(text, []);
        updateHighlightPreserveCaret(text, res.ranges);
    }

    async function performSearchHighlight() {
        if (!els.editorInput) return;
        const textToSearch = els.editorInput.value; 
        if (!textToSearch.trim()) {
            els.highlightLayer.innerHTML = ''; return notify('Editor trống!', 'warning');
        }
        els.searchBtn.disabled = true;
        try {
            const highlightResult = performHighlight(textToSearch, []); 
            updateHighlightPreserveCaret(textToSearch, highlightResult.ranges);
            if (highlightResult.count > 0) notify(`Tìm thấy ${highlightResult.count} từ khóa.`);
            else notify('Không tìm thấy từ khóa nào.', 'warning');
        } catch (e) { notify('Lỗi: ' + e.message, 'error'); } 
        finally { els.searchBtn.disabled = false; }
    }
    
    async function performReplaceAll() {
        if (!els.editorInput) return;
        let rawText = els.editorInput.value; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');
        els.replaceBtn.disabled = true;
        try {
            const replaceResult = performReplaceAndGetRanges(rawText);
            els.editorInput.value = replaceResult.text; 
            const highlightResult = performHighlight(replaceResult.text, replaceResult.ranges); 
            updateHighlightPreserveCaret(replaceResult.text, highlightResult.ranges);
            updateWordCount();
            if (replaceResult.repCount > 0 || replaceResult.acCount > 0) notify(`Thay: ${replaceResult.repCount}, AutoCaps: ${replaceResult.acCount}`);
            else notify('Không có gì thay đổi.', 'warning');
        } catch (e) { notify('Lỗi: ' + e.message, 'error'); } 
        finally { els.replaceBtn.disabled = false; }
    }

    // === MODE MANAGEMENT (FIXED) ===
    function renderModeUI() {
        const modeKeys = Object.keys(state.modes);
        if (els.modeSelect) {
            els.modeSelect.innerHTML = modeKeys.map(key => 
                `<option value="${key}" ${key === state.activeMode ? 'selected' : ''}>${key}</option>`
            ).join('');
        }
        const isDefault = state.activeMode === 'Mặc định';
        if(els.deleteModeBtn) els.deleteModeBtn.classList.toggle('hidden', isDefault);
        if(els.renameModeBtn) els.renameModeBtn.classList.toggle('hidden', isDefault);

        const mode = state.modes[state.activeMode];
        updateToggle(els.matchCaseBtn, mode.matchCase, 'Match Case');
        updateToggle(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
        updateToggle(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
        renderPairs(mode.pairs); 
    }

    if (els.addModeBtn) {
        els.addModeBtn.onclick = () => {
            const name = prompt("Nhập tên chế độ mới:");
            if (name && name.trim()) {
                if (state.modes[name]) return notify("Tên đã tồn tại!", "error");
                state.modes[name] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false };
                state.activeMode = name;
                renderModeUI();
                saveState();
                notify(`Đã tạo chế độ: ${name}`);
            }
        };
    }

    if (els.renameModeBtn) {
        els.renameModeBtn.onclick = () => {
            if (state.activeMode === 'Mặc định') return;
            const newName = prompt("Nhập tên mới:", state.activeMode);
            if (newName && newName.trim() && newName !== state.activeMode) {
                if (state.modes[newName]) return notify("Tên đã tồn tại!", "error");
                const data = state.modes[state.activeMode];
                state.modes[newName] = data; 
                delete state.modes[state.activeMode]; 
                state.activeMode = newName;
                renderModeUI();
                saveState();
                notify(`Đã đổi tên thành: ${newName}`);
            }
        };
    }

    if (els.deleteModeBtn) {
        els.deleteModeBtn.onclick = () => {
            if (state.activeMode === 'Mặc định') return;
            if (confirm(`Bạn chắc chắn muốn xóa chế độ "${state.activeMode}"?`)) {
                delete state.modes[state.activeMode];
                state.activeMode = 'Mặc định';
                renderModeUI();
                saveState();
                notify("Đã xóa chế độ.");
            }
        };
    }

    if (els.modeSelect) {
        els.modeSelect.onchange = () => {
            state.activeMode = els.modeSelect.value;
            renderModeUI();
            saveState();
        };
    }

    // === REST OF UI LOGIC ===
    function syncStyles() {
        const family = els.fontFamily.value;
        const size = els.fontSize.value;
        [els.editorInput, els.highlightLayer].forEach(el => {
            el.style.fontFamily = family;
            el.style.fontSize = size;
        });
        state.fontFamily = family;
        state.fontSize = size;
        saveState();
    }
    function updateWordCount() {
        const txt = els.editorInput.value || ''; 
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    function updateToggle(btn, isActive, label) {
        if(!btn) return;
        btn.classList.toggle('active', isActive);
        btn.textContent = `${label}: ${isActive ? 'Bật' : 'Tắt'}`;
    }
    function renderPairs(pairs) {
        els.puncList.innerHTML = '';
        if (pairs.length === 0) els.emptyState.classList.remove('hidden');
        else { els.emptyState.classList.add('hidden'); pairs.forEach((pair, index) => addPairUI(pair.find, pair.replace, index, false)); }
    }
    function addPairUI(f = '', r = '', index = -1, isNew = true) {
        const div = document.createElement('div');
        div.className = 'pair-row';
        div.dataset.index = index;
        div.innerHTML = `<input type="text" class="pair-input find-input" value="${escapeHTML(f)}" placeholder="Tìm"><input type="text" class="pair-input replace-input" value="${escapeHTML(r)}" placeholder="Thay thế"><button class="delete-btn">Xóa</button>`;
        div.querySelector('.delete-btn').onclick = (e) => {
            state.modes[state.activeMode].pairs.splice(parseInt(e.target.closest('.pair-row').dataset.index), 1); 
            savePairs(true); notify('Đã xóa.');
        };
        isNew ? els.puncList.prepend(div) : els.puncList.appendChild(div);
    }
    function savePairs(reRender = false) {
        const newPairs = [];
        els.puncList.querySelectorAll('.pair-row').forEach(row => {
            const find = row.querySelector('.find-input').value.trim();
            const replace = row.querySelector('.replace-input').value.trim();
            if (find) newPairs.push({ find, replace });
        });
        state.modes[state.activeMode].pairs = newPairs;
        saveState();
        if(reRender) renderModeUI();
    }
    
    function updateKwUI() {
        const kwSettings = state.keywordSettings;
        updateToggle(els.kwMatchCaseBtn, kwSettings.matchCase, 'Match Case');
        updateToggle(els.kwWholeWordBtn, kwSettings.wholeWord, 'Whole Word');
        renderTags(state.keywords, els.sidebarTags);
        renderTags(state.keywords, els.fullKwTags);
        saveState();
    }
    function renderTags(keywords, container) {
        if (!container) return;
        container.innerHTML = keywords.map((kw, index) => {
            const colorClass = KW_COLORS[index % KW_COLORS.length];
            return `<div class="tag ${colorClass.replace('hl-', 'kw-')}"><span>${escapeHTML(kw)}</span><span class="remove-tag" data-kw="${escapeHTML(kw)}">×</span></div>`;
        }).join('');
        container.querySelectorAll('.remove-tag').forEach(btn => btn.onclick = (e) => removeKeyword(e.target.dataset.kw));
    }
    function addKeyword(val, inputEl) {
        if (!val) return;
        const newKws = val.split(/[,\n]/).map(k => k.trim()).filter(k => k && !state.keywords.includes(k));
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI(); notify(`Thêm ${newKws.length} từ khóa.`); performSearchHighlight(); 
        }
        if (inputEl) inputEl.value = '';
    }
    function removeKeyword(keyword) {
        state.keywords = state.keywords.filter(k => k !== keyword);
        updateKwUI(); performSearchHighlight(); 
    }

    // Event Wiring
    if (els.editorInput) {
        els.editorInput.addEventListener('input', handleInput);
        els.editorInput.addEventListener('scroll', () => {
            els.highlightLayer.scrollTop = els.editorInput.scrollTop;
            els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
        });
    }

    if (els.importReplaceBtn) els.importReplaceBtn.onclick = () => els.csvFileInput.click();
    if (els.csvFileInput) els.csvFileInput.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const lines = text.split(/\r\n|\n/).filter(line => line.trim());
            let count = 0;
            lines.forEach((line, index) => {
                if (index === 0 && line.toLowerCase().includes('find')) return;
                const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
                if (matches && matches.length >= 2) {
                    let find = matches[0].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
                    let replace = matches[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
                    let modeName = matches[2] ? matches[2].replace(/^"|"$/g, '').trim() : state.activeMode;
                    if (find) {
                        if (!state.modes[modeName]) state.modes[modeName] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false };
                        state.modes[modeName].pairs.push({ find, replace });
                        count++;
                    }
                }
            });
            if (count > 0) {
                state.activeMode = Object.keys(state.modes)[0];
                renderModeUI(); saveState(); notify(`Đã nhập ${count} cặp thay thế.`);
            } else { notify('Dữ liệu không hợp lệ.', 'warning'); }
        };
        reader.readAsText(e.target.files[0]);
    };
    if (els.exportReplaceBtn) els.exportReplaceBtn.onclick = () => {
        const rows = [['find', 'replace', 'mode']];
        Object.keys(state.modes).forEach(modeName => {
            state.modes[modeName].pairs.forEach(p => {
                rows.push([`"${p.find.replace(/"/g, '""')}"`, `"${p.replace.replace(/"/g, '""')}"`, `"${modeName}"`]);
            });
        });
        const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "replace_data.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    if (els.copyKwBtn) els.copyKwBtn.onclick = () => {
        if (state.keywords.length === 0) return notify('Trống!', 'warning');
        navigator.clipboard.writeText(state.keywords.join(', ')).then(() => notify('Đã copy!')).catch(() => notify('Lỗi copy!', 'error'));
    };
    if (els.deleteAllKwBtn) els.deleteAllKwBtn.onclick = () => {
        if(confirm('Xóa tất cả từ khóa?')) { state.keywords = []; updateKwUI(); performSearchHighlight(); notify('Đã xóa hết.'); }
    };

    function setupKeywordInput(input, btn) {
        if (!input) return;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(input.value, input); } });
        input.addEventListener('keyup', (e) => { if (e.key === ',') { addKeyword(input.value.slice(0, -1), input); } });
        input.addEventListener('blur', () => { if(input.value.trim()) addKeyword(input.value, input); });
        if (btn) btn.onclick = () => addKeyword(input.value, input);
    }
    setupKeywordInput(els.sidebarInput, null);
    setupKeywordInput(els.fullKwInput, els.addKwBtn);

    if (els.sidebarToggle) els.sidebarToggle.onclick = () => {
        state.sidebarOpen = !state.sidebarOpen;
        els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        const icon = els.sidebarToggle.querySelector('.icon');
        if(icon) icon.textContent = state.sidebarOpen ? '»' : '«';
        saveState();
    };

    els.tabs.forEach(btn => btn.onclick = () => {
        els.tabs.forEach(b => b.classList.remove('active'));
        els.contents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'settings-tab') renderModeUI();
        if (btn.dataset.tab === 'display-tab') updateKwUI();
    });

    if (els.searchBtn) els.searchBtn.onclick = performSearchHighlight;
    if (els.replaceBtn) els.replaceBtn.onclick = performReplaceAll;
    
    // NÚT CLEAR (Đã bỏ confirm theo yêu cầu)
    if (els.clearBtn) els.clearBtn.onclick = () => { 
        els.editorInput.value = ''; 
        els.highlightLayer.innerHTML = ''; 
        updateWordCount(); 
        notify('Đã xóa trắng.');
    };
    
    if (els.copyBtn) els.copyBtn.onclick = () => {
        if(!els.editorInput.value) return notify('Trống!', 'warning');
        navigator.clipboard.writeText(els.editorInput.value).then(() => { els.editorInput.value = ''; els.highlightLayer.innerHTML = ''; updateWordCount(); notify('Đã copy & xóa.'); });
    };

    if (els.fontFamily) els.fontFamily.onchange = syncStyles;
    if (els.fontSize) els.fontSize.onchange = syncStyles;
    if (els.addPairBtn) els.addPairBtn.onclick = () => addPairUI('', '', state.modes[state.activeMode].pairs.length, true);
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => { savePairs(true); notify('Đã lưu.'); };

    const toggleHandler = (prop) => { const m = state.modes[state.activeMode]; m[prop] = !m[prop]; renderModeUI(); saveState(); };
    if (els.matchCaseBtn) els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
    if (els.wholeWordBtn) els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
    if (els.autoCapsBtn) els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');

    const kwToggleHandler = (prop) => { state.keywordSettings[prop] = !state.keywordSettings[prop]; updateKwUI(); performSearchHighlight(); };
    if (els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => kwToggleHandler('matchCase');
    if (els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => kwToggleHandler('wholeWord');

    function init() {
        if (els.sidebar) els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        const icon = els.sidebarToggle.querySelector('.icon');
        if(icon) icon.textContent = state.sidebarOpen ? '»' : '«';
        els.fontFamily.value = state.fontFamily;
        els.fontSize.value = state.fontSize;
        syncStyles(); updateWordCount(); renderModeUI(); updateKwUI();
    }
    init();
});
