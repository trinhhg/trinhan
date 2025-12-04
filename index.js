document.addEventListener('DOMContentLoaded', () => {
    // 1. BLOCK EXTENSIONS
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension'))) {
            e.stopImmediatePropagation(); e.preventDefault(); return false;
        }
    });

    // 2. DOM ELEMENTS
    const els = {
        // Tab
        tabs: document.querySelectorAll('.tab-btn'),
        editorTab: document.getElementById('editor-tab'),
        settingsTab: document.getElementById('settings-tab'),

        // Editor & Keywords (Cũ: sidebar trái)
        input: document.getElementById('keywords-input'),
        tags: document.getElementById('keywords-tags'),
        search: document.getElementById('search'),
        clear: document.getElementById('clear'),
        copyContent: document.getElementById('copy-editor-content'),
        font: document.getElementById('fontFamily'),
        size: document.getElementById('fontSize'),
        matchCase: document.getElementById('matchCase'), // Highlight Setting
        wholeWords: document.getElementById('wholeWords'), // Highlight Setting
        editor: document.getElementById('editor'),
        kwCount: document.getElementById('keyword-count'),
        
        // Keywords Sidebar (Mới)
        kwSidebar: document.getElementById('keywords-sidebar'),
        toggleKwSidebarTab: document.getElementById('toggle-keywords-sidebar'),
        toggleKwSidebarInternal: document.getElementById('toggle-keywords-sidebar-internal'),

        // Thay Thế (Sidebar phải cũ, nay trong Tab Settings)
        modeSel: document.getElementById('mode-select'),
        addMode: document.getElementById('add-mode'),
        delMode: document.getElementById('delete-mode-btn'),
        renameMode: document.getElementById('rename-mode'),
        caseMode: document.getElementById('match-case-replace'),
        wholeWordsMode: document.getElementById('whole-words-replace'), 
        puncList: document.getElementById('punctuation-list'),
        addPair: document.getElementById('add-pair'),
        save: document.getElementById('save-settings'),
        replace: document.getElementById('replace-all'),
        notify: document.getElementById('notification-container'),
        exportBtn: document.getElementById('export-csv'),
        importBtn: document.getElementById('import-csv')
    };

    let state = {
        keywords: [],
        modes: {},
        activeMode: 'Mặc định',
        isKwSidebarOpen: true // Khởi tạo sidebar keywords MỞ
    };

    const KW_COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];

    // 3. UTILS
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = type === 'success' ? `✓ ${msg}` : `⚠️ ${msg}`;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    // --- DOM HELPER ---
    function getTextNodesSnapshot(root, opts = {}) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue) continue;
            let p = node.parentElement;
            let skip = false;
            while (p && p !== root) {
                if (p.classList && (
                    (opts.skipClass1 && p.classList.contains(opts.skipClass1)) || 
                    (opts.skipClass2 && p.classList.contains(opts.skipClass2))
                )) {
                    skip = true; break;
                }
                p = p.parentElement;
            }
            if (!skip) nodes.push(node);
        }
        return nodes;
    }

    // === 4. LOGIC CHÍNH ===

    function unwrapClasses(classesToRemove) {
        classesToRemove.forEach(cls => {
            const spans = els.editor.querySelectorAll(`span.${cls}`);
            spans.forEach(span => {
                const parent = span.parentNode;
                while(span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
            });
        });
        // Chuẩn hóa cây DOM để gộp các text node liền kề lại
        els.editor.normalize();
    }

    function highlightKeywords() {
        try {
            unwrapClasses(['keyword']); 
            let totalMatches = 0;
            els.kwCount.textContent = '0'; // Reset count
            if (!state.keywords.length) return 0;

            // Chỉ highlight trong các text node KHÔNG nằm trong thẻ 'replaced'
            const nodes = getTextNodesSnapshot(els.editor, { skipClass1: 'replaced' });
            const caseSensitive = els.matchCase.checked;
            const isWholeWord = els.wholeWords.checked;

            let wordCharRegex;
            try {
                // Hỗ trợ ký tự Unicode cho ngôn ngữ tiếng Việt
                wordCharRegex = /[\p{L}\p{N}_]/u; 
            } catch (e) {
                // Fallback nếu trình duyệt không hỗ trợ /u
                wordCharRegex = /[a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđ_]/i;
            }

            // Sắp xếp từ khóa: từ dài đến ngắn để tránh highlight từ ngắn làm hỏng từ dài
            const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);

            for (const textNode of nodes) {
                if (!textNode.parentNode) continue;
                let node = textNode;

                outer: while (node && node.nodeValue) {
                    const nodeText = caseSensitive ? node.nodeValue : node.nodeValue.toLowerCase();
                    let foundIdx = -1, foundWord = null, colorIdx = 0;

                    // Tìm từ khóa đầu tiên (theo vị trí và ưu tiên từ dài nhất)
                    for (let i = 0; i < sortedKws.length; i++) {
                        const w = sortedKws[i];
                        const mw = caseSensitive ? w : w.toLowerCase();
                        const idx = nodeText.indexOf(mw);
                        
                        if (idx !== -1) {
                            if (isWholeWord) {
                                // Kiểm tra ký tự trước và sau từ được tìm thấy
                                const charBefore = idx > 0 ? nodeText[idx-1] : '';
                                const charAfter = idx + mw.length < nodeText.length ? nodeText[idx+mw.length] : '';
                                
                                // Nếu ký tự trước HOẶC sau là ký tự chữ/số/gạch dưới, BỎ QUA (không phải Whole Word)
                                if (wordCharRegex.test(charBefore) || wordCharRegex.test(charAfter)) {
                                    continue; 
                                }
                            }
                            
                            // Nếu đây là lần tìm thấy đầu tiên hoặc tìm thấy ở vị trí sớm hơn
                            if (foundIdx === -1 || idx < foundIdx) {
                                foundIdx = idx; foundWord = w; colorIdx = i;
                            }
                        }
                    }

                    if (foundIdx === -1) break; // Hết từ khóa trong node này

                    // Tách Text Node thành 3 phần: [trước từ khóa] [từ khóa] [sau từ khóa]
                    const matchNode = node.splitText(foundIdx);
                    const afterNode = matchNode.splitText(foundWord.length);

                    // Bọc từ khóa bằng <span>
                    const span = document.createElement('span');
                    span.className = `keyword ${KW_COLORS[colorIdx % KW_COLORS.length]}`;
                    span.textContent = matchNode.nodeValue;

                    matchNode.parentNode.replaceChild(span, matchNode);
                    totalMatches++; 

                    node = afterNode; // Tiếp tục tìm kiếm trong phần 'sau từ khóa'
                    continue outer;
                }
            }
            els.kwCount.textContent = totalMatches.toString();
            return totalMatches;
        } catch (e) {
            console.error('Lỗi khi highlight:', e);
            els.kwCount.textContent = 'Lỗi';
            return 0;
        }
    }

    function performReplace() {
        saveData();
        const mode = state.modes[state.activeMode];
        if (!mode.pairs.length) return notify('Chưa có từ khóa để thay thế!', 'error');
        if (!els.editor.textContent.trim()) return notify('Văn bản trống!', 'error');

        unwrapClasses(['keyword', 'replaced']); // Xóa highlight và replaced cũ
        const caseSensitive = mode.case;
        const isWholeWord = mode.wholeWord;
        // Sắp xếp: từ cần thay thế dài hơn được xử lý trước
        const pairs = [...mode.pairs].sort((a, b) => b.find.length - a.find.length);
        let count = 0;

        let wordCharRegex;
        try {
            wordCharRegex = /[\p{L}\p{N}_]/u; 
        } catch (e) {
            wordCharRegex = /[a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđ_]/i;
        }

        pairs.forEach(pair => {
            const fromWord = pair.find;
            const toWord = pair.replace;
            if(!fromWord) return;

            // Chỉ thay thế trong các text node KHÔNG nằm trong thẻ 'replaced'
            const nodes = getTextNodesSnapshot(els.editor, { skipClass1: 'replaced' });

            for (const textNode of nodes) {
                if (!textNode.parentNode) continue;
                let node = textNode;
                
                while (node && node.nodeValue) {
                    const nodeText = caseSensitive ? node.nodeValue : node.nodeValue.toLowerCase();
                    const searchFor = caseSensitive ? fromWord : fromWord.toLowerCase();
                    const idx = nodeText.indexOf(searchFor);

                    if (idx === -1) break;

                    // Kiểm tra Whole Word
                    if (isWholeWord) {
                        const charBefore = idx > 0 ? nodeText[idx-1] : '';
                        const charAfter = idx + searchFor.length < nodeText.length ? nodeText[idx+searchFor.length] : '';
                        
                        if (wordCharRegex.test(charBefore) || wordCharRegex.test(charAfter)) {
                            // Không phải Whole Word, cắt node để tiếp tục tìm kiếm sau vị trí này
                            const afterMatch = node.nodeValue.substring(idx + 1);
                            node = node.splitText(idx + 1);
                            node.nodeValue = afterMatch;
                            continue; 
                        }
                    }

                    // Tách node: [trước] [tìm thấy] [sau]
                    const matchNode = node.splitText(idx);
                    const afterNode = matchNode.splitText(fromWord.length);
                    
                    let finalReplace = toWord;
                    // Lấy phần văn bản trước từ vừa tìm thấy (không bao gồm các node khác)
                    let prefix = node.nodeValue;
                    
                    // Logic tự động viết hoa chữ cái đầu (Yêu cầu cũ - Tự động viết hoa đầu câu/dòng)
                    const isStartOfLine = /^\s*$/.test(prefix) || /\n\s*$/.test(prefix);
                    const isAfterPunctuation = /([\.?!])\s*$/.test(prefix);

                    if (isStartOfLine || isAfterPunctuation) {
                         if (finalReplace.length > 0) {
                             finalReplace = finalReplace.charAt(0).toUpperCase() + finalReplace.slice(1);
                         }
                    }

                    // Thay thế bằng thẻ <span>.replaced
                    const span = document.createElement('span');
                    span.className = 'replaced';
                    span.setAttribute('data-original', matchNode.nodeValue);
                    span.textContent = finalReplace; 

                    matchNode.parentNode.replaceChild(span, matchNode);
                    count++;
                    
                    node = afterNode; // Tiếp tục tìm kiếm trong phần 'sau'
                }
            }
        });

        if (count > 0) {
            notify(`Đã thay thế ${count} từ!`, 'success');
            // Sau khi thay thế xong, highlight lại (nếu có keywords)
            if(state.keywords.length > 0) highlightKeywords();
        } else {
            notify('Không tìm thấy từ nào để thay thế.', 'error');
        }
    }

    // --- EVENT HANDLERS ---
    
    // 1. ADD KEYWORDS LOGIC 
    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let addedCount = 0;
        
        newKws.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                renderTag(k);
                addedCount++;
            }
        });
        
        els.input.value = '';
        if (addedCount > 0) highlightKeywords(); // Highlight ngay sau khi thêm từ
    }

    els.input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault(); 
            addKw();
        }
    });

    els.input.addEventListener('blur', addKw);

    function renderTag(txt) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `<span>${txt.replace(/</g, "&lt;")}</span><span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            state.keywords = state.keywords.filter(k => k !== txt);
            tag.remove();
            highlightKeywords(); 
        };
        els.tags.appendChild(tag);
    }

    // Nút Search/Highlight
    els.search.onclick = () => {
        addKw(); // Thêm từ đang nằm trong ô input trước khi tìm
        if (!state.keywords.length) return notify('Chưa nhập từ khóa!', 'error');
        const count = highlightKeywords();
        notify(`Đã highlight ${count} từ khóa!`, 'success');
    };

    // Ngăn chặn Paste HTML
    els.editor.addEventListener('paste', e => {
        e.preventDefault();
        let text = (e.clipboardData || window.clipboardData).getData('text/plain');
        text = text.replace(/\r\n/g, '\n'); 
        document.execCommand('insertText', false, text);
    });

    // Copy & Clear
    els.copyContent.onclick = () => {
        const text = els.editor.innerText;
        if (!text.trim()) return notify('Không có nội dung!', 'error');
        navigator.clipboard.writeText(text);
        els.editor.innerHTML = ''; 
        notify('Đã copy và xóa nội dung!', 'success');
    };

    // Clear
    els.clear.onclick = () => {
        els.editor.innerHTML = ''; state.keywords = []; els.tags.innerHTML = '';
        notify('Đã xóa tất cả.');
        highlightKeywords(); // Xóa hết highlight
    };

    // Thay thế
    els.replace.onclick = performReplace;

    // --- UI/UX & DATA ---
    function updateFont() {
        els.editor.style.fontFamily = els.font.value;
        els.editor.style.fontSize = els.size.value;
    }
    els.font.addEventListener('change', updateFont);
    els.size.addEventListener('change', updateFont);

    // Highlight settings in Editor tab
    els.matchCase.onchange = highlightKeywords;
    els.wholeWords.onchange = highlightKeywords;

    // --- TAB LOGIC (Yêu cầu 1) ---
    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-tab');
            
            // Deactivate all tabs and hide all content
            els.tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            // Activate clicked tab and show its content
            tab.classList.add('active');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });


    // --- KEYWORDS SIDEBAR TOGGLE LOGIC (Yêu cầu 5) ---
    function toggleKwSidebar() {
        state.isKwSidebarOpen = !state.isKwSidebarOpen;
        const isOpen = state.isKwSidebarOpen;

        // Cập nhật trạng thái sidebar chính
        els.kwSidebar.classList.toggle('sidebar-closed', !isOpen);
        // Cập nhật trạng thái tab button (toggle)
        els.toggleKwSidebarTab.querySelector('.open-icon').classList.toggle('hidden', isOpen);
        els.toggleKwSidebarTab.querySelector('.close-icon').classList.toggle('hidden', !isOpen);
        // Cập nhật trạng thái internal button
        els.toggleKwSidebarInternal.querySelector('.open-icon').classList.toggle('hidden', isOpen);
        els.toggleKwSidebarInternal.querySelector('.close-icon').classList.toggle('hidden', !isOpen);

        // Lưu trạng thái vào localStorage (optional, nhưng nên làm)
        localStorage.setItem('kw_sidebar_open', isOpen);
    }
    
    // Nút toggle trên Header Tab
    els.toggleKwSidebarTab.onclick = toggleKwSidebar;
    // Nút toggle bên trong Sidebar
    els.toggleKwSidebarInternal.onclick = toggleKwSidebar;

    // Khởi tạo trạng thái sidebar ban đầu từ localStorage hoặc mặc định
    const initialSidebarState = localStorage.getItem('kw_sidebar_open');
    if (initialSidebarState === 'false') {
        state.isKwSidebarOpen = true; // Đảo ngược để lần gọi đầu tiên sẽ đóng
        toggleKwSidebar();
    } else {
        // Đảm bảo sidebar MỞ
        els.kwSidebar.classList.remove('sidebar-closed');
        els.kwSidebar.style.display = 'flex';
        els.toggleKwSidebarTab.querySelector('.open-icon').classList.add('hidden');
        els.toggleKwSidebarTab.querySelector('.close-icon').classList.remove('hidden');
        els.toggleKwSidebarInternal.querySelector('.open-icon').classList.add('hidden');
        els.toggleKwSidebarInternal.querySelector('.close-icon').classList.remove('hidden');
    }


    // --- DATA MANAGEMENT ---
    function loadData() {
        try {
            const raw = localStorage.getItem('replace_data');
            const data = JSON.parse(raw);
            if (data && data.modes) {
                state.modes = data.modes;
                state.activeMode = data.active || 'Mặc định';
            }
            if (data && data.keywords) {
                state.keywords = data.keywords;
                state.keywords.forEach(renderTag);
            }
        } catch {
            state.modes = { 'Mặc định': { pairs: [], case: false, wholeWord: false } };
            state.keywords = [];
        }
        
        // Đảm bảo tất cả mode có đủ trường
        Object.keys(state.modes).forEach(k => {
            if (typeof state.modes[k].wholeWord === 'undefined') state.modes[k].wholeWord = false;
            if (typeof state.modes[k].case === 'undefined') state.modes[k].case = false;
        });
        
        updateModeUI();
    }

    function saveData() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(div => {
            const find = div.querySelector('.find').value;
            const rep = div.querySelector('.replace').value;
            if (find) pairs.push({ find, replace: rep });
        });
        state.modes[state.activeMode].pairs = pairs;
        
        // Lưu cả keywords
        localStorage.setItem('replace_data', JSON.stringify({ 
            modes: state.modes, 
            active: state.activeMode, 
            keywords: state.keywords
        }));
    }

    function updateModeUI() {
        els.modeSel.innerHTML = '';
        Object.keys(state.modes).forEach(k => els.modeSel.add(new Option(k, k, false, k === state.activeMode)));
        
        const isDef = state.activeMode === 'Mặc định';
        els.delMode.classList.toggle('hidden', isDef);
        els.renameMode.classList.toggle('hidden', isDef);
        
        const mode = state.modes[state.activeMode];

        // Cập nhật Match Case (Yêu cầu 6)
        els.caseMode.textContent = mode.case ? 'Match Case: BẬT' : 'Match Case: TẮT';
        els.caseMode.classList.toggle('bg-green-200', mode.case);
        els.caseMode.classList.toggle('text-green-800', mode.case);
        els.caseMode.classList.toggle('bg-gray-200', !mode.case);
        els.caseMode.classList.toggle('text-gray-600', !mode.case);

        // Cập nhật Whole Words (Yêu cầu 6)
        els.wholeWordsMode.textContent = mode.wholeWord ? 'Whole Words: BẬT' : 'Whole Words: TẮT';
        els.wholeWordsMode.classList.toggle('bg-green-200', mode.wholeWord);
        els.wholeWordsMode.classList.toggle('text-green-800', mode.wholeWord);
        els.wholeWordsMode.classList.toggle('bg-gray-200', !mode.wholeWord);
        els.wholeWordsMode.classList.toggle('text-gray-600', !mode.wholeWord);
        
        els.puncList.innerHTML = '';
        if (mode.pairs) {
            mode.pairs.forEach(p => addPairUI(p.find, p.replace, true)); 
        }
    }

    function addPairUI(f = '', r = '', append = false) {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${f.replace(/"/g, '&quot;')}"><span class="text-gray-400">→</span><input type="text" class="replace" placeholder="Thay" value="${r.replace(/"/g, '&quot;')}"><button class="remove-pair" tabindex="-1">×</button>`;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        
        if (append) {
            els.puncList.appendChild(div);
        } else {
            els.puncList.prepend(div);
        }
    }

    // --- CSV EXPORT & IMPORT ---
    els.exportBtn.onclick = () => {
        saveData();
        let csvContent = "\uFEFFfind,replace,mode,case_sensitive,whole_word\n"; 
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            const caseStatus = mode.case ? 'TRUE' : 'FALSE';
            const wholeWordStatus = mode.wholeWord ? 'TRUE' : 'FALSE';
            if (mode.pairs) {
                mode.pairs.forEach(p => {
                    const safeFind = p.find.replace(/"/g, '""');
                    const safeReplace = p.replace.replace(/"/g, '""');
                    csvContent += `"${safeFind}","${safeReplace}","${modeName}",${caseStatus},${wholeWordStatus}\n`;
                });
            }
        });
        const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement("a");
        link.href = url; link.download = "data_thay_the.csv";
        link.click();
        notify('Đã xuất file CSV!');
    };

    els.importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result;
                const lines = text.split(/\r?\n/);
                if (!lines[0].toLowerCase().includes('find,replace,mode')) {
                    return notify('File CSV sai định dạng!', 'error');
                }
                let count = 0;
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    // Regex tìm các trường bọc trong dấu nháy kép, cho phép dấu phẩy bên trong
                    const match = line.match(/^"(.*)","(.*)","(.*)"(?:,(\w+)(?:,(\w+))?)?$/);
                    if (match) {
                        const find = match[1].replace(/""/g, '"');
                        const replace = match[2].replace(/""/g, '"');
                        const modeName = match[3];
                        const caseStr = match[4] ? match[4].toUpperCase() : 'FALSE';
                        const wholeWordStr = match[5] ? match[5].toUpperCase() : 'FALSE';

                        if (!state.modes[modeName]) {
                            // Tạo mode mới
                            state.modes[modeName] = { pairs: [], case: false, wholeWord: false };
                        }
                        
                        // Cập nhật setting mode (chỉ dùng setting từ dòng đầu tiên của mode đó)
                        if (state.modes[modeName].pairs.length === 0) {
                             state.modes[modeName].case = (caseStr === 'TRUE');
                             state.modes[modeName].wholeWord = (wholeWordStr === 'TRUE');
                        }

                        state.modes[modeName].pairs.push({ find, replace });
                        count++;
                    }
                }
                saveData(); updateModeUI(); notify(`Nhập ${count} dòng!`);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // --- MODE & PAIR MANAGEMENT ---
    els.addPair.onclick = () => { addPairUI('', '', false); els.puncList.querySelector('input').focus(); };
    els.save.onclick = () => { saveData(); notify(`Đã lưu "${state.activeMode}"`); };
    els.modeSel.onchange = () => { saveData(); state.activeMode = els.modeSel.value; updateModeUI(); };
    els.addMode.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (name && !state.modes[name]) {
            saveData(); state.modes[name] = { pairs: [], case: false, wholeWord: false }; state.activeMode = name; updateModeUI();
        }
    };
    els.delMode.onclick = () => { if (confirm('Xóa chế độ này?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; updateModeUI(); saveData(); } };
    els.renameMode.onclick = () => {
        const newName = prompt('Tên mới:', state.activeMode);
        if (newName && !state.modes[newName]) {
            state.modes[newName] = state.modes[state.activeMode]; delete state.modes[state.activeMode];
            state.activeMode = newName; updateModeUI(); saveData();
        }
    };
    // Toggle Match Case
    els.caseMode.onclick = () => { state.modes[state.activeMode].case = !state.modes[state.activeMode].case; updateModeUI(); };
    // Toggle Whole Words 
    els.wholeWordsMode.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; updateModeUI(); };

    // Khởi tạo
    loadData();
    updateFont();
});
