let currentUser    = null;
let selectedUserId = null;
let allUsers       = [];
let currentPage    = 1;
let PAGE_SIZE      = 20;
let sortField      = null;
let sortDir        = 'asc';

// 권한 목록 (id → permission value 매핑)
const ALL_PERMS = [
  { id: 'perm_menu_users', value: 'menu_users' },
  { id: 'perm_menu_admin', value: 'menu_admin' },
  { id: 'perm_reset',      value: 'reset_password' },
  { id: 'perm_unlock',     value: 'unlock' },
  { id: 'perm_disable',    value: 'disable' },
  { id: 'perm_admin',      value: 'admin' },
];

// ── 초기화 ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  bindEnterKey();
});

// ── 사이드바 토글 ─────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (window.innerWidth < 768) {
    sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('show', sidebar.classList.contains('open'));
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

// ── 페이지 전환 ───────────────────────────────────────────────────────────────
function showPage(page) {
  ['users', 'admin'].forEach(p => {
    document.getElementById('page-' + p).style.display  = p === page ? '' : 'none';
    document.getElementById('menu-' + p)?.classList.toggle('active', p === page);
  });
  if (window.innerWidth >= 768) {
    const ca = document.getElementById('contentArea');
    ca.style.overflow = page === 'users' ? 'hidden' : 'auto';
  } else {
    // 모바일: 메뉴 선택 시 사이드바 자동 닫기
    document.getElementById('sidebar').classList.remove('open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.remove('show');
  }
  if (page === 'admin') loadOperators();
}

async function loadMe() {
  try {
    const res  = await fetch('/api/auth/me');
    if (res.status === 401) { location.href = '/login.html'; return; }
    currentUser = await res.json();
    document.getElementById('navUser').textContent = currentUser.displayName;

    const perms = currentUser.permissions;

    // menu_* 권한이 하나도 없으면 하위 호환으로 전체 메뉴 허용
    const hasMenuPerms = perms.some(p => p.startsWith('menu_'));

    // 사이드바의 모든 메뉴 링크를 동적으로 처리
    // id 규칙: "menu-{key}" ↔ 권한 "menu_{key}"
    let firstPage = null;
    document.querySelectorAll('.sidebar-link[id^="menu-"]').forEach(link => {
      const permKey = link.id.replace('menu-', 'menu_');   // menu-users → menu_users
      const visible = !hasMenuPerms || perms.includes(permKey);
      link.style.display = visible ? '' : 'none';
      if (visible && !firstPage) firstPage = link.id.replace('menu-', '');
    });

    // 기본 페이지(users)에 접근 불가면 첫 번째 허용 메뉴로 이동
    const menuUsers = document.getElementById('menu-users');
    if (menuUsers?.style.display === 'none' && firstPage) showPage(firstPage);

    // 기능 권한에 따라 버튼 숨김
    if (!perms.includes('reset_password')) document.getElementById('pwSection').style.display     = 'none';
    if (!perms.includes('unlock'))         document.getElementById('unlockSection').style.display  = 'none';
    if (!perms.includes('disable'))        document.getElementById('disableSection').style.display = 'none';
  } catch {
    location.href = '/login.html';
  }
}

function bindEnterKey() {
  ['srchAccount', 'srchName', 'srchGroup', 'srchStatus'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') searchUsers();
    });
  });
}

// ── 로그아웃 ─────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

