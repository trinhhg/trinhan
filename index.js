document.addEventListener('DOMContentLoaded', () => {
  // === 1. CONFIG & STATE ===
  const STORAGE_KEY = 'trinh_hg_settings_v17_final_optimized'; 
  const INPUT_STATE_KEY = 'trinh_hg_input_state_v17'; 

  // MARKERS for Replace/AutoCaps
  const MARK_REP_START = '\uE000';
  const MARK_REP_END = '\uE001';
  const MARK_CAP_START = '\uE002';
  const MARK_CAP_END = '\uE003';

  const defaultState = {
    currentMode: 'default',
    activeTab: 'settings', 
    modes: {
      default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
    }
  };

  let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
  
  if (!state.activeTab) state.activeTab = 'settings'; 
  if (!state.modes || Object.keys(state.modes).length === 0) {
      state.modes = defaultState.modes;
      state.currentMode = 'default';
  }
  if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';

  let currentSplitMode = 2;
  let saveTimeout;
  let searchKeywords = []; // Danh sách từ khóa tìm kiếm

  // DOM ELEMENTS
  const els = {
    // Layout
    searchSidebarContainer: document.getElementById('search-sidebar-container'),
    toggleSidebarBtn: document.getElementById('toggle-search-sidebar'),
    
    // Tabs & Modes
    modeSelect: document.getElementById('mode-select'),
    list: document.getElementById('punctuation-list'),
    
    // Editors
    inputText: document.getElementById('input-text'),
    outputText: document.getElementById('output-text'),
    
    // Split
    splitInput: document.getElementById('split-input-text'),
    splitWrapper: document.getElementById('split-outputs-wrapper'),
    
    // Buttons (Settings)
    matchCaseBtn: document.getElementById('match-case'),
    wholeWordBtn: document.getElementById('whole-word'),
    autoCapsBtn: document.getElementById('auto-caps'), 
    renameBtn: document.getElementById('rename-mode'),
    deleteBtn: document.getElementById('delete-mode'),
    emptyState: document.getElementById('empty-state'),
    
    // Action Buttons
    replaceBtn: document.getElementById('replace-button'),
    
    // Sidebar Search Elements
    fontFamily: document.getElementById('fontFamily'),
    fontSize: document.getElementById('fontSize'),
    kwInput: document.getElementById('keywords-input'),
    kwTags: document.getElementById('keywords-tags'),
    addKwBtn: document.getElementById('btn-add-kw'),
    searchTrigger: document.getElementById('btn-search-trigger'),
    clearSearch: document.getElementById('btn-clear-search'),
    searchMatchCase: document.getElementById('searchMatchCase'),
    searchWholeWords: document.getElementById('searchWholeWords'),
    
    // Counters
    inputCount: document.getElementById('input-word-count'),
    outputCount: document.getElementById('output-word-count'),
    searchMatchCount: document.getElementById('search-match-count'),
    splitInputCount: document.getElementById('split-input-word-count')
  };

  // === 2. HELPER FUNCTIONS ===

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showNotification(msg, type = 'success') {
    const container = document.getElementById('notification-container');
    const note = document.createElement('div');
    note.className = `notification ${type}`;
    note.textContent = msg;
    container.appendChild(note);
    setTimeout(() => {
      note.style.opacity = '0';
      setTimeout(() => note.remove(), 300); 
    }, 2800); 
  }

  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"') 
      .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'") 
      .replace(/\u00A0/g, ' '); 
  }

  function escapeHTML(str) {
      return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[m]);
  }

  function preserveCase(original, replacement) {
      if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
      if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
      }
      return replacement;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // === 3. CORE LOGIC: REPLACE & AUTO CAPS (From Reference) ===
  
  function performReplaceAll() {
      els.replaceBtn.disabled = true;
      els.replaceBtn.textContent = 'Đang xử lý...';

      setTimeout(() => {
          try {
              executeLogic();
              // Sau khi replace xong, nếu đang có từ khóa tìm kiếm thì highlight luôn
              if (searchKeywords.length > 0) {
                  applySearchHighlights();
              }
          } catch (e) {
              console.error(e);
              showNotification("Có lỗi xảy ra: " + e.message, "error");
          } finally {
              els.replaceBtn.disabled = false;
              els.replaceBtn.textContent = 'THỰC HIỆN THAY THẾ';
          }
      }, 50);
  }

  function executeLogic() {
      const mode = state.modes[state.currentMode];
      if(!mode.pairs.length) return showNotification("Chưa có cặp thay thế nào!", "error");

      let rawText = els.inputText.value;
      if (!rawText) return;

      let processedText = normalizeText(rawText);

      // Sort rules: dài trước ngắn sau
      const rules = mode.pairs
        .filter(p => p.find && p.find.trim())
        .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
        .sort((a,b) => b.find.length - a.find.length);

      let replaceCount = 0;

      // Phase 1: Replacements
      rules.forEach(rule => {
          const pattern = escapeRegExp(rule.find);
          let regex;
          const flags = mode.matchCase ? 'g' : 'gi';
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

      // Phase 2: Auto Caps
      if (mode.autoCaps) {
          const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
          processedText = processedText.replace(autoCapsRegex, (fullMatch, prefix, char) => {
              return `${prefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
          });
      }

      // Phase 3: Render to HTML
      let finalHTML = '';
      let buffer = '';
      
      for (let i = 0; i < processedText.length; i++) {
          const c = processedText[i];
          if (c === MARK_REP_START) { finalHTML += escapeHTML(buffer); buffer = ''; finalHTML += '<mark class="hl-yellow">'; } 
          else if (c === MARK_REP_END) { finalHTML += escapeHTML(buffer); buffer = ''; finalHTML += '</mark>'; } 
          else if (c === MARK_CAP_START) { finalHTML += escapeHTML(buffer); buffer = ''; finalHTML += '<mark class="hl-blue">'; } 
          else if (c === MARK_CAP_END) { finalHTML += escapeHTML(buffer); buffer = ''; finalHTML += '</mark>'; } 
          else { buffer += c; }
      }
      finalHTML += escapeHTML(buffer);

      els.outputText.innerHTML = finalHTML;
      els.inputText.value = ''; 
      saveTempInput(); 
      updateCounters();
      
      if (replaceCount > 0) showNotification(`Đã thay thế ${replaceCount} vị trí!`);
      else if (mode.autoCaps) showNotification(`Đã kiểm tra Auto Caps!`);
      else showNotification(`Không tìm thấy từ nào thay thế.`, 'warning');
  }

  // === 4. SEARCH SIDEBAR LOGIC (MERGED) ===

  function updateFont() {
      els.outputText.style.fontFamily = els.fontFamily.value;
      els.outputText.style.fontSize = els.fontSize.value;
  }

  // Xử lý Accordion cho sidebar
  document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
          header.classList.toggle('collapsed');
          const content = header.nextElementSibling;
          content.classList.toggle('hidden');
      });
  });

  // Toggle Sidebar Collapse
  els.toggleSidebarBtn.onclick = () => {
      els.searchSidebarContainer.classList.toggle('collapsed');
  };

  // Add Keyword
  function addKeyword() {
      const raw = els.kwInput.value;
      if (!raw.trim()) return;
      const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      newKws.forEach(k => {
          if (!searchKeywords.includes(k)) {
              searchKeywords.push(k);
              renderTag(k, searchKeywords.length - 1);
          }
      });
      els.kwInput.value = '';
      applySearchHighlights();
  }

  function renderTag(txt, index) {
      const colorClass = `kw-${index % 6}`; // Sync color logic (0-5)
      const tag = document.createElement('div');
      tag.className = `tag ${colorClass}`;
      tag.innerHTML = `<span>${escapeHTML(txt)}</span><span class="remove-tag">×</span>`;
      tag.querySelector('.remove-tag').onclick = () => {
          searchKeywords = searchKeywords.filter(k => k !== txt);
          tag.remove();
          // Re-render tags to maintain color order or just re-highlight
          // Simple fix: Clear and re-render all tags to sync colors strictly or just remove highlight.
          // Better: Just re-highlight, colors might shift if we don't re-render all. 
          // Let's re-render all tags for perfect color sync.
          renderAllTags();
          applySearchHighlights();
      };
      els.kwTags.appendChild(tag);
  }

  function renderAllTags() {
      els.kwTags.innerHTML = '';
      searchKeywords.forEach((k, i) => renderTag(k, i));
  }

  // Highlight Logic for Search (Applied on top of Output Div)
  function applySearchHighlights() {
      // 1. Remove old search highlights but KEEP replace highlights (hl-yellow, hl-blue)
      // Logic: Unwrap spans with class starting with 'kw-'
      const walker = document.createTreeWalker(els.outputText, NodeFilter.SHOW_ELEMENT, null, false);
      const nodesToUnwrap = [];
      let node;
      while(node = walker.nextNode()) {
          if (node.tagName === 'MARK' && Array.from(node.classList).some(c => c.startsWith('kw-'))) {
              nodesToUnwrap.push(node);
          }
      }
      nodesToUnwrap.forEach(n => {
          const parent = n.parentNode;
          while(n.firstChild) parent.insertBefore(n.firstChild, n);
          parent.removeChild(n);
      });
      els.outputText.normalize();

      if (searchKeywords.length === 0) {
          els.searchMatchCount.classList.add('hidden');
          return;
      }

      // 2. Apply new highlights
      // We need to traverse text nodes. Warning: Don't break existing <mark> tags logic if possible.
      // Strategy: Text Tree Walker.
      const textWalker = document.createTreeWalker(els.outputText, NodeFilter.SHOW_TEXT, null, false);
      const textNodes = [];
      while(node = textWalker.nextNode()) {
          // Skip if parent is a KW mark (shouldn't happen due to unwrap)
          textNodes.push(node);
      }

      const matchCase = els.searchMatchCase.checked;
      const wholeWord = els.searchWholeWords.checked;
      let totalMatches = 0;

      // Sort keywords by length desc
      const sortedKws = searchKeywords.map((k, i) => ({ text: k, idx: i })).sort((a,b) => b.text.length - a.text.length);

      textNodes.forEach(textNode => {
          let content = textNode.nodeValue;
          if (!content) return;
          
          let parent = textNode.parentNode;
          let fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let hasMatch = false;

          // Simple implementation: Only find first matching keyword in text node to avoid complexity of overlapping
          // To allow multiple keywords in one text node, we need a loop.
          
          // Regex construction for all keywords
          // Note: Colors depend on specific keyword index.
          
          // Alternative: Iterate string and find best match at each position.
          // Or split by Regex.
          
          const flags = matchCase ? 'g' : 'gi';
          // Create a master regex: (kw1)|(kw2)|...
          // We need to know which group matched to assign color.
          
          let parts = [];
          let loopText = content;
          let globalOffset = 0;

          // Using a simple replace loop approach on the text content
          // This is tricky with DOM nodes. 
          // Simplified approach: Replace text content with HTML.
          
          // Creating a safe container to handle HTML entities? No, textNode value is raw text.
          
          // Let's use the same logic as Replace: Replace string with markers, then build HTML.
          // We use special markers for search: {{KW_ID_X}}
          
          let processed = content;
          let replacementHappened = false;

          sortedKws.forEach(kwObj => {
               const pattern = escapeRegExp(kwObj.text);
               let regex;
               if (wholeWord) {
                   regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
               } else {
                   regex = new RegExp(pattern, flags);
               }
               
               // We need to mark it but not double-mark.
               // We use a temporary unprintable placeholder range or similar?
               // Since keywords can be subsets, we sort by length.
               // We only mark if not already marked.
               
               // To avoid complexity: One pass using constructed Regex for all keywords is best, 
               // but determining color index is hard with standard replace.
               
               // Let's just do one-by-one replacement with a unique placeholder that contains the color ID.
               // Placeholder: \uE100 + ID + \uE101
               
               processed = processed.replace(regex, (m) => {
                   replacementHappened = true;
                   totalMatches++;
                   return `\uE100${kwObj.idx}\uE101${m}\uE102`;
               });
          });

          if (replacementHappened) {
              const span = document.createElement('span');
              // Parse our custom format back to HTML
              let html = '';
              let buff = '';
              let capturingId = false;
              let idStr = '';
              
              for(let i=0; i<processed.length; i++) {
                  const c = processed[i];
                  if (c === '\uE100') { 
                      html += escapeHTML(buff); buff = ''; capturingId = true; idStr = ''; 
                  } else if (c === '\uE101') { 
                      capturingId = false; 
                      html += `<mark class="kw-${parseInt(idStr) % 6}">`; 
                  } else if (c === '\uE102') {
                      html += escapeHTML(buff); buff = ''; html += '</mark>';
                  } else {
                      if (capturingId) idStr += c;
                      else buff += c;
                  }
              }
              html += escapeHTML(buff);
              span.innerHTML = html;
              parent.replaceChild(span, textNode);
              // Unwrap the container span to keep DOM clean
              while(span.firstChild) parent.insertBefore(span.firstChild, span);
              parent.removeChild(span);
          }
      });
      
      if (totalMatches > 0) {
          els.searchMatchCount.textContent = `Found: ${totalMatches}`;
          els.searchMatchCount.classList.remove('hidden');
      } else {
          els.searchMatchCount.classList.add('hidden');
      }
  }

  // Event Listeners for Search Sidebar
  els.kwInput.addEventListener('keydown', e => { if(e.key === 'Enter') addKeyword(); });
  els.addKwBtn.onclick = addKeyword;
  els.searchTrigger.onclick = applySearchHighlights;
  els.clearSearch.onclick = () => {
      searchKeywords = [];
      renderAllTags();
      applySearchHighlights();
  };
  els.fontFamily.onchange = updateFont;
  els.fontSize.onchange = updateFont;

  // === 5. UI & UTILS (SETTINGS & SPLIT) ===
  
  function renderModeSelect() {
    els.modeSelect.innerHTML = '';
    Object.keys(state.modes).sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      els.modeSelect.appendChild(opt);
    });
    if(!state.modes[state.currentMode]) state.currentMode = 'default';
    els.modeSelect.value = state.currentMode;
    updateModeButtons();
  }

  function updateModeButtons() {
    const isDefault = state.currentMode === 'default';
    els.renameBtn.classList.toggle('hidden', isDefault);
    els.deleteBtn.classList.toggle('hidden', isDefault);
    
    const mode = state.modes[state.currentMode];
    if(mode) {
        els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
        els.matchCaseBtn.classList.toggle('active', mode.matchCase);
        
        els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
        els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
        
        if (mode.autoCaps === undefined) mode.autoCaps = false;
        els.autoCapsBtn.textContent = `Auto Caps: ${mode.autoCaps ? 'BẬT' : 'Tắt'}`;
        els.autoCapsBtn.classList.toggle('active', mode.autoCaps);
    }
  }

  function addPairToUI(find = '', replace = '', append = false) {
    const item = document.createElement('div');
    item.className = 'punctuation-item';
    const safeFind = find.replace(/"/g, '&quot;');
    const safeReplace = replace.replace(/"/g, '&quot;');

    item.innerHTML = `
      <input type="text" class="find" placeholder="Tìm" value="${safeFind}">
      <input type="text" class="replace" placeholder="Thay thế" value="${safeReplace}">
      <button class="remove" tabindex="-1">×</button>
    `;

    item.querySelector('.remove').onclick = () => { item.remove(); checkEmptyState(); saveCurrentPairsToState(true); };
    item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', saveTempInputDebounced));

    if (append) els.list.appendChild(item);
    else els.list.insertBefore(item, els.list.firstChild);
    checkEmptyState();
  }

  function loadSettingsToUI() {
    els.list.innerHTML = '';
    const mode = state.modes[state.currentMode];
    if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true)); 
    updateModeButtons();
    checkEmptyState();
  }

  function checkEmptyState() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }

  function saveCurrentPairsToState(silent = false) {
    const items = Array.from(els.list.children);
    const newPairs = items.map(item => ({
      find: item.querySelector('.find').value,
      replace: item.querySelector('.replace').value 
    })).filter(p => p.find !== '');

    state.modes[state.currentMode].pairs = newPairs;
    saveState();
    if (!silent) showNotification('Đã lưu cài đặt!', 'success');
  }

  function parseCSVLine(text) {
    const result = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } 
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            result.push(cell.trim()); cell = '';
        } else { cell += char; }
    }
    result.push(cell.trim());
    return result;
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/);
        if (!lines[0].toLowerCase().includes('find,replace,mode')) return showNotification('Lỗi Header CSV!', 'error');
        
        let count = 0;
        let importedModeNames = new Set();
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCSVLine(line);
            if (cols.length >= 3) {
                const find = cols[0];
                const replace = cols[1];
                const modeName = cols[2] || 'default';
                if (find) {
                    if (!state.modes[modeName]) state.modes[modeName] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false };
                    state.modes[modeName].pairs.push({ find, replace });
                    importedModeNames.add(modeName);
                    count++;
                }
            }
        }
        saveState(); renderModeSelect();
        if (importedModeNames.has(state.currentMode)) loadSettingsToUI();
        else if(importedModeNames.size > 0) {
             state.currentMode = importedModeNames.values().next().value;
             saveState(); renderModeSelect(); loadSettingsToUI();
        }
        showNotification(`Đã nhập ${count} cặp!`);
    };
    reader.readAsText(file);
  }

  function exportCSV() {
    saveCurrentPairsToState(true);
    let csvContent = "\uFEFFfind,replace,mode\n"; 
    Object.keys(state.modes).forEach(modeName => {
        const mode = state.modes[modeName];
        if (mode.pairs) {
            mode.pairs.forEach(p => {
                const safeFind = `"${(p.find||'').replace(/"/g, '""')}"`;
                const safeReplace = `"${(p.replace||'').replace(/"/g, '""')}"`;
                const safeMode = `"${modeName.replace(/"/g, '""')}"`;
                csvContent += `${safeFind},${safeReplace},${safeMode}\n`;
            });
        }
    });
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'settings_trinh_hg_final.csv'; a.click();
  }

  // --- SPLIT LOGIC ---
  function performSplit() {
    const text = els.splitInput.value;
    if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');
    const normalizedText = normalizeText(text);
    const lines = normalizedText.split('\n');
    let chapterHeader = '', contentBody = normalizedText;
    
    if (/^(Chương|Chapter)\s+\d+/.test(lines[0].trim())) {
        chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n');
    }
    
    const paragraphs = contentBody.split('\n').filter(p => p.trim());
    const totalWords = countWords(contentBody);
    const targetWords = Math.ceil(totalWords / currentSplitMode);
    
    let parts = [], currentPart = [], currentCount = 0;
    
    for (let p of paragraphs) {
        const wCount = countWords(p);
        if (currentCount + wCount > targetWords && parts.length < currentSplitMode - 1) {
            parts.push(currentPart.join('\n\n')); 
            currentPart = [p]; currentCount = wCount;
        } else { 
            currentPart.push(p); currentCount += wCount; 
        }
    }
    if (currentPart.length) parts.push(currentPart.join('\n\n'));

    for(let i = 0; i < currentSplitMode; i++) {
        const el = document.getElementById(`out-${i+1}-text`);
        const cEl = document.getElementById(`out-${i+1}-count`);
        if(el) {
            let ph = ''; 
            if (chapterHeader) ph = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`) + '\n\n';
            el.value = ph + (parts[i] || '');
            if(cEl) cEl.textContent = 'Words: ' + countWords(el.value);
        }
    }
    els.splitInput.value = '';
    saveTempInput();
    showNotification('Đã chia xong!', 'success');
  }

  function renderSplitOutputs(count) {
    els.splitWrapper.innerHTML = '';
    els.splitWrapper.style.gridTemplateColumns = `repeat(${Math.min(count, 4)}, 1fr)`;
    for(let i = 1; i <= Math.min(count, 10); i++) {
        const div = document.createElement('div'); div.className = 'split-box';
        div.innerHTML = `
            <div class="split-header"><span>Phần ${i}</span><span id="out-${i}-count" class="badge">Words: 0</span></div>
            <textarea id="out-${i}-text" class="custom-scrollbar" readonly></textarea>
            <div class="split-footer"><button class="btn btn-secondary full-width copy-btn" data-target="out-${i}-text">Sao chép phần ${i}</button></div>
        `;
        els.splitWrapper.appendChild(div);
    }
    els.splitWrapper.querySelectorAll('.copy-btn').forEach(b => b.onclick = e => {
        const el = document.getElementById(e.target.dataset.target);
        if(el.value) { navigator.clipboard.writeText(el.value); showNotification(`Đã sao chép P${e.target.dataset.target.split('-')[1]}`); }
    });
  }

  function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }
  
  function updateCounters() {
    els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
    els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
    els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
  }

  function saveTempInputDebounced() { 
    clearTimeout(saveTimeout); 
    saveTimeout = setTimeout(saveTempInput, 500); 
  }
  
  function saveTempInput() { 
    localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ 
        inputText: els.inputText.value, 
        splitInput: els.splitInput.value 
    })); 
  }
  
  function loadTempInput() {
    const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(saved) { 
        els.inputText.value = saved.inputText || ''; 
        els.splitInput.value = saved.splitInput || ''; 
    }
    updateCounters();
  }
  
  function switchTab(tabId) {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
      state.activeTab = tabId; 
      saveState();
  }

  function initEvents() {
    document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    
    // Toggle Buttons Logic
    els.matchCaseBtn.onclick = () => { const m = state.modes[state.currentMode]; m.matchCase = !m.matchCase; saveState(); updateModeButtons(); };
    els.wholeWordBtn.onclick = () => { const m = state.modes[state.currentMode]; m.wholeWord = !m.wholeWord; saveState(); updateModeButtons(); };
    els.autoCapsBtn.onclick = () => { const m = state.modes[state.currentMode]; m.autoCaps = !m.autoCaps; saveState(); updateModeButtons(); };
    
    // Mode Management
    els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
    document.getElementById('add-mode').onclick = () => { 
        const n = prompt('Tên Mode:'); 
        if(n && !state.modes[n]) { 
            state.modes[n] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }; 
            state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); 
        }
    };
    document.getElementById('copy-mode').onclick = () => { 
        const n = prompt('Tên Mode Copy:'); 
        if(n && !state.modes[n]) { 
            state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); 
            state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); 
        }
    };
    els.renameBtn.onclick = () => { 
        const n = prompt('Tên mới:', state.currentMode); 
        if(n && n !== state.currentMode && !state.modes[n]) { 
            state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; 
            state.currentMode = n; saveState(); renderModeSelect(); 
        }
    };
    els.deleteBtn.onclick = () => { 
        if(state.currentMode !== 'default' && confirm('Xóa chế độ này?')) { 
            delete state.modes[state.currentMode]; state.currentMode = 'default'; 
            saveState(); renderModeSelect(); loadSettingsToUI(); 
        }
    };
    
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
    
    els.replaceBtn.onclick = performReplaceAll;
    
    document.getElementById('copy-button').onclick = () => { 
        if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText); showNotification('Đã sao chép!'); }
    };

    document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
        document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); 
        btn.classList.add('active'); 
        currentSplitMode = parseInt(btn.dataset.split); renderSplitOutputs(currentSplitMode); 
    });
    document.getElementById('split-action-btn').onclick = performSplit;
    
    document.getElementById('export-settings').onclick = exportCSV;
    document.getElementById('import-settings').onclick = () => { 
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; 
        inp.onchange=e=>{if(e.target.files.length) importCSV(e.target.files[0])}; 
        inp.click(); 
    };

    [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); saveTempInputDebounced(); }));
  }

  // INIT
  renderModeSelect(); 
  loadSettingsToUI(); 
  loadTempInput(); 
  renderSplitOutputs(currentSplitMode); 
  if(state.activeTab) switchTab(state.activeTab); 
  initEvents();
  updateFont(); // Init font styles
});
