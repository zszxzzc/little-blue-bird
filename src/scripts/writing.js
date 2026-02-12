// writing.js - 写作模块
(function() {
  const { invoke } = window.__TAURI__.core;

  // 全局状态
  let currentStructure = null;
  let currentChapterId = null;
  let autoSaveTimer = null;
  let currentInfoPanel = null;
  let currentChapterMemo = null;
  let memoSaveTimer = null;
  let characters = [];
  let foreshadows = [];
  let editingCharId = null;
  let writingBird = null;
  let aiWordCounter = 0; // AI 评价触发计数
  let collapsedVolumes = JSON.parse(localStorage.getItem('writing-collapsed-volumes') || '[]');

  // 等待页面切换到写作页面时初始化
  window.addEventListener('page-change', (e) => {
    if (e.detail === 'writing') initWriting();
  });

  async function initWriting() {
    console.log('写作模块初始化');
    setupInfoTabs();
    setupToolbar();
    setupTree();
    setupContextMenu();
    setupCharacterProfile();
    setupForeshadowDialogs();
    setupWorldbuildingTab();
    setupAiToolbarButtons();
    initBird();
    await loadStructure();
    await loadInfoPanel();
    await loadCharacters();
    await loadForeshadows();
    await loadWorldbuilding();
    await refreshStatusbar();
  }

  // 加载写作结构
  async function loadStructure() {
    try {
      currentStructure = await invoke('get_writing_structure');
      renderTree();
    } catch(e) {
      console.error('加载结构失败:', e);
    }
  }

  // 加载信息面板
  async function loadInfoPanel() {
    try {
      currentInfoPanel = await invoke('get_info_panel');
      renderInfoPanel();
    } catch(e) {
      console.error('加载信息面板失败:', e);
    }
  }

  // 渲染信息面板（设定和备忘仍用旧逻辑，人物和伏笔用新渲染器）
  function renderInfoPanel() {
    if (!currentInfoPanel) return;

    // 只渲染 settings 面板（人物和伏笔有专门的渲染函数）
    const settingsPanel = document.getElementById('panel-settings');
    if (settingsPanel) {
      const items = currentInfoPanel.settings || [];
      if (items.length === 0) {
        settingsPanel.innerHTML = '<button class="info-add-btn" onclick="window.writingAddInfoItem(\'settings\')">+ 添加设定</button><div class="info-empty">暂无内容</div>';
      } else {
        settingsPanel.innerHTML = '<button class="info-add-btn" onclick="window.writingAddInfoItem(\'settings\')">+ 添加设定</button>' +
          items.map(item => `
          <div class="info-item" data-id="${item.id}">
            <div class="info-item-content">${escapeHtml(item.content)}</div>
            <div class="info-item-meta">
              <span class="info-item-time">${item.created_at}</span>
              <button class="info-item-delete" onclick="window.writingDeleteInfoItem('settings', '${item.id}')" title="删除">×</button>
            </div>
          </div>
        `).join('');
      }
    }
  }

  // 加载章节备忘
  async function loadChapterMemo(chapterId) {
    if (!chapterId) return;

    try {
      currentChapterMemo = await invoke('load_chapter_memo', { chapterId });
      renderChapterMemo();
    } catch(e) {
      console.error('加载章节备忘失败:', e);
    }
  }

  // 渲染章节备忘
  function renderChapterMemo() {
    if (!currentChapterMemo) return;

    const outlineEl = document.getElementById('chapterOutline');
    const moodEl = document.getElementById('chapterMood');
    const notesEl = document.getElementById('chapterNotes');

    if (outlineEl) outlineEl.value = currentChapterMemo.outline || '';
    if (moodEl) moodEl.value = currentChapterMemo.mood || '';
    if (notesEl) notesEl.value = currentChapterMemo.notes || '';
  }

  // 保存章节备忘
  async function saveChapterMemo() {
    if (!currentChapterMemo) return;

    const outlineEl = document.getElementById('chapterOutline');
    const moodEl = document.getElementById('chapterMood');
    const notesEl = document.getElementById('chapterNotes');

    currentChapterMemo.outline = outlineEl ? outlineEl.value : '';
    currentChapterMemo.mood = moodEl ? moodEl.value : '';
    currentChapterMemo.notes = notesEl ? notesEl.value : '';

    try {
      await invoke('save_chapter_memo', { memo: currentChapterMemo });
    } catch(e) {
      console.error('保存章节备忘失败:', e);
    }
  }

  // 添加信息项
  window.writingAddInfoItem = async function(panelType) {
    const content = prompt('请输入内容：');
    if (!content || !content.trim()) return;

    try {
      currentInfoPanel = await invoke('add_info_item', {
        panelType,
        content: content.trim()
      });
      renderInfoPanel();
    } catch(e) {
      alert('添加失败: ' + e);
    }
  };

  // 删除信息项
  window.writingDeleteInfoItem = async function(panelType, itemId) {
    if (!confirm('确定删除这条信息吗？')) return;

    try {
      currentInfoPanel = await invoke('delete_info_item', {
        panelType,
        itemId
      });
      renderInfoPanel();
    } catch(e) {
      alert('删除失败: ' + e);
    }
  };

  // 当前树风格
  let treeStyle = localStorage.getItem('writing-tree-style') || 'hybrid';

  // 设置树的事件监听
  function setupTree() {
    const addVolumeBtn = document.getElementById('addVolumeBtn');
    if (addVolumeBtn) {
      addVolumeBtn.addEventListener('click', createVolume);
    }

    // 风格切换按钮
    const toggleBtn = document.getElementById('treeStyleToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', cycleTreeStyle);
    }

    // 初始化风格属性
    applyTreeStyle();

    // 双击卷标题 → 内联编辑
    const treeEl = document.getElementById('writingTree');
    if (treeEl) {
      treeEl.addEventListener('dblclick', (e) => {
        const volTitle = e.target.closest('.tree-volume-title');
        if (volTitle) {
          const volEl = volTitle.closest('.tree-volume');
          if (volEl) startInlineEdit(volTitle, volEl.dataset.volumeId, 'volume');
          return;
        }
        const chapTitle = e.target.closest('.tree-chapter-title');
        if (chapTitle) {
          const chapEl = chapTitle.closest('.tree-chapter');
          const volEl = chapTitle.closest('.tree-volume');
          if (chapEl && volEl) startInlineEdit(chapTitle, volEl.dataset.volumeId, 'chapter', chapEl.dataset.chapterId);
        }
      });
    }
  }

  // 风格循环切换
  const TREE_STYLES = ['apple', 'nest', 'hybrid'];
  const TREE_STYLE_LABELS = { apple: '简约', nest: '小窝', hybrid: '混合' };

  function cycleTreeStyle() {
    const idx = TREE_STYLES.indexOf(treeStyle);
    treeStyle = TREE_STYLES[(idx + 1) % TREE_STYLES.length];
    localStorage.setItem('writing-tree-style', treeStyle);
    applyTreeStyle();
    renderTree();
    // 简短提示当前风格
    const btn = document.getElementById('treeStyleToggle');
    if (btn) {
      btn.title = '风格：' + TREE_STYLE_LABELS[treeStyle];
    }
  }

  function applyTreeStyle() {
    const sidebar = document.getElementById('writingSidebarLeft');
    if (sidebar) sidebar.setAttribute('data-tree-style', treeStyle);
  }

  // === 内联编辑系统 ===

  function startInlineEdit(titleEl, volumeId, type, chapterId) {
    if (titleEl.querySelector('input')) return; // 已在编辑中
    const oldText = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-inline-input';
    input.value = oldText;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    const commit = async () => {
      const val = input.value.trim();
      if (!val || val === oldText) {
        titleEl.textContent = oldText;
        return;
      }
      try {
        if (type === 'volume') {
          currentStructure = await invoke('update_volume', { volumeId, title: val });
        } else {
          currentStructure = await invoke('update_chapter', { volumeId, chapterId, title: val });
        }
        renderTree();
      } catch(e) {
        titleEl.textContent = oldText;
        alert('更新失败: ' + e);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { titleEl.textContent = oldText; }
    });
    input.addEventListener('blur', commit);
  }

  function createInlineNewInput(container, placeholder, onConfirm) {
    const row = document.createElement('div');
    row.className = 'tree-inline-new';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-inline-input';
    input.placeholder = placeholder;
    row.appendChild(input);
    container.appendChild(row);
    input.focus();

    // 新建动画
    requestAnimationFrame(() => row.classList.add('entering'));

    const commit = async () => {
      const val = input.value.trim();
      if (row.parentNode) row.remove();
      if (val) await onConfirm(val);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { if (row.parentNode) row.remove(); }
    });
    input.addEventListener('blur', commit);
  }

  // 渲染树形结构（根据当前风格分发）
  function renderTree() {
    const treeEl = document.getElementById('writingTree');
    if (!treeEl) return;

    if (!currentStructure || currentStructure.volumes.length === 0) {
      if (treeStyle === 'nest') {
        treeEl.innerHTML = '<div class="tree-empty-hint">🐦 还没有内容呢，点 + 开始写吧~</div>';
      } else if (treeStyle === 'hybrid') {
        treeEl.innerHTML = '<div class="tree-empty-hint">🕊️ 暂无内容，点击 + 新建卷</div>';
      } else {
        treeEl.innerHTML = '<div class="tree-empty-hint">暂无内容，点击 + 新建卷</div>';
      }
      return;
    }

    const renderers = { apple: renderTreeApple, nest: renderTreeNest, hybrid: renderTreeHybrid };
    const render = renderers[treeStyle] || renderTreeHybrid;
    treeEl.innerHTML = render(currentStructure.volumes);

    // 绑定折叠事件
    treeEl.querySelectorAll('.tree-volume-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const volId = btn.closest('.tree-volume').dataset.volumeId;
        toggleVolume(volId);
      });
    });
  }

  function toggleVolume(volId) {
    const idx = collapsedVolumes.indexOf(volId);
    if (idx >= 0) collapsedVolumes.splice(idx, 1);
    else collapsedVolumes.push(volId);
    localStorage.setItem('writing-collapsed-volumes', JSON.stringify(collapsedVolumes));
    renderTree();
  }

  const STATUS_LABEL = { empty: '', draft: '草稿', done: '完成', published: '已发' };

  function chapterNumStr(i) {
    return String(i + 1).padStart(2, '0');
  }

  // --- apple 风格 ---
  function renderTreeApple(volumes) {
    return volumes.map(vol => {
      const collapsed = collapsedVolumes.includes(vol.id);
      const count = vol.chapters.length;
      return `
      <div class="tree-volume" data-volume-id="${vol.id}">
        <div class="tree-volume-header">
          <button class="tree-volume-toggle ${collapsed ? 'collapsed' : ''}" title="${collapsed ? '展开' : '折叠'}">‹</button>
          <span class="tree-volume-title">${escapeHtml(vol.title)}</span>
          <span class="tree-volume-meta">${count}章</span>
          <div class="tree-volume-actions">
            <button class="tree-btn" onclick="window.writingAddChapter('${vol.id}')" title="新建章">+</button>
            <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteVolume('${vol.id}')" title="删除">×</button>
          </div>
        </div>
        <div class="tree-chapters ${collapsed ? 'tree-collapsed' : ''}">
          ${vol.chapters.map((chap, i) => `
            <div class="tree-chapter ${currentChapterId === chap.id ? 'active' : ''}" data-chapter-id="${chap.id}">
              <span class="tree-chapter-num">${chapterNumStr(i)}</span>
              <span class="tree-chapter-title" onclick="window.writingLoadChapter('${chap.id}')">${escapeHtml(chap.title)}</span>
              ${chap.status && chap.status !== 'empty' ? `<span class="tree-chapter-status tree-status-${chap.status}">${STATUS_LABEL[chap.status] || ''}</span>` : ''}
              <div class="tree-chapter-actions">
                <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteChapter('${vol.id}', '${chap.id}')" title="删除">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }).join('');
  }

  // --- nest 风格 ---
  function renderTreeNest(volumes) {
    return volumes.map(vol => {
      const collapsed = collapsedVolumes.includes(vol.id);
      const count = vol.chapters.length;
      return `
      <div class="tree-volume" data-volume-id="${vol.id}">
        <div class="tree-volume-header">
          <button class="tree-volume-toggle ${collapsed ? 'collapsed' : ''}" title="${collapsed ? '展开' : '折叠'}">‹</button>
          <span class="tree-volume-title">🪺 ${escapeHtml(vol.title)}</span>
          <span class="tree-volume-meta">${count === 0 ? '空巢' : count + '羽'}</span>
          <div class="tree-volume-actions">
            <button class="tree-btn" onclick="window.writingAddChapter('${vol.id}')" title="新建章">+</button>
            <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteVolume('${vol.id}')" title="删除">×</button>
          </div>
        </div>
        <div class="tree-chapters ${collapsed ? 'tree-collapsed' : ''}">
          ${count === 0
            ? '<div class="tree-chapter-empty">🐣 这个窝还是空的~</div>'
            : vol.chapters.map((chap, i) => `
            <div class="tree-chapter ${currentChapterId === chap.id ? 'active' : ''}" data-chapter-id="${chap.id}">
              <span class="tree-chapter-num">🪶${chapterNumStr(i)}</span>
              <span class="tree-chapter-title" onclick="window.writingLoadChapter('${chap.id}')">${escapeHtml(chap.title)}</span>
              ${chap.status && chap.status !== 'empty' ? `<span class="tree-chapter-status tree-status-${chap.status}">${STATUS_LABEL[chap.status] || ''}</span>` : ''}
              <div class="tree-chapter-actions">
                <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteChapter('${vol.id}', '${chap.id}')" title="删除">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }).join('');
  }

  // --- hybrid 风格 ---
  const FEATHER_SVG = '<svg class="feather-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="16" y1="8" x2="2" y2="22" stroke="currentColor" stroke-width="1.5"/></svg>';

  function renderTreeHybrid(volumes) {
    return volumes.map(vol => {
      const collapsed = collapsedVolumes.includes(vol.id);
      const count = vol.chapters.length;
      return `
      <div class="tree-volume" data-volume-id="${vol.id}">
        <div class="tree-volume-header">
          <button class="tree-volume-toggle ${collapsed ? 'collapsed' : ''}" title="${collapsed ? '展开' : '折叠'}">‹</button>
          ${FEATHER_SVG}
          <span class="tree-volume-title">${escapeHtml(vol.title)}</span>
          <span class="tree-volume-meta">${count}章</span>
          <div class="tree-volume-actions">
            <button class="tree-btn" onclick="window.writingAddChapter('${vol.id}')" title="新建章">+</button>
            <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteVolume('${vol.id}')" title="删除">×</button>
          </div>
        </div>
        <div class="tree-chapters ${collapsed ? 'tree-collapsed' : ''}">
          ${count === 0
            ? '<div class="tree-chapter-empty">🐦 点 + 添加章节</div>'
            : vol.chapters.map((chap, i) => `
            <div class="tree-chapter ${currentChapterId === chap.id ? 'active' : ''}" data-chapter-id="${chap.id}">
              <span class="tree-chapter-num">${chapterNumStr(i)}</span>
              <span class="tree-status-dot ${chap.status || 'empty'}"></span>
              <span class="tree-chapter-title" onclick="window.writingLoadChapter('${chap.id}')">${escapeHtml(chap.title)}</span>
              ${chap.status && chap.status !== 'empty' ? `<span class="tree-chapter-status tree-status-${chap.status}">${STATUS_LABEL[chap.status] || ''}</span>` : ''}
              <div class="tree-chapter-actions">
                <button class="tree-btn tree-btn-danger" onclick="window.writingDeleteChapter('${vol.id}', '${chap.id}')" title="删除">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
    }).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // === 卷章操作函数 ===

  // 创建卷（内联输入）
  async function createVolume() {
    const treeEl = document.getElementById('writingTree');
    if (!treeEl) return;
    // 移除空提示
    const emptyHint = treeEl.querySelector('.empty-hint');
    if (emptyHint) emptyHint.remove();

    createInlineNewInput(treeEl, '输入卷标题…', async (title) => {
      try {
        currentStructure = await invoke('create_volume', { title });
        renderTree();
      } catch(e) {
        alert('创建失败: ' + e);
      }
    });
  }

  // 创建章（内联输入）
  window.writingAddChapter = async function(volumeId) {
    const volEl = document.querySelector(`.tree-volume[data-volume-id="${volumeId}"]`);
    if (!volEl) return;
    const chaptersEl = volEl.querySelector('.tree-chapters');
    if (!chaptersEl) return;
    // 移除空状态提示
    const emptyEl = chaptersEl.querySelector('.nest-chapter-empty, .hybrid-chapter-empty');
    if (emptyEl) emptyEl.remove();

    createInlineNewInput(chaptersEl, '输入章标题…', async (title) => {
      try {
        currentStructure = await invoke('create_chapter', { volumeId, title });
        renderTree();
      } catch(e) {
        alert('创建失败: ' + e);
      }
    });
  };

  // 编辑卷标题（内联编辑，由双击触发或按钮触发）
  window.writingEditVolume = async function(volumeId) {
    const volEl = document.querySelector(`.tree-volume[data-volume-id="${volumeId}"]`);
    if (!volEl) return;
    const titleEl = volEl.querySelector('.tree-volume-title');
    if (!titleEl) return;
    startInlineEdit(titleEl, volumeId, 'volume');
  };

  // 编辑章标题（内联编辑，由双击触发或按钮触发）
  window.writingEditChapter = async function(volumeId, chapterId) {
    const volEl = document.querySelector(`.tree-volume[data-volume-id="${volumeId}"]`);
    if (!volEl) return;
    const chapEl = volEl.querySelector(`.tree-chapter[data-chapter-id="${chapterId}"]`);
    if (!chapEl) return;
    const titleEl = chapEl.querySelector('.tree-chapter-title');
    if (!titleEl) return;
    startInlineEdit(titleEl, volumeId, 'chapter', chapterId);
  };

  // 删除卷
  window.writingDeleteVolume = async function(volumeId) {
    const volume = currentStructure.volumes.find(v => v.id === volumeId);
    if (!volume) return;

    if (!confirm(`确定删除卷"${volume.title}"及其所有章节吗？`)) return;

    try {
      currentStructure = await invoke('delete_volume', { volumeId });
      renderTree();
      // 如果当前章节被删除，清空编辑器
      if (currentChapterId) {
        const chapterExists = currentStructure.volumes.some(v =>
          v.chapters.some(c => c.id === currentChapterId)
        );
        if (!chapterExists) {
          currentChapterId = null;
          document.getElementById('writingEditor').value = '';
        }
      }
    } catch(e) {
      alert('删除失败: ' + e);
    }
  };

  // 删除章
  window.writingDeleteChapter = async function(volumeId, chapterId) {
    const volume = currentStructure.volumes.find(v => v.id === volumeId);
    if (!volume) return;
    const chapter = volume.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    if (!confirm(`确定删除章节"${chapter.title}"吗？`)) return;

    try {
      currentStructure = await invoke('delete_chapter', { volumeId, chapterId });
      renderTree();
      // 如果删除的是当前章节，清空编辑器
      if (currentChapterId === chapterId) {
        currentChapterId = null;
        document.getElementById('writingEditor').value = '';
      }
    } catch(e) {
      alert('删除失败: ' + e);
    }
  };

  // 加载章节内容
  window.writingLoadChapter = async function(chapterId) {
    // 保存当前章节
    if (currentChapterId && currentChapterId !== chapterId) {
      await saveCurrentChapter();
    }

    try {
      const content = await invoke('load_chapter_content', { chapterId });
      currentChapterId = chapterId;
      document.getElementById('writingEditor').value = content;
      renderTree(); // 更新激活状态
      startAutoSave();
      updateWordCount(); // 更新字数统计
      renderCharacters(); // 刷新人物出场次数
      renderForeshadows(); // 刷新伏笔已过章数
      await loadChapterMemo(chapterId); // 加载章节备忘
      await refreshStatusbar(); // 刷新状态栏
      const saveStatus = document.getElementById('wsSaveStatus');
      if (saveStatus) saveStatus.textContent = '已保存 ✓';
    } catch(e) {
      alert('加载失败: ' + e);
    }
  };

  // 保存当前章节
  async function saveCurrentChapter() {
    if (!currentChapterId) {
      const saveStatus = document.getElementById('wsSaveStatus');
      if (saveStatus) saveStatus.textContent = '请先选择章节';
      return;
    }

    const editor = document.getElementById('writingEditor');
    const content = editor.value;
    const saveStatus = document.getElementById('wsSaveStatus');

    try {
      if (saveStatus) saveStatus.textContent = '保存中…';
      await invoke('save_chapter_content', {
        chapterId: currentChapterId,
        content
      });
      updateStatus('已保存');
      if (saveStatus) saveStatus.textContent = '已保存 ✓';
    } catch(e) {
      updateStatus('保存失败: ' + e);
      if (saveStatus) saveStatus.textContent = '保存失败';
    }
  }

  // 启动自动保存
  function startAutoSave() {
    stopAutoSave();
    autoSaveTimer = setInterval(() => {
      if (currentChapterId) {
        saveCurrentChapter();
      }
    }, 30000); // 每30秒自动保存
  }

  // 字数统计（中文按字符、英文按空格分词）
  function countWords(text) {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return chinese + english;
  }

  // 更新字数统计（编辑器 + 状态栏）
  function updateWordCount() {
    const editor = document.getElementById('writingEditor');
    const content = editor.value;
    const words = countWords(content);

    // 工具栏状态
    const status = document.getElementById('writingStatus');
    if (status && currentChapterId) {
      status.textContent = `${words} 字`;
    }

    // 底部状态栏 - 本章字数
    const wsChapter = document.getElementById('wsChapterCount');
    if (wsChapter) wsChapter.textContent = `本章：${words} 字`;

    // 小鸟里程碑检查
    if (writingBird) writingBird.checkMilestone(words);
  }

  // 导出内容
  async function exportContent() {
    if (!currentChapterId) {
      alert('请先打开一个章节');
      return;
    }

    // 获取当前章节信息
    let chapterTitle = '未命名';
    for (const vol of currentStructure.volumes) {
      const chapter = vol.chapters.find(c => c.id === currentChapterId);
      if (chapter) {
        chapterTitle = chapter.title;
        break;
      }
    }

    const editor = document.getElementById('writingEditor');
    const content = editor.value;

    // 创建下载
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chapterTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus('已导出');
  }

  // 停止自动保存
  function stopAutoSave() {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  // 更新状态提示
  function updateStatus(msg) {
    const status = document.getElementById('writingStatus');
    if (status) {
      status.textContent = msg;
      setTimeout(() => status.textContent = '', 2000);
    }
  }

  // 信息面板 tab 切换
  function setupInfoTabs() {
    const tabs = document.querySelectorAll('.writing-info-tab');
    const panels = document.querySelectorAll('.writing-info-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // 切换 tab 激活状态
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 切换 panel 显示
        panels.forEach(p => p.classList.remove('active'));
        const targetPanel = document.getElementById(`panel-${targetTab}`);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });
  }

  // 工具栏功能
  function setupToolbar() {
    const focusBtn = document.getElementById('writingFocusBtn');
    const layout = document.querySelector('.writing-layout');

    // 专注模式切换
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        layout.classList.toggle('focus-mode');
        const isFocus = layout.classList.contains('focus-mode');
        focusBtn.querySelector('span').textContent = isFocus ? '退出' : '专注';
      });
    }

    // 保存按钮
    const saveBtn = document.getElementById('writingSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveCurrentChapter();
      });
    }

    // 导出按钮
    const exportBtn = document.getElementById('writingExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportContent);
    }

    // 伏笔按钮
    const foreshadowBtn = document.getElementById('writingForeshadowBtn');
    if (foreshadowBtn) {
      foreshadowBtn.addEventListener('click', openForeshadowCreate);
    }

    // 编辑器输入事件 - 更新字数统计 + 小鸟响应
    const editor = document.getElementById('writingEditor');
    if (editor) {
      editor.addEventListener('input', (e) => {
        updateWordCount();
        // 标记未保存
        const saveStatus = document.getElementById('wsSaveStatus');
        if (saveStatus) saveStatus.textContent = '未保存';
        // 通知小鸟
        if (writingBird) writingBird.onInput(e);
        // AI 评价计数
        trackAiComment(e);
      });
    }

    // 章节备忘输入事件 - 自动保存
    const outlineEl = document.getElementById('chapterOutline');
    const moodEl = document.getElementById('chapterMood');
    const notesEl = document.getElementById('chapterNotes');

    const autoSaveMemo = () => {
      clearTimeout(memoSaveTimer);
      memoSaveTimer = setTimeout(() => {
        saveChapterMemo();
      }, 2000); // 2秒后自动保存
    };

    if (outlineEl) outlineEl.addEventListener('input', autoSaveMemo);
    if (moodEl) moodEl.addEventListener('input', autoSaveMemo);
    if (notesEl) notesEl.addEventListener('input', autoSaveMemo);
  }

  // === 人物系统 ===

  const ROLE_LABELS = { protagonist: '主角', supporting: '配角', antagonist: '反派', minor: '路人' };

  async function loadCharacters() {
    try {
      const result = await invoke('get_characters');
      characters = Array.isArray(result) ? result : (result.characters || []);
    } catch(e) {
      characters = [];
      console.error('加载人物失败:', e);
    }
    renderCharacters();
  }

  function renderCharacters() {
    const list = document.getElementById('characterList');
    const addBtn = document.getElementById('addCharacterBtn');
    if (!list) return;

    if (characters.length === 0) {
      list.innerHTML = '<div class="info-empty">暂无人物</div>';
      return;
    }

    list.innerHTML = characters.map(c => {
      const role = c.role || 'minor';
      const label = ROLE_LABELS[role] || '路人';
      // 统计出场次数：扫描当前编辑器中的 @人物名
      const editor = document.getElementById('writingEditor');
      const text = editor ? editor.value : '';
      const regex = new RegExp('@' + escapeRegex(c.name), 'g');
      const count = (text.match(regex) || []).length;

      return `<div class="character-item" data-char-id="${c.id}">
        <span class="character-dot ${role}"></span>
        <span class="character-name" onclick="window.writingOpenCharProfile('${c.id}')">${escapeHtml(c.name)}</span>
        <span class="character-tag">${label}</span>
        <span class="character-count">出场 ${count} 次</span>
      </div>`;
    }).join('');
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function setupCharacterProfile() {
    const overlay = document.getElementById('charProfileOverlay');
    const closeBtn = document.getElementById('charProfileCloseBtn');
    const saveBtn = document.getElementById('charProfileSaveBtn');
    const deleteBtn = document.getElementById('charProfileDeleteBtn');
    const addBtn = document.getElementById('addCharacterBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

    if (addBtn) addBtn.addEventListener('click', () => {
      editingCharId = null;
      document.getElementById('charProfileTitle').textContent = '新建人物';
      document.getElementById('charName').value = '';
      document.getElementById('charRole').value = 'supporting';
      document.getElementById('charAppearance').value = '';
      document.getElementById('charPersonality').value = '';
      document.getElementById('charAbilities').value = '';
      document.getElementById('charRelationships').value = '';
      document.getElementById('charChapters').textContent = '保存后自动统计';
      deleteBtn.style.display = 'none';
      overlay.classList.add('open');
    });

    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('charName').value.trim();
      if (!name) return;

      const charData = {
        name,
        role: document.getElementById('charRole').value,
        appearance: document.getElementById('charAppearance').value.trim(),
        personality: document.getElementById('charPersonality').value.trim(),
        abilities: document.getElementById('charAbilities').value.trim(),
        relationships: document.getElementById('charRelationships').value.trim(),
      };

      try {
        if (editingCharId) {
          await invoke('update_character', { charId: editingCharId, charData });
        } else {
          await invoke('add_character', { charData });
        }
        overlay.classList.remove('open');
        await loadCharacters();
      } catch(e) {
        alert('保存失败: ' + e);
      }
    });

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      if (!editingCharId) return;
      if (!confirm('确定删除这个人物吗？')) return;
      try {
        await invoke('delete_character', { charId: editingCharId });
        overlay.classList.remove('open');
        await loadCharacters();
      } catch(e) {
        alert('删除失败: ' + e);
      }
    });
  }

  window.writingOpenCharProfile = async function(charId) {
    const c = characters.find(ch => ch.id === charId);
    if (!c) return;

    editingCharId = charId;
    const overlay = document.getElementById('charProfileOverlay');
    document.getElementById('charProfileTitle').textContent = `人物档案 - ${c.name}`;
    document.getElementById('charName').value = c.name || '';
    document.getElementById('charRole').value = c.role || 'supporting';
    document.getElementById('charAppearance').value = c.appearance || '';
    document.getElementById('charPersonality').value = c.personality || '';
    document.getElementById('charAbilities').value = c.abilities || '';
    document.getElementById('charRelationships').value = c.relationships || '';
    document.getElementById('charProfileDeleteBtn').style.display = '';

    // 出场章节统计
    try {
      const chapters = await invoke('get_character_chapters', { charId });
      document.getElementById('charChapters').textContent = chapters.length > 0
        ? chapters.join('、') : '暂无出场记录';
    } catch(e) {
      document.getElementById('charChapters').textContent = '统计失败';
    }

    overlay.classList.add('open');
  };

  // === 伏笔系统 ===

  async function loadForeshadows() {
    try {
      const result = await invoke('get_foreshadows');
      foreshadows = Array.isArray(result) ? result : (result.items || []);
    } catch(e) {
      foreshadows = [];
      console.error('加载伏笔失败:', e);
    }
    renderForeshadows();
  }

  function renderForeshadows() {
    const list = document.getElementById('foreshadowList');
    if (!list) return;

    if (foreshadows.length === 0) {
      list.innerHTML = '<div class="info-empty">暂无伏笔</div>';
      return;
    }

    // 获取当前章节序号用于计算已过章数
    const currentIdx = getChapterIndex(currentChapterId);

    list.innerHTML = foreshadows.map(fs => {
      if (fs.status === 'resolved') {
        return `<div class="foreshadow-item resolved" data-fs-id="${fs.id}">
          <span class="foreshadow-status done">✅</span>
          <span>${escapeHtml(fs.source_chapter || '?')} → ${escapeHtml(fs.resolved_chapter || '?')}：${escapeHtml(fs.description)}</span>
          ${fs.resolved_quote ? `<div class="foreshadow-resolved-info">回收引文：${escapeHtml(fs.resolved_quote)}</div>` : ''}
        </div>`;
      }

      const sourceIdx = getChapterIndex(fs.source_chapter);
      const age = (currentIdx >= 0 && sourceIdx >= 0) ? currentIdx - sourceIdx : 0;
      let urgencyIcon = '🟢';
      let ageClass = '';
      let ageWarning = '';
      if (age > 10) { urgencyIcon = '🔴'; ageClass = 'urgent'; ageWarning = ' ⚠️'; }
      else if (age >= 5) { urgencyIcon = '🟡'; ageClass = 'warn'; }

      const chapterLabel = getChapterLabel(fs.source_chapter);

      return `<div class="foreshadow-item active" data-fs-id="${fs.id}">
        <div class="foreshadow-header">
          <span class="foreshadow-status">${urgencyIcon}</span>
          <span class="foreshadow-source">${escapeHtml(chapterLabel)}埋下</span>
          <span class="foreshadow-age ${ageClass}">已过 ${age} 章${ageWarning}</span>
        </div>
        <div class="foreshadow-desc">${escapeHtml(fs.description)}</div>
        ${fs.source_quote ? `<div class="foreshadow-quote">"${escapeHtml(fs.source_quote)}"</div>` : ''}
        <button class="btn-tiny" onclick="window.writingResolveForeshadow('${fs.id}')">标记回收</button>
      </div>`;
    }).join('');
  }

  // 获取章节在全书中的序号
  function getChapterIndex(chapterId) {
    if (!currentStructure || !chapterId) return -1;
    let idx = 0;
    for (const vol of currentStructure.volumes) {
      for (const chap of vol.chapters) {
        if (chap.id === chapterId) return idx;
        idx++;
      }
    }
    return -1;
  }

  // 获取章节显示名
  function getChapterLabel(chapterId) {
    if (!currentStructure || !chapterId) return chapterId || '?';
    let idx = 0;
    for (const vol of currentStructure.volumes) {
      for (const chap of vol.chapters) {
        if (chap.id === chapterId) return chap.title || `第${idx + 1}章`;
        idx++;
      }
    }
    return chapterId;
  }

  function setupForeshadowDialogs() {
    // 创建伏笔弹窗
    const createOverlay = document.getElementById('foreshadowCreateOverlay');
    const createClose = document.getElementById('fsCreateCloseBtn');
    const createSave = document.getElementById('fsCreateSaveBtn');

    if (createClose) createClose.addEventListener('click', () => createOverlay.classList.remove('open'));
    if (createOverlay) createOverlay.addEventListener('click', (e) => { if (e.target === createOverlay) createOverlay.classList.remove('open'); });

    if (createSave) createSave.addEventListener('click', async () => {
      const desc = document.getElementById('fsDescription').value.trim();
      if (!desc) { alert('请填写伏笔描述'); return; }

      const fsData = {
        description: desc,
        source_quote: document.getElementById('fsQuote').value.trim(),
        source_chapter: currentChapterId || '',
        expected_chapter: document.getElementById('fsExpectedChapter').value.trim(),
      };

      try {
        await invoke('add_foreshadow', { fsData });
        createOverlay.classList.remove('open');
        await loadForeshadows();
      } catch(e) {
        alert('创建失败: ' + e);
      }
    });

    // 回收伏笔弹窗
    const resolveOverlay = document.getElementById('foreshadowResolveOverlay');
    const resolveClose = document.getElementById('fsResolveCloseBtn');

    if (resolveClose) resolveClose.addEventListener('click', () => resolveOverlay.classList.remove('open'));
    if (resolveOverlay) resolveOverlay.addEventListener('click', (e) => { if (e.target === resolveOverlay) resolveOverlay.classList.remove('open'); });
  }

  function openForeshadowCreate() {
    const editor = document.getElementById('writingEditor');
    const selectedText = editor ? editor.value.substring(editor.selectionStart, editor.selectionEnd) : '';

    document.getElementById('fsDescription').value = '';
    document.getElementById('fsQuote').value = selectedText;
    document.getElementById('fsExpectedChapter').value = '';
    document.getElementById('foreshadowCreateOverlay').classList.add('open');
  }

  // 标记回收伏笔
  window.writingResolveForeshadow = async function(fsId) {
    const editor = document.getElementById('writingEditor');
    const selectedText = editor ? editor.value.substring(editor.selectionStart, editor.selectionEnd) : '';

    try {
      await invoke('resolve_foreshadow', {
        fsId,
        resolvedChapter: currentChapterId || '',
        resolvedQuote: selectedText,
      });
      await loadForeshadows();
    } catch(e) {
      alert('回收失败: ' + e);
    }
  };

  // === 右键菜单 ===

  function setupContextMenu() {
    const editor = document.getElementById('writingEditor');
    const menu = document.getElementById('writingContextMenu');
    const resolveItem = document.getElementById('ctxResolveForeshadow');

    if (!editor || !menu) return;

    editor.addEventListener('contextmenu', (e) => {
      const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
      if (!selectedText) return; // 没选中文字不弹菜单

      e.preventDefault();
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.classList.add('open');
    });

    document.addEventListener('click', () => {
      menu.classList.remove('open');
    });

    if (resolveItem) {
      resolveItem.addEventListener('click', () => {
        menu.classList.remove('open');
        openResolveDialog();
      });
    }
  }

  function openResolveDialog() {
    const editor = document.getElementById('writingEditor');
    const selectedText = editor ? editor.value.substring(editor.selectionStart, editor.selectionEnd) : '';

    document.getElementById('fsResolveQuote').value = selectedText;

    // 渲染未回收伏笔列表
    const list = document.getElementById('fsResolveList');
    const active = foreshadows.filter(fs => fs.status !== 'resolved');

    if (active.length === 0) {
      list.innerHTML = '<div class="info-empty">暂无未回收伏笔</div>';
    } else {
      list.innerHTML = active.map(fs => `
        <div class="fs-resolve-item" onclick="window.writingDoResolve('${fs.id}')">
          <div class="foreshadow-desc">${escapeHtml(fs.description)}</div>
          ${fs.source_quote ? `<div class="foreshadow-quote">"${escapeHtml(fs.source_quote)}"</div>` : ''}
        </div>
      `).join('');
    }

    document.getElementById('foreshadowResolveOverlay').classList.add('open');
  }

  window.writingDoResolve = async function(fsId) {
    const quote = document.getElementById('fsResolveQuote').value.trim();
    try {
      await invoke('resolve_foreshadow', {
        fsId,
        resolvedChapter: currentChapterId || '',
        resolvedQuote: quote,
      });
      document.getElementById('foreshadowResolveOverlay').classList.remove('open');
      await loadForeshadows();
    } catch(e) {
      alert('回收失败: ' + e);
    }
  };

  // === 底部状态栏 ===

  async function refreshStatusbar() {
    try {
      const stats = await invoke('get_writing_stats');
      const wsTotalEl = document.getElementById('wsTotalCount');
      const wsTodayEl = document.getElementById('wsTodayCount');
      const wsStreakEl = document.getElementById('wsStreak');

      if (wsTotalEl) wsTotalEl.textContent = `全书：${stats.total_words || 0} 字`;
      if (wsTodayEl) wsTodayEl.textContent = `今日：${stats.today_words || 0} 字`;
      if (wsStreakEl) wsStreakEl.textContent = `连续写作：${stats.streak_days || 0} 天`;
    } catch(e) {
      // 后端未就绪时静默失败
      console.error('加载写作统计失败:', e);
    }
    // 更新本章字数
    updateWordCount();
  }

  // ============================================
  // 小鸟性格台词库
  // ============================================
  const BIRD_LINES = {
    gentle: {
      open:        ["欢迎回来~今天也一起加油吧", "又见面了，准备好写了吗？"],
      typing:      ["写得不错哦，继续~", "嗯嗯，我在看着呢"],
      typingFast:  ["哇，好快！灵感来了吗？", "手速好快，加油加油~"],
      idle:        ["休息一下也好~", "想不出来的话，深呼吸试试？"],
      deleteLarge: ["删掉也没关系的，重新来~", "有时候推倒重来反而更好呢"],
      milestone1k: ["一千字了！你好棒~", "稳步前进中~"],
      milestone3k: ["三千字！今天超厉害的", "写了好多呢，辛苦了~"],
      lateNight:   ["已经很晚了哦，注意休息~", "熬夜对身体不好...再写一点就睡吧？"],
      foreshadow:  ["那条伏笔...要不要看看？", "有个伏笔好久没回收了呢~"],
      comeback:    ["好久不见！想你了~", "你终于回来了，我一直在等你"],
    },
    sarcastic: {
      open:        ["哟，今天居然来写了？", "来了？我还以为你弃坑了"],
      typing:      ["就这？继续啊", "嗯...凑合吧"],
      typingFast:  ["打字倒是挺快，质量呢？", "这速度...你在水字数吧"],
      idle:        ["发什么呆呢，写啊", "卡文了？意料之中"],
      deleteLarge: ["哈哈哈删了这么多，早说写得不行嘛", "推倒重来？勇气可嘉"],
      milestone1k: ["才一千字就想邀功？", "一千字，离完结还远着呢"],
      milestone3k: ["三千字，行吧，算你今天没摸鱼", "居然写了三千字，太阳打西边出来了？"],
      lateNight:   ["都几点了还不睡，明天又要起不来", "熬夜写的质量能看吗？"],
      foreshadow:  ["有个坑你还没填，读者要骂了", "伏笔忘了吧？"],
      comeback:    ["哦，回来了？我还以为你转行了", "消失了好久，读者都跑光了"],
    },
    chuuni: {
      open:        ["哼，你终于来了。本鸟等你很久了", "命运的笔...再次觉醒了！"],
      typing:      ["继续吧...让本鸟见识你的创世之力", "这股文字的力量...还不够！"],
      typingFast:  ["这速度...！难道你觉醒了？！", "不可能...凡人怎能有如此笔速！"],
      idle:        ["怎么停下了？难道被黑暗侵蚀了？", "本鸟感受到了...你内心的迷茫"],
      deleteLarge: ["愚蠢！那可是蕴含力量的文字！", "毁灭与重生...这也是一种力量"],
      milestone1k: ["一千字的封印...已被突破！", "这只是开始，真正的力量还在沉睡"],
      milestone3k: ["三千字！这已经超越了凡人的极限！", "不可思议的力量...本鸟都感到颤抖"],
      lateNight:   ["深夜...是力量最强的时刻。本鸟允许你继续", "黑暗中的创作...别有一番风味"],
      foreshadow:  ["那条命运之线...你感觉不到吗？", "伏笔在呼唤你！那是未完成的宿命！"],
      comeback:    ["本鸟以为你已经被黑暗吞噬了", "你回来了...看来命运还没有放弃你"],
    },
    cold: {
      open:        ["来了", "嗯"],
      typing:      ["..."],
      typingFast:  ["速度不错"],
      idle:        ["...要写就写", ""],
      deleteLarge: ["删了啊", "嗯，重写吧"],
      milestone1k: ["一千", "继续"],
      milestone3k: ["三千字了", "还行"],
      lateNight:   ["该睡了", "...太晚了"],
      foreshadow:  ["伏笔", "有个坑没填"],
      comeback:    ["回来了", "...好久"],
    },
  };

  const BIRD_COMMENT_PROMPTS = {
    gentle: '你是一只温柔的小蓝鸟，是作者的写作伙伴。用一句话评价这段文字（不超过20字）。语气温暖鼓励，像朋友。',
    sarcastic: '你是一只毒舌的小蓝鸟。用一句话吐槽这段文字（不超过20字）。嘴毒但不恶意，像损友。',
    chuuni: '你是一只中二的小蓝鸟，自称"本鸟"，说话浮夸。用一句话评价这段文字（不超过20字）。用中二的方式表达。',
    cold: '你是一只话很少的小蓝鸟。用最简短的话评价这段文字（不超过10字）。能不说就不说。',
    custom: null,
  };

  // ============================================
  // 小鸟状态枚举
  // ============================================
  const BirdState = {
    IDLE: 'idle',
    PEEKING: 'peeking',
    SURPRISED: 'surprised',
    SLEEPING: 'sleeping',
    LAUGHING: 'laughing',
    READING: 'reading',
    GONE: 'gone',
    SPEAKING: 'speaking',
  };

  // ============================================
  // WritingBird 类
  // ============================================
  class WritingBird {
    constructor() {
      this.state = BirdState.IDLE;
      this.lastInputTime = Date.now();
      this.inputSpeed = 0;
      this.deletedCount = 0;
      this.idleTimer = null;
      this.speechTimer = null;
      this.muted = false;
      this.personality = 'gentle';
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.chatOpen = false;

      this.el = document.getElementById('writingBird');
      this.speechEl = document.getElementById('birdSpeech');
      this.speechTextEl = document.getElementById('birdSpeechText');
      this.bodyEl = document.getElementById('birdBody');

      this.loadConfig();
      this.setupDrag();
      this.setupInteractions();
      this.resetIdleTimer();

      // 打开时说话
      setTimeout(() => this.speak('open'), 500);
    }

    async loadConfig() {
      try {
        const cfg = await invoke('get_config');
        if (cfg.personality && (BIRD_LINES[cfg.personality] || cfg.personality === 'custom')) {
          this.personality = cfg.personality;
        }
        if (cfg.bird_size) {
          this.el.setAttribute('data-size', cfg.bird_size);
        }
        if (cfg.bird_muted) {
          this.muted = true;
        }
      } catch(e) {
        // 静默
      }
    }

    // === 输入响应 ===
    onInput(event) {
      const now = Date.now();
      const timeDiff = now - this.lastInputTime;
      this.lastInputTime = now;

      if (timeDiff < 5000 && timeDiff > 0) {
        this.inputSpeed = 60000 / timeDiff;
      }

      const inputType = event.inputType || '';
      if (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') {
        this.deletedCount++;
        if (this.deletedCount > 50) {
          this.setState(BirdState.LAUGHING);
          this.speak('deleteLarge');
          this.deletedCount = 0;
        }
      } else {
        this.deletedCount = 0;
        if (this.inputSpeed > 120) {
          this.setState(BirdState.SURPRISED);
          if (Math.random() < 0.15) this.speak('typingFast');
        } else {
          this.setState(BirdState.PEEKING);
          if (Math.random() < 0.05) this.speak('typing');
        }
      }

      this.resetIdleTimer();
    }

    resetIdleTimer() {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.setState(BirdState.SLEEPING);
        this.speak('idle');
        this.idleTimer = setTimeout(() => {
          this.setState(BirdState.GONE);
        }, 300000);
      }, 120000);
    }

    setState(newState) {
      if (this.state === newState) return;
      this.state = newState;
      this.updateVisual();
    }

    updateVisual() {
      if (this.el) {
        this.el.setAttribute('data-expression', this.state);
      }
    }

    // === 说话系统 ===
    speak(trigger, customText) {
      if (this.muted && trigger !== 'aiComment') return;
      const line = customText || this.getLine(trigger);
      if (!line) return;

      this.speechTextEl.textContent = line;
      this.speechEl.classList.add('visible');
      clearTimeout(this.speechTimer);
      this.speechTimer = setTimeout(() => {
        this.speechEl.classList.remove('visible');
      }, 4000);
    }

    getLine(trigger) {
      const p = this.personality;
      if (p === 'custom') {
        // 自定义性格只有 AI 评价，预设台词用 gentle 兜底
        const lines = BIRD_LINES.gentle[trigger];
        if (!lines || lines.length === 0) return null;
        return lines[Math.floor(Math.random() * lines.length)];
      }
      const lines = BIRD_LINES[p]?.[trigger];
      if (!lines || lines.length === 0) return null;
      return lines[Math.floor(Math.random() * lines.length)];
    }

    // === 拖拽 ===
    setupDrag() {
      if (!this.el) return;
      this.el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // 只响应左键
        this.isDragging = true;
        this.el.classList.add('dragging');
        const rect = this.el.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const container = this.el.parentElement;
        if (!container) return;
        const cRect = container.getBoundingClientRect();
        let x = e.clientX - cRect.left - this.dragOffset.x;
        let y = e.clientY - cRect.top - this.dragOffset.y;
        // 限制在容器内
        const bw = this.el.offsetWidth;
        const bh = this.el.offsetHeight;
        x = Math.max(0, Math.min(x, cRect.width - bw));
        y = Math.max(0, Math.min(y, cRect.height - bh));
        this.el.style.left = x + 'px';
        this.el.style.top = y + 'px';
        this.el.style.right = 'auto';
      });

      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.el.classList.remove('dragging');
        }
      });
    }

    // === 交互 ===
    setupInteractions() {
      if (!this.el) return;
      let clickTimer = null;

      // 单击 → 随机说话
      this.el.addEventListener('click', (e) => {
        if (this.isDragging) return;
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          // 双击 → 对话模式
          this.toggleChat();
          return;
        }
        clickTimer = setTimeout(() => {
          clickTimer = null;
          const triggers = ['typing', 'idle', 'open'];
          const t = triggers[Math.floor(Math.random() * triggers.length)];
          this.speak(t);
        }, 250);
      });

      // 右键 → 设置菜单
      this.el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e.clientX, e.clientY);
      });

      // 小鸟右键菜单事件
      const menu = document.getElementById('birdContextMenu');
      if (menu) {
        menu.addEventListener('click', (e) => {
          const item = e.target.closest('.context-menu-item');
          if (!item) return;
          const action = item.dataset.action;
          if (action.startsWith('personality-')) {
            this.personality = action.replace('personality-', '');
            this.updateContextMenuActive();
            // 显示/隐藏自定义性格编辑区
            const customEl = document.getElementById('customPersonality');
            if (customEl) customEl.style.display = this.personality === 'custom' ? 'block' : 'none';
          } else if (action.startsWith('size-')) {
            const size = action.replace('size-', '');
            this.el.setAttribute('data-size', size);
          } else if (action === 'mute') {
            this.muted = !this.muted;
            item.textContent = this.muted ? '取消静音' : '静音';
          }
          menu.classList.remove('open');
        });

        document.addEventListener('click', () => menu.classList.remove('open'));
      }

      // 对话框发送
      const chatSend = document.getElementById('birdChatSend');
      const chatInput = document.getElementById('birdChatInput');
      if (chatSend && chatInput) {
        const sendMsg = async () => {
          const text = chatInput.value.trim();
          if (!text) return;
          chatInput.value = '';
          this.addChatMsg(text, 'user');
          try {
            const result = await invoke('ai_bird_comment', {
              text: text,
              prompt: '你是一只小蓝鸟写作伙伴。用户在和你聊剧情，用简短的话回应（不超过50字）。性格：' + this.personality,
            });
            this.addChatMsg(result, 'bird');
          } catch(e) {
            this.addChatMsg('（连接失败了...）', 'bird');
          }
        };
        chatSend.addEventListener('click', sendMsg);
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') sendMsg();
        });
      }
    }

    showContextMenu(x, y) {
      const menu = document.getElementById('birdContextMenu');
      if (!menu) return;
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.classList.add('open');
      this.updateContextMenuActive();
    }

    updateContextMenuActive() {
      const menu = document.getElementById('birdContextMenu');
      if (!menu) return;
      menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.classList.remove('active-item');
        const action = item.dataset.action;
        if (action === 'personality-' + this.personality) item.classList.add('active-item');
        const size = this.el.getAttribute('data-size');
        if (action === 'size-' + size) item.classList.add('active-item');
      });
    }

    toggleChat() {
      const box = document.getElementById('birdChatBox');
      if (!box) return;
      this.chatOpen = !this.chatOpen;
      box.classList.toggle('open', this.chatOpen);
      if (this.chatOpen) {
        document.getElementById('birdChatInput')?.focus();
      }
    }

    addChatMsg(text, role) {
      const msgs = document.getElementById('birdChatMessages');
      if (!msgs) return;
      const div = document.createElement('div');
      div.className = 'bird-chat-msg ' + role;
      div.textContent = text;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    // 字数里程碑检查
    checkMilestone(wordCount) {
      if (wordCount >= 3000 && wordCount < 3010) {
        this.speak('milestone3k');
      } else if (wordCount >= 1000 && wordCount < 1010) {
        this.speak('milestone1k');
      }
      // 深夜检查
      const hour = new Date().getHours();
      if (hour >= 23 || hour < 5) {
        if (Math.random() < 0.02) this.speak('lateNight');
      }
    }

    // 切换到阅读状态（查设定时）
    setReading(isReading) {
      if (isReading) {
        this.setState(BirdState.READING);
      } else if (this.state === BirdState.READING) {
        this.setState(BirdState.IDLE);
      }
    }
  }

  // === 初始化小鸟 ===
  function initBird() {
    writingBird = new WritingBird();
  }

  // === AI 评价触发（每300字） ===
  function trackAiComment(event) {
    const inputType = event.inputType || '';
    if (inputType.startsWith('delete')) return;
    aiWordCounter++;
    if (aiWordCounter >= 300) {
      aiWordCounter = 0;
      triggerAiComment();
    }
  }

  async function triggerAiComment() {
    if (!writingBird) return;
    const editor = document.getElementById('writingEditor');
    if (!editor) return;
    const text = editor.value;
    const recentText = text.slice(-500); // 最近500字
    if (recentText.length < 50) return;

    const personality = writingBird.personality;
    let prompt = BIRD_COMMENT_PROMPTS[personality];
    if (personality === 'custom') {
      try {
        const cfg = await invoke('get_config');
        const cp = cfg.custom_personality;
        if (cp && cp.description) {
          prompt = cp.description + '\n口癖：' + (cp.catchphrase || '') + '\n用一句话评价这段文字，不超过25字。';
        } else {
          prompt = BIRD_COMMENT_PROMPTS.gentle;
        }
      } catch(e) {
        prompt = BIRD_COMMENT_PROMPTS.gentle;
      }
    }

    try {
      const result = await invoke('ai_bird_comment', {
        text: recentText,
        prompt: prompt,
      });
      if (result && writingBird) {
        writingBird.speak('aiComment', result);
      }
    } catch(e) {
      // AI 不可用时静默
      console.log('AI 评价失败:', e);
    }
  }

  // ============================================
  // AI 工具栏按钮
  // ============================================
  function setupAiToolbarButtons() {
    const suggestBtn = document.getElementById('writingAiSuggestBtn');
    const checkBtn = document.getElementById('writingAiCheckBtn');

    if (suggestBtn) {
      suggestBtn.addEventListener('click', async () => {
        const editor = document.getElementById('writingEditor');
        if (!editor || !editor.value.trim()) return;
        const lastParagraph = editor.value.split('\n').filter(Boolean).slice(-3).join('\n');
        suggestBtn.disabled = true;
        suggestBtn.querySelector('span:last-child').textContent = '思考中...';
        try {
          const result = await invoke('ai_writing_suggest', {
            book_id: 'default',
            chapter_id: currentChapterId || '',
            context: lastParagraph,
          });
          showAiSuggestResult(result);
        } catch(e) {
          alert('AI 建议失败: ' + e);
        } finally {
          suggestBtn.disabled = false;
          suggestBtn.querySelector('span:last-child').textContent = 'AI建议';
        }
      });
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', async () => {
        const editor = document.getElementById('writingEditor');
        if (!editor || !editor.value.trim()) return;
        checkBtn.disabled = true;
        checkBtn.querySelector('span:last-child').textContent = '检查中...';
        try {
          const result = await invoke('ai_consistency_check', {
            book_id: 'default',
            chapter_id: currentChapterId || '',
          });
          showAiSuggestResult(result, '一致性检查结果');
        } catch(e) {
          alert('一致性检查失败: ' + e);
        } finally {
          checkBtn.disabled = false;
          checkBtn.querySelector('span:last-child').textContent = '检查';
        }
      });
    }
  }

  function simpleMarkdown(text) {
    // 先转义 HTML，再处理 markdown 语法
    let html = escapeHtml(text || '无结果');
    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 行首 - 或 数字. 作为列表项
    html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li><span class="ai-list-num">$1.</span> $2</li>');
    // 连续 <li> 包裹 <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function showAiSuggestResult(text, title) {
    let overlay = document.querySelector('.ai-suggest-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ai-suggest-overlay';
      overlay.innerHTML = `
        <div class="ai-suggest-panel">
          <div class="report-panel-header">
            <span class="ai-suggest-title"></span>
            <button class="settings-close-btn ai-suggest-close">✕</button>
          </div>
          <div class="ai-suggest-content"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('ai-suggest-close')) {
          overlay.classList.remove('open');
        }
      });
    }
    overlay.querySelector('.ai-suggest-title').textContent = title || 'AI 建议';
    overlay.querySelector('.ai-suggest-content').innerHTML = simpleMarkdown(text);
    overlay.classList.add('open');
  }

  // ============================================
  // 设定集 Tab（世界观搜索）
  // ============================================
  let worldbuildingData = [];

  function setupWorldbuildingTab() {
    const searchInput = document.getElementById('worldbuildingSearchInput');
    const addBtn = document.getElementById('addWorldbuildingBtn');

    if (searchInput) {
      let searchTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          searchWorldbuilding(searchInput.value.trim());
        }, 300);
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const title = prompt('设定标题：');
        if (!title || !title.trim()) return;
        const content = prompt('设定内容：');
        if (!content) return;

        try {
          const newItem = { title: title.trim(), content: content.trim() };
          worldbuildingData.push(newItem);
          await invoke('save_worldbuilding', {
            book_id: 'default',
            data: { items: worldbuildingData },
          });
          renderWorldbuilding();
        } catch(e) {
          alert('保存设定失败: ' + e);
        }
      });
    }
  }

  async function loadWorldbuilding() {
    try {
      const data = await invoke('get_worldbuilding', { book_id: 'default' });
      worldbuildingData = (data && data.items) ? data.items : [];
      renderWorldbuilding();
    } catch(e) {
      worldbuildingData = [];
      renderWorldbuilding();
    }
  }

  function renderWorldbuilding() {
    const list = document.getElementById('worldbuildingList');
    if (!list) return;
    if (worldbuildingData.length === 0) {
      list.innerHTML = '<div class="info-empty">暂无设定</div>';
      return;
    }
    list.innerHTML = worldbuildingData.map((item, idx) => `
      <div class="worldbuilding-item" data-idx="${idx}">
        <div class="worldbuilding-item-title">${escapeHtml(item.title || '')}</div>
        <div class="worldbuilding-item-content">${escapeHtml(item.content || '')}</div>
        <button class="worldbuilding-item-delete" onclick="window.writingDeleteWorldbuilding(${idx})">×</button>
      </div>
    `).join('');
  }

  async function searchWorldbuilding(keyword) {
    const resultsEl = document.getElementById('worldbuildingResults');
    if (!resultsEl) return;
    if (!keyword) {
      resultsEl.innerHTML = '';
      return;
    }

    // 小鸟切换到阅读状态
    if (writingBird) writingBird.setReading(true);

    try {
      const results = await invoke('search_worldbuilding', { book_id: 'default', keyword });
      if (results && results.length > 0) {
        resultsEl.innerHTML = results.map(r => `
          <div class="worldbuilding-result-item">
            <span class="worldbuilding-result-highlight">${escapeHtml(r.title || '')}</span>
            <div>${escapeHtml(r.snippet || r.content || '')}</div>
          </div>
        `).join('');
      } else {
        // 本地搜索兜底
        const local = worldbuildingData.filter(item =>
          (item.title && item.title.includes(keyword)) ||
          (item.content && item.content.includes(keyword))
        );
        if (local.length > 0) {
          resultsEl.innerHTML = local.map(r => `
            <div class="worldbuilding-result-item">
              <span class="worldbuilding-result-highlight">${escapeHtml(r.title || '')}</span>
              <div>${escapeHtml(r.content || '')}</div>
            </div>
          `).join('');
        } else {
          resultsEl.innerHTML = '<div class="info-empty">未找到相关设定</div>';
        }
      }
    } catch(e) {
      // 后端不可用时本地搜索
      const local = worldbuildingData.filter(item =>
        (item.title && item.title.includes(keyword)) ||
        (item.content && item.content.includes(keyword))
      );
      resultsEl.innerHTML = local.length > 0
        ? local.map(r => `
            <div class="worldbuilding-result-item">
              <span class="worldbuilding-result-highlight">${escapeHtml(r.title || '')}</span>
              <div>${escapeHtml(r.content || '')}</div>
            </div>
          `).join('')
        : '<div class="info-empty">未找到相关设定</div>';
    }

    setTimeout(() => {
      if (writingBird) writingBird.setReading(false);
    }, 2000);
  }

  window.writingDeleteWorldbuilding = async function(idx) {
    if (!confirm('确定删除这条设定吗？')) return;
    worldbuildingData.splice(idx, 1);
    try {
      await invoke('save_worldbuilding', {
        book_id: 'default',
        data: { items: worldbuildingData },
      });
    } catch(e) { /* 静默 */ }
    renderWorldbuilding();
  };

})();
