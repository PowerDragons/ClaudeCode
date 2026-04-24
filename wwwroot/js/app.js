let currentUser   = null;  // 로그인한 관리자
let selectedUserId = null; // 현재 상세 보기 중인 Azure AD 사용자

// ── 초기화 ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  await loadGroups();
  bindEnterKey();
});

async function loadMe() {
  try {
    const res  = await fetch('/api/auth/me');
    if (res.status === 401) { location.href = '/login.html'; return; }
    currentUser = await res.json();
    document.getElementById('navUser').textContent = currentUser.displayName;

    // 관리자 탭 표시 여부
    if (currentUser.permissions.includes('admin')) {
      document.getElementById('adminTabItem').style.display = '';
      loadOperators();
    }

    // 권한에 따라 버튼 숨김
    const perms = currentUser.permissions;
    if (!perms.includes('reset_password')) document.getElementById('pwSection').style.display     = 'none';
    if (!perms.includes('unlock'))         document.getElementById('unlockSection').style.display  = 'none';
    if (!perms.includes('disable'))        document.getElementById('disableSection').style.display = 'none';
  } catch {
    location.href = '/login.html';
  }
}

async function loadGroups() {
  try {
    const res    = await fetch('/api/groups');
    if (!res.ok) return;
    const groups = await res.json();
    const sel    = document.getElementById('srchGroup');
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value       = g.id;
      opt.textContent = g.displayName;
      sel.appendChild(opt);
    });
  } catch {}
}

function bindEnterKey() {
  ['srchAccount', 'srchName'].forEach(id => {
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
  const account = document.getElementById('srchAccount').value.trim();
  const name    = document.getElementById('srchName').value.trim();
  const groupId = document.getElementById('srchGroup').value;

  if (!account && !name && !groupId) {
    showToast('검색 조건을 하나 이상 입력하세요.', 'warning');
    return;
  }

  const params = new URLSearchParams();
  if (account) params.set('account', account);
  if (name)    params.set('name',    name);
  if (groupId) params.set('groupId', groupId);

  try {
    const res  = await fetch('/api/users/search?' + params.toString());
    const data = await res.json();
    if (!res.ok) { showToast(data.error || '검색 실패', 'danger'); return; }
    renderUsers(data);
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('userTableBody');
  document.getElementById('resultCount').textContent = users.length + '건';
  tbody.innerHTML = '';

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">검색 결과가 없습니다.</td></tr>';
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td class="small">${esc(u.userPrincipalName)}</td>
      <td class="small fw-semibold">${esc(u.displayName)}</td>
      <td class="small">${esc(u.department)}</td>
      <td class="small">${esc(u.jobTitle)}</td>
      <td class="small">${esc(u.title)}</td>
      <td class="text-center">
        ${u.accountEnabled
          ? '<span class="badge bg-success-subtle text-success border border-success-subtle">활성</span>'
          : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">비활성</span>'}
      </td>`;
    tr.addEventListener('dblclick', () => openUserDetail(u));
    tbody.appendChild(tr);
  });
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
    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
    searchUsers();
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
    bootstrap.Modal.getInstance(document.getElementById('userDetailModal')).hide();
    searchUsers();
  } catch {
    showToast('서버 연결 오류', 'danger');
  }
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
    reset_password: '비밀번호초기화',
    unlock: '잠금해제',
    disable: '계정비활성화',
    admin: '관리자설정'
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

  ['reset_password', 'unlock', 'disable', 'admin'].forEach(p => {
    const el = document.getElementById('perm_' + p.replace('_password', '').replace('_', ''));
    if (el) el.checked = op?.permissions?.includes(p) || false;
  });

  new bootstrap.Modal(document.getElementById('operatorModal')).show();
}

async function saveOperator() {
  const id          = document.getElementById('opId').value;
  const username    = document.getElementById('opUsername').value.trim();
  const displayName = document.getElementById('opDisplayName').value.trim();
  const password    = document.getElementById('opPassword').value;
  const permissions = ['reset_password', 'unlock', 'disable', 'admin']
    .filter(p => {
      const el = document.getElementById('perm_' + p.replace('_password', '').replace('_', ''));
      return el?.checked;
    });

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
