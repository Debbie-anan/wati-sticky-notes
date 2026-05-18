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
    // 从 CONTACT ATTRIBUTES 区域读取 name 字段
    const allEls = document.querySelectorAll('span, div, h3, h4, p, td');
    let attrSection = null;
    for (const el of allEls) {
      if (el.children.length <= 2 && el.textContent.trim() === 'CONTACT ATTRIBUTES') {
        attrSection = el.closest('div[class]') || el.parentElement;
        break;
      }
    }

    if (attrSection) {
      const labels = attrSection.querySelectorAll('span, div, td, label, p');
      for (const label of labels) {
        if (label.children.length > 1) continue;
        const t = label.textContent.trim();
        if (t === 'name' || t === 'Name') {
          const row = label.closest('tr') || label.closest('div[class]') || label.parentElement;
          if (row) {
            const cells = row.querySelectorAll('span, div, td, p, a');
            for (const cell of cells) {
              if (cell.contains(label) && cell === label) continue;
              const val = cell.textContent.trim();
              if (val && val !== 'name' && val !== 'Name' && val.length >= 2 && val.length <= 60) {
                return val;
              }
            }
          }
          const next = label.nextElementSibling;
          if (next) {
            const val = next.textContent.trim();
            if (val && val.length >= 2 && val.length <= 60) return val;
          }
        }
      }
    }

    // 后备：从右侧面板顶部读取客户名（CONTACT INFO 上方的大标题）
    const headers = document.querySelectorAll('span, div, h1, h2, h3, h4');
    for (const el of headers) {
      if (el.children.length <= 1 && el.textContent.trim() === 'CONTACT INFO') {
        let container = el.closest('div[class]') || el.parentElement;
        if (container) container = container.parentElement;
        if (container) {
          const first = container.querySelector('span, div, h1, h2, h3, h4');
          if (first) {
            const val = first.textContent.trim();
            if (val && val !== 'CONTACT INFO' && val.length >= 2 && val.length <= 60 && !/^\+?\(?\d[\d\s()+-]+\d$/.test(val) && !/^(CONTACT|Phone|User|CX)/i.test(val)) {
              return val;
            }
          }
        }
        break;
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
