(function () {
  let currentCustomerId = null;
  let saveTimeout = null;

  function getCustomerIdFromUrl() {
    const match = window.location.pathname.match(/\/teamInbox\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  function createStickyNote() {
    const container = document.createElement('div');
    container.id = 'wati-sticky-note';

    container.innerHTML = `
      <div id="wati-sticky-mini-icon">📝</div>
      <div id="wati-sticky-header">
        <span class="title">便签</span>
        <button id="wati-sticky-copy" title="复制名字">📋</button>
        <div class="actions">
          <button id="wati-sticky-minimize" title="最小化">−</button>
        </div>
      </div>
      <div id="wati-sticky-body">
        <textarea id="wati-sticky-textarea" placeholder="在此输入备注..."></textarea>
        <div id="wati-sticky-status"></div>
      </div>
    `;

    document.body.appendChild(container);
    setupDrag(container);
    setupMinimize(container);
    setupAutoSave();
    setupCopy(container);
    restorePosition(container);
  }

  function setupCopy(container) {
    const copyBtn = container.querySelector('#wati-sticky-copy');
    copyBtn.addEventListener('click', () => {
      const title = container.querySelector('.title');
      const text = title.textContent.trim();
      if (text && text !== '便签') {
        navigator.clipboard.writeText(text).then(() => {
          const status = document.getElementById('wati-sticky-status');
          status.textContent = '已复制';
          setTimeout(() => { status.textContent = ''; }, 1500);
        });
      }
    });
  }

  function setupDrag(container) {
    const header = container.querySelector('#wati-sticky-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      offsetX = e.clientX - container.offsetLeft;
      offsetY = e.clientY - container.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, e.clientX - offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, e.clientY - offsetY));
      container.style.left = x + 'px';
      container.style.top = y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        savePosition(container);
      }
    });
  }

  function setupMinimize(container) {
    const minimizeBtn = container.querySelector('#wati-sticky-minimize');
    const miniIcon = container.querySelector('#wati-sticky-mini-icon');

    minimizeBtn.addEventListener('click', () => {
      container.classList.add('minimized');
      localStorage.setItem('wati_sticky_minimized', 'true');
    });

    miniIcon.addEventListener('click', () => {
      container.classList.remove('minimized');
      localStorage.setItem('wati_sticky_minimized', 'false');
    });

    if (localStorage.getItem('wati_sticky_minimized') === 'true') {
      container.classList.add('minimized');
    }
  }

  function setupAutoSave() {
    const textarea = document.getElementById('wati-sticky-textarea');
    textarea.addEventListener('input', () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveNote(), 500);
    });
  }

  function saveNote() {
    if (!currentCustomerId) return;
    const textarea = document.getElementById('wati-sticky-textarea');
    const status = document.getElementById('wati-sticky-status');
    const key = 'note_' + currentCustomerId;

    chrome.storage.sync.set({ [key]: textarea.value }, () => {
      status.textContent = '已保存';
      setTimeout(() => { status.textContent = ''; }, 1500);
    });
  }

  function getCustomerDisplayName() {
    // 1. 精确选择器：WATI 右侧面板的客户名
    const selectors = [
      '[data-testid="teamInbox-rightSide-conversationList-profileName"]',
      '[class*="sidebar"] [class*="user-info"] div',
      '[class*="sidebar_user-info"] div',
      '[class*="user-info-wrap"] div',
      '[class*="profileName"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length >= 2 && text.length <= 60 && !/^\+?\(?\d[\d\s()+-]+\d$/.test(text) && !/^(CONTACT|Phone|User|CX)/i.test(text)) {
          return text;
        }
      }
    }

    // 2. 后备：获取电话号码
    const labels = document.querySelectorAll('span, div, td, label');
    for (const el of labels) {
      if (el.children.length > 2) continue;
      if (el.textContent.trim() === 'Phone Number') {
        const parent = el.parentElement;
        if (parent) {
          const texts = parent.querySelectorAll('span, a, div');
          for (const t of texts) {
            const val = t.textContent.trim();
            if (val && val !== 'Phone Number' && /\+?\(?\d/.test(val)) return val;
          }
        }
      }
    }

    return null;
  }

  function updateTitle(customerId, retries) {
    const title = document.querySelector('#wati-sticky-header .title');
    const name = getCustomerDisplayName();
    if (name) {
      title.textContent = name;
    } else if (retries > 0) {
      setTimeout(() => updateTitle(customerId, retries - 1), 500);
    } else {
      title.textContent = customerId;
    }
  }

  function loadNote(customerId) {
    const textarea = document.getElementById('wati-sticky-textarea');
    const title = document.querySelector('#wati-sticky-header .title');

    if (!customerId) {
      textarea.value = '';
      textarea.disabled = true;
      textarea.placeholder = '请选择一个对话...';
      title.textContent = '便签';
      return;
    }

    textarea.disabled = false;
    textarea.placeholder = '在此输入备注...';

    updateTitle(customerId, 5);

    const key = 'note_' + customerId;
    chrome.storage.sync.get(key, (result) => {
      textarea.value = result[key] || '';
    });
  }

  function savePosition(container) {
    const pos = { left: container.style.left, top: container.style.top };
    localStorage.setItem('wati_sticky_position', JSON.stringify(pos));
  }

  function restorePosition(container) {
    const saved = localStorage.getItem('wati_sticky_position');
    if (saved) {
      const pos = JSON.parse(saved);
      container.style.left = pos.left;
      container.style.top = pos.top;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }
  }

  function checkUrlChange() {
    const newId = getCustomerIdFromUrl();
    if (newId !== currentCustomerId) {
      currentCustomerId = newId;
      loadNote(currentCustomerId);
    }
  }

  createStickyNote();
  checkUrlChange();
  setInterval(checkUrlChange, 500);
})();
