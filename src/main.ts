import './style.css';

// ============ Types ============
interface ClipItem {
  id: string;
  content: string;
  type: 'text' | 'url' | 'image';
  time: number;
  preview?: string;
}

// ============ Storage ============
const DB_KEY = 'clip_backup_items';
// const SERVER_URL = 'https://clipbackup.ziriji.com'; // 备用

function loadItems(): ClipItem[] {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '[]');
  } catch { return []; }
}

function saveItems(items: ClipItem[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(items));
  updateStats();
}

// ============ UI Helpers ============
let toastTimer: ReturnType<typeof setTimeout>;

function showToast(msg: string) {
  const toast = document.getElementById('toast')!;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

function detectType(text: string): 'text' | 'url' | 'image' {
  if (/^https?:\/\//i.test(text)) return 'url';
  if (/^data:image\//i.test(text)) return 'image';
  return 'text';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function calcStorageSize(): string {
  const raw = localStorage.getItem(DB_KEY) || '';
  const kb = (new Blob([raw]).size / 1024);
  return kb < 1 ? `${Math.round(kb * 1024)} B` : `${kb.toFixed(1)} KB`;
}

function updateStats() {
  const items = loadItems();
  document.getElementById('totalCount')!.textContent = String(items.length);
  document.getElementById('storageSize')!.textContent = calcStorageSize();
}

// ============ Render ============
let currentSearch = '';

function renderList(items: ClipItem[]) {
  const list = document.getElementById('list')!;
  const empty = document.getElementById('empty')!;

  const filtered = currentSearch
    ? items.filter(i => i.content.toLowerCase().includes(currentSearch.toLowerCase()))
    : items;

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.add('show');
    return;
  }

  empty.classList.remove('show');
  list.innerHTML = filtered.map(item => {
    const preview = item.content.length > 200 ? item.content.slice(0, 200) + '…' : item.content;
    const typeClass = item.type === 'url' ? 'url' : item.type === 'image' ? 'image' : '';
    const typeLabel = item.type === 'url' ? '🔗 URL' : item.type === 'image' ? '🖼️ 图片' : '📝 文本';
    const displayContent = item.type === 'image'
      ? `<img src="${item.content}" style="max-width:100%;max-height:120px;border-radius:8px;margin-top:4px;" />`
      : escapeHtml(preview);

    return `
      <div class="clip-item" data-id="${item.id}">
        <div class="clip-top">
          <span class="clip-time">${formatTime(item.time)}</span>
          <div class="clip-actions">
            <button class="copy-btn" title="复制"><i class="fa-solid fa-copy"></i></button>
            <button class="del" title="删除"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
        <div class="clip-content">${displayContent}</div>
        <span class="clip-type ${typeClass}">${typeLabel}</span>
      </div>
    `;
  }).join('');

  // Bind events
  list.querySelectorAll('.clip-item').forEach(el => {
    const id = el.getAttribute('data-id')!;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.copy-btn')) {
        copyToClipboard(id);
        e.stopPropagation();
      } else if (t.closest('.del')) {
        deleteItem(id);
        e.stopPropagation();
      } else {
        copyToClipboard(id);
      }
    });
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

async function copyToClipboard(id: string) {
  const items = loadItems();
  const item = items.find(i => i.id === id);
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.content);
    showToast('已复制到剪贴板 ✓');
  } catch {
    showToast('复制失败');
  }
}

function deleteItem(id: string) {
  const items = loadItems().filter(i => i.id !== id);
  saveItems(items);
  renderList(items);
  showToast('已删除');
}

// ============ Add New Clip ============
async function pasteCurrent() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      showToast('剪贴板为空');
      return;
    }
    addItem(text);
  } catch (e) {
    showToast('无法读取剪贴板，请授权权限');
  }
}

function addItem(content: string) {
  const items = loadItems();
  // 避免重复
  const existing = items.findIndex(i => i.content === content);
  if (existing !== -1) {
    // 更新已有项时间
    items[existing].time = Date.now();
    items.unshift(items.splice(existing, 1)[0]);
  } else {
    items.unshift({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      content,
      type: detectType(content),
      time: Date.now(),
    });
  }
  // 限制最多 500 条
  if (items.length > 500) items.splice(500);
  saveItems(items);
  renderList(items);
  showToast('已添加 ✓');
}

// ============ Clear All ============
function clearAll() {
  if (!confirm('确定清空所有记录？此操作不可恢复。')) return;
  saveItems([]);
  renderList([]);
  showToast('已清空');
}

// ============ Backup (Download JSON) ============
function backupToFile() {
  const items = loadItems();
  if (items.length === 0) {
    showToast('没有记录可备份');
    return;
  }
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clipbackup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${items.length} 条记录`);
}

// ============ Search ============
function initSearch() {
  const input = document.getElementById('searchInput') as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      currentSearch = input.value;
      renderList(loadItems());
    }, 200);
  });
}

// ============ Init ============
function init() {
  renderList(loadItems());
  updateStats();
  initSearch();

  document.getElementById('pasteBtn')!.addEventListener('click', pasteCurrent);
  document.getElementById('backupBtn')!.addEventListener('click', backupToFile);
  document.getElementById('clearBtn')!.addEventListener('click', clearAll);
  document.getElementById('syncBtn')!.addEventListener('click', () => {
    showToast('已是最新 ✓');
  });

  // Auto-detect clipboard periodically (web fallback)
  let lastContent = '';
  setInterval(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text !== lastContent && text.trim().length > 0) {
        lastContent = text;
        addItem(text);
      }
    } catch { /* ignore */ }
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