// ── 사용자 검색 ──────────────────────────────────────────────────────────────
async function searchUsers() {
  const account   = document.getElementById('srchAccount').value.trim();
  const name      = document.getElementById('srchName').value.trim();
  const groupName = document.getElementById('srchGroup').value.trim();
  const status    = document.getElementById('srchStatus').value;

  const params = new URLSearchParams();
  if (account)   params.set('account',   account);
  if (name)      params.set('name',      name);
  if (groupName) params.set('groupName', groupName);
  if (status)    params.set('status',    status);

  try {
    const res  = await fetch('/api/users/search?' + params.toString());
    const data = await res.json();
    if (!res.ok) { showToast(data.error || '검색 실패', 'danger'); return; }
    renderUsers(data);
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

function sortUsers() {
  if (!sortField) return;
  allUsers.sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
    else { va = va.toString().toLowerCase(); vb = vb.toString().toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

function setSort(field) {
  if (sortField === field) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortField = field;
    sortDir   = 'asc';
  }
  sortUsers();
  currentPage = 1;
  renderPage();
}

function renderSortIcon(field) {
  if (sortField !== field) return '<i class="bi bi-chevron-expand text-muted ms-1" style="font-size:.7rem"></i>';
  return sortDir === 'asc'
    ? '<i class="bi bi-chevron-up ms-1" style="font-size:.7rem"></i>'
    : '<i class="bi bi-chevron-down ms-1" style="font-size:.7rem"></i>';
}

function renderUsers(users) {
  allUsers    = users;
  sortField   = null;
  currentPage = 1;
  renderPage();
}

function renderPage() {
  // 헤더 정렬 아이콘 갱신
  document.querySelector('#userTableBody').closest('table').querySelector('thead tr').innerHTML = `
    <th class="sort-col" onclick="setSort('userPrincipalName')">계정 (ID)${renderSortIcon('userPrincipalName')}</th>
    <th class="sort-col" style="width:120px" onclick="setSort('displayName')">이름${renderSortIcon('displayName')}</th>
    <th class="sort-col d-none d-md-table-cell" style="width:150px" onclick="setSort('department')">부서${renderSortIcon('department')}</th>
    <th class="sort-col d-none d-md-table-cell" style="width:120px" onclick="setSort('jobTitle')">직위${renderSortIcon('jobTitle')}</th>
    <th class="sort-col d-none d-md-table-cell" style="width:100px" onclick="setSort('title')">직급${renderSortIcon('title')}</th>
    <th class="sort-col text-center" style="width:80px" onclick="setSort('accountEnabled')">상태${renderSortIcon('accountEnabled')}</th>`;

  const tbody      = document.getElementById('userTableBody');
  const total      = allUsers.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const start      = (currentPage - 1) * PAGE_SIZE;
  const pageData   = allUsers.slice(start, start + PAGE_SIZE);

  document.getElementById('resultCount').textContent = total + '건';
  tbody.innerHTML = '';

  if (!pageData.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">검색 결과가 없습니다.</td></tr>';
    renderPagination(1, 1, 0);
    return;
  }

  pageData.forEach(u => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td class="small">${esc(u.userPrincipalName)}</td>
      <td class="small fw-semibold">${esc(u.displayName)}</td>
      <td class="small d-none d-md-table-cell">${esc(u.department)}</td>
      <td class="small d-none d-md-table-cell">${esc(u.jobTitle)}</td>
      <td class="small d-none d-md-table-cell">${esc(u.title)}</td>
      <td class="text-center">
        ${u.accountEnabled
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle">활성</span>'
          : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">비활성</span>'}
      </td>`;
    tr.addEventListener('dblclick', () => openUserDetail(u));
    tbody.appendChild(tr);
  });

  renderPagination(currentPage, totalPages, total);
}

function renderPagination(current, totalPages, total) {
  const area  = document.getElementById('paginationArea');
  const start = (current - 1) * PAGE_SIZE + 1;
  const end   = Math.min(current * PAGE_SIZE, total);

  const sizeOptions = [10, 20, 50, 100].map(n =>
    `<option value="${n}" ${n === PAGE_SIZE ? 'selected' : ''}>${n}건</option>`
  ).join('');

  // 페이지 버튼은 2페이지 이상일 때만 표시
  let pageNav = '';
  if (totalPages > 1) {
    let pageStart = Math.max(1, current - 2);
    let pageEnd   = Math.min(totalPages, pageStart + 4);
    if (pageEnd - pageStart < 4) pageStart = Math.max(1, pageEnd - 4);

    let pages = '';
    for (let i = pageStart; i <= pageEnd; i++) {
      pages += `<li class="page-item ${i === current ? 'active' : ''}">
        <a class="page-link" onclick="goPage(${i})">${i}</a></li>`;
    }
    pageNav = `
      <nav><ul class="pagination pagination-sm mb-0">
        <li class="page-item ${current===1?'disabled':''}"><a class="page-link" onclick="goPage(1)">«</a></li>
        <li class="page-item ${current===1?'disabled':''}"><a class="page-link" onclick="goPage(${current-1})">‹</a></li>
        ${pages}
        <li class="page-item ${current===totalPages?'disabled':''}"><a class="page-link" onclick="goPage(${current+1})">›</a></li>
        <li class="page-item ${current===totalPages?'disabled':''}"><a class="page-link" onclick="goPage(${totalPages})">»</a></li>
      </ul></nav>`;
  }

  area.innerHTML = `
    <div class="d-flex justify-content-between align-items-center px-1">
      <div class="d-flex align-items-center gap-2">
        <span class="small text-muted">${start}–${end} / 전체 ${total}건</span>
        <select class="form-select form-select-sm" style="width:80px" onchange="changePageSize(this.value)">
          ${sizeOptions}
        </select>
      </div>
      ${pageNav}
    </div>`;
}

function goPage(page) {
  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPage();
}

function changePageSize(size) {
  PAGE_SIZE    = parseInt(size, 10);
  currentPage  = 1;
  renderPage();
}

// ── 사용자 상세 모달 ──────────────────────────────────────────────────────────
function openUserDetail(u) {
  selectedUserId = u.id;

  document.getElementById('d_upn').textContent      = u.userPrincipalName || '-';
  document.getElementById('d_name').textContent     = u.displayName       || '-';
  document.getElementById('d_dept').textContent     = u.department        || '-';
  document.getElementById('d_jobtitle').textContent = u.jobTitle          || '-';
  document.getElementById('d_title').textContent    = u.title             || '-';
  document.getElementById('d_status').innerHTML     = u.accountEnabled
    ? '<span class="badge bg-success">활성</span>'
    : '<span class="badge bg-danger">비활성</span>';

  // 비밀번호 타입 초기화
  document.getElementById('pwDefault').checked = true;
  document.getElementById('customPwInput').classList.add('d-none');
  document.getElementById('customPwInput').value = '';

  // 계정 상태에 따라 활성화/비활성화 버튼 전환
  const disableBtn = document.querySelector('#disableSection button');
  if (u.accountEnabled) {
    disableBtn.className = 'btn btn-sm btn-danger w-100';
    disableBtn.innerHTML = '<i class="bi bi-person-x me-1"></i>계정 사용 안함';
    disableBtn.onclick   = doDisable;
  } else {
    disableBtn.className = 'btn btn-sm btn-success w-100';
    disableBtn.innerHTML = '<i class="bi bi-person-check me-1"></i>계정 활성화';
    disableBtn.onclick   = doEnable;
  }

  new bootstrap.Modal(document.getElementById('userDetailModal')).show();
}

function togglePwInput() {
  const isCustom = document.getElementById('pwCustom').checked;
  document.getElementById('customPwInput').classList.toggle('d-none', !isCustom);
}

// ── 비밀번호 초기화 ───────────────────────────────────────────────────────────
async function doResetPassword() {
  const useDefault = document.getElementById('pwDefault').checked;
  const customPw   = document.getElementById('customPwInput').value.trim();

  if (!useDefault && !customPw) {
    showToast('비밀번호를 입력하세요.', 'warning');
    return;
  }

  if (!confirm('비밀번호를 초기화하시겠습니까?')) return;

  try {
    const res  = await fetch(`/api/users/${selectedUserId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useDefault, password: customPw })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }

    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
    document.getElementById('resultPw').textContent = data.temporaryPassword;
    new bootstrap.Modal(document.getElementById('pwResultModal')).show();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

// ── 잠금 해제 ─────────────────────────────────────────────────────────────────
async function doUnlock() {
  if (!confirm('계정 잠금을 해제하시겠습니까?')) return;
  try {
    const res  = await fetch(`/api/users/${selectedUserId}/unlock`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }
    showToast(data.message, 'success');
    updateUserInGrid(selectedUserId, { accountEnabled: true });
    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

// ── 계정 사용 안함 ────────────────────────────────────────────────────────────
async function doDisable() {
  if (!confirm('해당 계정을 비활성화하시겠습니까?')) return;
  try {
    const res  = await fetch(`/api/users/${selectedUserId}/disable`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }
    showToast(data.message, 'success');
    updateUserInGrid(selectedUserId, { accountEnabled: false });
    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

// ── 계정 활성화 ───────────────────────────────────────────────────────────────
async function doEnable() {
  if (!confirm('해당 계정을 활성화하시겠습니까?')) return;
  try {
    const res  = await fetch(`/api/users/${selectedUserId}/unlock`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }
    showToast(data.message, 'success');
    updateUserInGrid(selectedUserId, { accountEnabled: true });
    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

// ── 그리드 즉시 반영 ──────────────────────────────────────────────────────────
function updateUserInGrid(userId, changes) {
  const idx = allUsers.findIndex(u => u.id === userId);
  if (idx < 0) return;
  Object.assign(allUsers[idx], changes);
  renderPage();
}

// ── 비밀번호 복사 ─────────────────────────────────────────────────────────────
function copyPw() {
  navigator.clipboard.writeText(document.getElementById('resultPw').textContent)
    .then(() => showToast('복사되었습니다.', 'success'));
}

// ── 관리자 목록 ───────────────────────────────────────────────────────────────
async function loadOperators() {
  const res  = await fetch('/api/admin/operators');
  if (!res.ok) return;
  const ops  = await res.json();
  const tbody = document.getElementById('operatorTableBody');
  tbody.innerHTML = '';

  const permLabels = {
    menu_users:     '메뉴:사용자관리',
    menu_admin:     '메뉴:관리자설정',
    reset_password: '비밀번호초기화',
    unlock:         '잠금해제',
    disable:        '계정비활성화',
    admin:          '관리자설정접근'
  };

  ops.forEach(o => {
    const permBadges = o.permissions.map(p =>
      `<span class="badge bg-light text-dark border me-1">${permLabels[p] || p}</span>`
    ).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="small">${esc(o.username)}</td>
      <td class="small fw-semibold">${esc(o.displayName)}</td>
      <td class="small">${permBadges}</td>
      <td class="text-center">
        <button class="btn btn-xs btn-outline-primary btn-sm me-1" onclick='openOperatorModal(${JSON.stringify(o)})'>수정</button>
        <button class="btn btn-xs btn-outline-danger btn-sm" onclick="deleteOperator('${o.id}', '${esc(o.displayName)}')">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openOperatorModal(op) {
  const isEdit = !!op;
  document.getElementById('opModalTitle').textContent = isEdit ? '관리자 수정' : '관리자 추가';
  document.getElementById('opId').value          = op?.id          || '';
  document.getElementById('opUsername').value    = op?.username    || '';
  document.getElementById('opDisplayName').value = op?.displayName || '';
  document.getElementById('opPassword').value    = '';
  document.getElementById('opUsername').disabled = isEdit;
  document.getElementById('pwHint').style.display = isEdit ? '' : 'none';

  ALL_PERMS.forEach(p => {
    const el = document.getElementById(p.id);
    if (el) el.checked = op?.permissions?.includes(p.value) || false;
  });

  new bootstrap.Modal(document.getElementById('operatorModal')).show();
}

async function saveOperator() {
  const id          = document.getElementById('opId').value;
  const username    = document.getElementById('opUsername').value.trim();
  const displayName = document.getElementById('opDisplayName').value.trim();
  const password    = document.getElementById('opPassword').value;
  const permissions = ALL_PERMS
    .filter(p => document.getElementById(p.id)?.checked)
    .map(p => p.value);

  if (!username || !displayName) {
    showToast('계정과 표시명은 필수입니다.', 'warning');
    return;
  }

  const isEdit = !!id;
  const url    = isEdit ? `/api/admin/operators/${id}` : '/api/admin/operators';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, username, displayName, password, permissions })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }
    showToast(data.message, 'success');
    bootstrap.Modal.getInstance(document.getElementById('operatorModal')).hide();
    loadOperators();
    if (data.sessionUpdated) await loadMe();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

async function deleteOperator(id, name) {
  if (!confirm(`[${name}] 관리자를 삭제하시겠습니까?`)) return;
  try {
    const res  = await fetch(`/api/admin/operators/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'danger'); return; }
    showToast(data.message, 'success');
    loadOperators();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.className = `toast text-white border-0 bg-${type}`;
  document.getElementById('toastMsg').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(t, { delay: 3000 }).show();
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
