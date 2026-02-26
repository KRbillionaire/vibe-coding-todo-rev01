// ===== 날짜 문자열 유연 파싱 =====
// 지원 형식: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, YY-MM-DD 등
function parseDateInput(str) {
  if (!str) return null;
  let s = str.trim().replace(/\//g, "-").replace(/\./g, "-");
  if (/^\d{8}$/.test(s)) {
    s = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  if (/^\d{2}-\d{2}-\d{2}$/.test(s)) {
    s = `20${s}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ===== 기본 설정 =====
const DAY_MS = 24 * 60 * 60 * 1000;
const COL_WIDTH = 32; // 날짜 1칸 픽셀 (일별: 1일=32px, 주별: 1주=32px)
let viewMode = "day"; // 'day' | 'week'
let chartStart = null; // 차트 시작일 (데이터 기반 자동 계산)
let chartTotalDays = 60; // 차트 전체 일수 (데이터 기반 자동 계산)

const tableBodyEl = document.getElementById("table-body");
const tableScrollWrapperEl = document.querySelector(".table-scroll-wrapper");
const tableScrollbarEl = document.getElementById("table-scrollbar");
const tableScrollbarThumbEl = document.getElementById("table-scrollbar-thumb");
const ganttBodyEl = document.getElementById("gantt-body");
const ganttNamesEl = document.getElementById("gantt-names");
const dateHeaderEl = document.getElementById("date-header");
const todayLineEl = document.getElementById("today-line");
const ganttScrollWrapperEl = document.querySelector(".gantt-scroll-wrapper");
const ganttScrollbarEl = document.getElementById("gantt-scrollbar");
const ganttScrollbarThumbEl = document.getElementById("gantt-scrollbar-thumb");
const deptFilterEl = document.getElementById("dept-filter");
const ownerFilterEl = document.getElementById("owner-filter");
const viewDayBtn = document.getElementById("view-day");
const viewWeekBtn = document.getElementById("view-week");
const projectStartInput = document.getElementById("project-start");
const tablePanelEl = document.getElementById("table-panel");

// ===== 예시 데이터 (계층 구조) =====
let rows = [
  {
    id: 1,
    type: "G",
    groupId: "G1",
    name: "1. 메인 업무 - 승인도 제작",
    start: "2025-02-26",
    workDays: 5,
    progress: 40,
    dept: "전사",
    owner: "홍길동",
    parentId: null,
    level: 0,
    collapsed: false,
  },
  {
    id: 2,
    type: "T",
    groupId: "G1",
    name: "도면 검토",
    start: "2025-02-26",
    workDays: 2,
    progress: 100,
    dept: "전사",
    owner: "홍길동",
    parentId: 1,
    level: 1,
    collapsed: false,
  },
  {
    id: 3,
    type: "T",
    groupId: "G1",
    name: "승인도 작성",
    start: "2025-02-27",
    workDays: 3,
    progress: 30,
    dept: "설계팀",
    owner: "이몽룡",
    parentId: 1,
    level: 1,
    collapsed: false,
  },
  {
    id: 4,
    type: "G",
    groupId: "G2",
    name: "2. 메인 업무 - 시공 준비",
    start: "2025-03-02",
    workDays: 7,
    progress: 0,
    dept: "전사",
    owner: "성춘향",
    parentId: null,
    level: 0,
    collapsed: true,
  },
  {
    id: 5,
    type: "T",
    groupId: "G2",
    name: "자재 발주",
    start: "2025-03-02",
    workDays: 4,
    progress: 0,
    dept: "구매팀",
    owner: "성춘향",
    parentId: 4,
    level: 1,
    collapsed: false,
  },
  {
    id: 6,
    type: "T",
    groupId: "G2",
    name: "현장 점검",
    start: "2025-03-06",
    workDays: 3,
    progress: 0,
    dept: "현장팀",
    owner: "강감찬",
    parentId: 4,
    level: 1,
    collapsed: false,
  },
];

let nextId = 7;

// ===== 유틸 함수 =====
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}


function formatDate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(a, b) {
  if (!a || !b) return 0;
  return Math.round((b - a) / DAY_MS);
}

function getKoreanDow(date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

// ===== 차트 날짜 범위 자동 계산 (데이터 기반, 제한 없음) =====
function calcChartRange() {
  const allDates = [];
  rows.forEach((r) => {
    const s = parseDate(r.start);
    if (s) {
      allDates.push(s);
      if (r.workDays > 0) allDates.push(addDays(s, r.workDays - 1));
    }
    if (r.actualEndDate) {
      const ae = parseDate(r.actualEndDate);
      if (ae) allDates.push(ae);
    }
  });
  allDates.push(new Date()); // 항상 오늘 포함

  const valid = allDates.filter(Boolean);
  if (!valid.length) {
    chartStart = addDays(new Date(), -14);
    chartTotalDays = 60;
    return;
  }

  const minDate = new Date(Math.min(...valid.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...valid.map((d) => d.getTime())));

  chartStart = addDays(minDate, -14); // 14일 앞 여유
  const chartEnd = addDays(maxDate, 30); // 30일 뒤 여유
  chartTotalDays = diffDays(chartStart, chartEnd) + 1;
}

// ===== 상위/하위 날짜 범위 제한 =====
// 특정 행의 상위업무 날짜 범위를 반환
function getParentDateRange(rowId) {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.parentId) return null;
  const parent = rows.find((r) => r.id === row.parentId);
  if (!parent || !parent.start) return null;
  const pStart = parseDate(parent.start);
  if (!pStart) return null;
  const pEnd = parent.workDays > 0 ? addDays(pStart, parent.workDays - 1) : null;
  return { start: pStart, end: pEnd };
}

// 하위 행들의 날짜를 상위업무 범위로 제한 (재귀)
function constrainChildrenToParent(parentRowId) {
  const parent = rows.find((r) => r.id === parentRowId);
  if (!parent || !parent.start || parent.workDays <= 0) return;
  const pStart = parseDate(parent.start);
  if (!pStart) return;
  const pEnd = addDays(pStart, parent.workDays - 1);

  rows.forEach((child, idx) => {
    if (child.parentId !== parentRowId || !child.start) return;
    let cStart = parseDate(child.start);
    if (!cStart) return;

    // 시작일 제한
    if (cStart < pStart) {
      rows[idx].start = formatDate(pStart);
      cStart = pStart;
    } else if (cStart > pEnd) {
      rows[idx].start = formatDate(pEnd);
      cStart = pEnd;
    }

    // 종료일 제한 (workDays 조정)
    if (rows[idx].workDays > 0) {
      const cEnd = addDays(cStart, rows[idx].workDays - 1);
      if (cEnd > pEnd) {
        rows[idx].workDays = Math.max(1, diffDays(cStart, pEnd) + 1);
      }
    }

    // 재귀: 이 하위업무의 하위업무들도 조정
    constrainChildrenToParent(child.id);
  });
}

// ===== 그룹 계산 & 파생 값 계산 =====
function computeDerivedData(data) {
  const byGroup = new Map();

  data.forEach((row) => {
    if (row.type === "T" && row.groupId) {
      if (!byGroup.has(row.groupId)) byGroup.set(row.groupId, []);
      byGroup.get(row.groupId).push(row);
    }
  });

  const today = new Date();

  return data.map((row) => {
    let startDate = parseDate(row.start);
    let workDays = Number(row.workDays) || 0;
    let progress = Number(row.progress) || 0;
    let endDate = startDate && workDays > 0 ? addDays(startDate, workDays - 1) : null;

    // 그룹(G)인 경우: 하위 T들의 시작/종료/진행률로 재계산
    if (row.type === "G" && row.groupId && byGroup.has(row.groupId)) {
      const tasks = byGroup.get(row.groupId);
      const starts = tasks.map((t) => parseDate(t.start)).filter(Boolean);
      const ends = tasks
        .map((t) => {
          const s = parseDate(t.start);
          const d = Number(t.workDays) || 0;
          return s && d > 0 ? addDays(s, d - 1) : null;
        })
        .filter(Boolean);
      if (starts.length && ends.length) {
        const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
        const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
        const days = diffDays(minStart, maxEnd) + 1;
        row.start = formatDate(minStart);
        workDays = days;
        endDate = maxEnd;
        startDate = minStart; // ← mutation 후 startDate를 최신값으로 갱신
      }
      const progresses = tasks.map((t) => Number(t.progress) || 0);
      if (progresses.length) {
        progress = progresses.reduce((a, b) => a + b, 0) / progresses.length;
      }
    }

    const expectedEnd = endDate;
    const actualDays = workDays > 0 ? Math.round((workDays * progress) / 100) : 0;
    const progressDate =
      startDate && actualDays > 0 ? addDays(startDate, actualDays - 1) : null;

    const actualDaysByToday =
      startDate && today >= startDate
        ? Math.min(diffDays(startDate, today) + 1, workDays)
        : 0;

    return {
      ...row,
      startDate,
      workDays,
      progress,
      endDate,
      expectedEnd,
      actualDays,
      progressDate,
      actualDaysByToday,
      actualEndDate: row.actualEndDate ? parseDate(row.actualEndDate) : null,
    };
  });
}

// ===== 필터링 =====
function applyFilters(data) {
  const dept = deptFilterEl.value;
  const owner = ownerFilterEl.value;

  return data.filter((row) => {
    if (dept && row.dept !== dept) return false;
    if (owner && row.owner !== owner) return false;
    return true;
  });
}

// ===== 접기/펼치기 상태에 따라 보여줄 행 필터링 =====
function getVisibleRows(derivedRows) {
  const visible = [];
  const collapsedSet = new Set();
  
  derivedRows.forEach((row) => {
    // 부모가 접혀있으면 숨김
    if (row.parentId && collapsedSet.has(row.parentId)) {
      collapsedSet.add(row.id); // 자식도 접힌 것으로 표시
      return;
    }
    
    visible.push(row);
    
    // 접혀있으면 자식들도 숨김
    if (row.collapsed) {
      collapsedSet.add(row.id);
    }
  });
  
  return visible;
}

// ===== 테이블 렌더 =====
// 현재 포커스된 입력 필드 정보를 저장/복원하기 위한 변수
let _focusInfo = null;

function saveFocusInfo() {
  const el = document.activeElement;
  if (!el || el.tagName !== "INPUT") return;
  const tableRow = el.closest(".table-row");
  if (!tableRow) return;
  const rowId = tableRow.dataset.id;
  const colIdx = Array.from(tableRow.children).indexOf(el.parentElement);
  _focusInfo = {
    rowId,
    colIdx,
    selStart: el.selectionStart,
    selEnd: el.selectionEnd,
    value: el.value,
  };
}

function restoreFocusInfo() {
  if (!_focusInfo) return;
  const { rowId, colIdx, selStart, selEnd } = _focusInfo;
  const tableRow = tableBodyEl.querySelector(`.table-row[data-id="${rowId}"]`);
  if (!tableRow) { _focusInfo = null; return; }
  const col = tableRow.children[colIdx];
  if (!col) { _focusInfo = null; return; }
  const input = col.querySelector("input");
  if (!input) { _focusInfo = null; return; }
  input.focus();
  if (input.type === "text" && selStart != null) {
    try { input.setSelectionRange(selStart, selEnd); } catch(_) {}
  }
  _focusInfo = null;
}

function renderTable(derivedRows) {
  // 렌더 전에 포커스 정보 저장
  saveFocusInfo();
  
  tableBodyEl.innerHTML = "";
  
  const visibleRows = getVisibleRows(derivedRows);

  visibleRows.forEach((row) => {
    const tr = document.createElement("div");
    tr.className = "table-row";
    tr.dataset.id = row.id;
    tr.dataset.level = row.level || 0;

    // --- 업무명 컬럼 ---
    const colName = document.createElement("div");
    colName.className = "col-name";
    
    const controls = document.createElement("div");
    controls.className = "row-controls";
    
    // 들여쓰기
    const indent = document.createElement("div");
    indent.className = "row-indent";
    indent.style.width = `${(row.level || 0) * 16}px`;
    controls.appendChild(indent);
    
    // 접기/펼치기 버튼 (최상위 업무행인 경우만)
    const isTopLevel = (row.level || 0) === 0;
    if (isTopLevel) {
      const hasChildren = rows.some((r) => r.parentId === row.id);
      if (hasChildren) {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = `toggle-btn-icon ${row.collapsed ? "collapsed" : "expanded"}`;
        toggleBtn.title = row.collapsed ? "펼치기" : "접기";
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = rows.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            rows[idx].collapsed = !rows[idx].collapsed;
            renderAll(false);
          }
        });
        controls.appendChild(toggleBtn);
      } else {
        const spacer = document.createElement("div");
        spacer.style.width = "16px";
        controls.appendChild(spacer);
      }
    } else {
      const spacer = document.createElement("div");
      spacer.style.width = "16px";
      controls.appendChild(spacer);
    }
    
    colName.appendChild(controls);
    
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = row.name || "";
    nameInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx].name = nameInput.value;
      // 업무명은 간트 업무명 영역도 동기화 필요
      const ganttNameRow = ganttNamesEl.querySelector(`.gantt-names-row[data-id="${row.id}"] .gantt-name-input`);
      if (ganttNameRow) ganttNameRow.value = nameInput.value;
    });
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("mousedown", (e) => e.stopPropagation());
    nameInput.addEventListener("keydown", (e) => e.stopPropagation());
    colName.appendChild(nameInput);

    // G타입 행 중 T타입 자식이 있는 경우 → 시작일/종료일 자동계산(읽기전용)
    const isAutoGroup = row.type === "G" &&
      rows.some((r) => r.type === "T" && r.groupId === row.groupId);

    // --- 시작일 컬럼 ---
    const colStart = document.createElement("div");
    colStart.className = "col-start";
    const startInput = document.createElement("input");
    startInput.type = "text";
    startInput.addEventListener("click", (e) => e.stopPropagation());
    startInput.addEventListener("mousedown", (e) => e.stopPropagation());

    if (isAutoGroup) {
      // 자동계산: 하위 T행들의 최소 시작일
      startInput.value = row.startDate ? formatDate(row.startDate) : "";
      startInput.readOnly = true;
      startInput.classList.add("auto-date");
      startInput.title = "하위 업무의 최소 시작일로 자동설정됩니다";
    } else {
      startInput.placeholder = "YYYY-MM-DD";
      const originalRow = rows.find((r) => r.id === row.id);
      startInput.value = originalRow && originalRow.start ? originalRow.start : "";
      function applyStartDate() {
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx < 0) return;
        const val = startInput.value.trim();
        if (val) {
          const newStart = parseDateInput(val);
          if (!newStart) { startInput.classList.add("date-invalid"); return; }
          startInput.classList.remove("date-invalid");
          rows[idx].start = formatDate(newStart);
          startInput.value = rows[idx].start;
          if (!rows[idx].workDays || rows[idx].workDays <= 0) rows[idx].workDays = 1;
        } else {
          rows[idx].start = "";
          startInput.classList.remove("date-invalid");
        }
        renderAll();
      }
      startInput.addEventListener("blur", applyStartDate);
      startInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { applyStartDate(); startInput.blur(); }
      });
      startInput.addEventListener("input", (e) => {
        e.stopPropagation();
        startInput.classList.remove("date-invalid");
      });
    }
    colStart.appendChild(startInput);

    // --- 종료일 컬럼 ---
    const colEnd = document.createElement("div");
    colEnd.className = "col-end";
    const endInput = document.createElement("input");
    endInput.type = "text";
    endInput.addEventListener("click", (e) => e.stopPropagation());
    endInput.addEventListener("mousedown", (e) => e.stopPropagation());

    if (isAutoGroup) {
      // 자동계산: 하위 T행들의 최대 종료일
      endInput.value = row.endDate ? formatDate(row.endDate) : "";
      endInput.readOnly = true;
      endInput.classList.add("auto-date");
      endInput.title = "하위 업무의 최대 종료일로 자동설정됩니다";
    } else {
      endInput.placeholder = "YYYY-MM-DD";
      endInput.value = row.endDate ? formatDate(row.endDate) : "";
      function applyEndDate() {
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx < 0) return;
        const val = endInput.value.trim();
        if (val) {
          const newEndDate = parseDateInput(val);
          if (!newEndDate) { endInput.classList.add("date-invalid"); return; }
          endInput.classList.remove("date-invalid");
          const startDate = parseDate(rows[idx].start);
          if (startDate) {
            rows[idx].workDays = Math.max(1, diffDays(startDate, newEndDate) + 1);
          } else {
            rows[idx].start = formatDate(newEndDate);
            rows[idx].workDays = 1;
          }
          endInput.value = formatDate(newEndDate);
        } else {
          endInput.classList.remove("date-invalid");
        }
        renderAll();
      }
      endInput.addEventListener("blur", applyEndDate);
      endInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { applyEndDate(); endInput.blur(); }
      });
      endInput.addEventListener("input", (e) => {
        e.stopPropagation();
        endInput.classList.remove("date-invalid");
      });
    }
    colEnd.appendChild(endInput);

    // --- 실제종료일 컬럼 ---
    const colActualEnd = document.createElement("div");
    colActualEnd.className = "col-actual-end";
    const actualEndInput = document.createElement("input");
    actualEndInput.type = "text";
    actualEndInput.placeholder = "YYYY-MM-DD";
    actualEndInput.value = row.actualEndDate ? row.actualEndDate : "";
    function applyActualEndDate() {
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx < 0) return;
      const val = actualEndInput.value.trim();
      if (val) {
        const parsed = parseDateInput(val);
        if (!parsed) { actualEndInput.classList.add("date-invalid"); return; }
        actualEndInput.classList.remove("date-invalid");
        rows[idx].actualEndDate = formatDate(parsed);
        actualEndInput.value = rows[idx].actualEndDate;
      } else {
        rows[idx].actualEndDate = "";
        actualEndInput.classList.remove("date-invalid");
      }
      renderAll(false);
    }
    actualEndInput.addEventListener("blur", applyActualEndDate);
    actualEndInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { applyActualEndDate(); actualEndInput.blur(); }
    });
    actualEndInput.addEventListener("input", (e) => {
      e.stopPropagation();
      actualEndInput.classList.remove("date-invalid");
    });
    actualEndInput.addEventListener("click", (e) => e.stopPropagation());
    actualEndInput.addEventListener("mousedown", (e) => e.stopPropagation());
    colActualEnd.appendChild(actualEndInput);

    // --- 부서 컬럼 ---
    const colDept = document.createElement("div");
    colDept.className = "col-dept";
    const deptInput = document.createElement("input");
    deptInput.type = "text";
    deptInput.value = row.dept || "";
    // input 이벤트: 데이터만 업데이트, DOM 재생성하지 않음
    deptInput.addEventListener("input", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) {
        rows[idx].dept = deptInput.value;
      }
    });
    // blur 이벤트: 포커스가 빠져나갈 때만 필터 업데이트
    deptInput.addEventListener("blur", () => {
      populateFilterOptions();
    });
    deptInput.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    deptInput.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    deptInput.addEventListener("focus", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    deptInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    deptInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    colDept.appendChild(deptInput);

    // --- 담당자 컬럼 ---
    const colOwner = document.createElement("div");
    colOwner.className = "col-owner";
    const ownerInput = document.createElement("input");
    ownerInput.type = "text";
    ownerInput.value = row.owner || "";
    // input 이벤트: 데이터만 업데이트, DOM 재생성하지 않음
    ownerInput.addEventListener("input", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) {
        rows[idx].owner = ownerInput.value;
      }
    });
    // blur 이벤트: 포커스가 빠져나갈 때만 필터 업데이트
    ownerInput.addEventListener("blur", () => {
      populateFilterOptions();
    });
    ownerInput.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    ownerInput.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    ownerInput.addEventListener("focus", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    ownerInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    ownerInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    colOwner.appendChild(ownerInput);

    tr.append(
      colName,
      colStart,
      colEnd,
      colActualEnd,
      colDept,
      colOwner
    );
    tableBodyEl.appendChild(tr);
  });
  
  // 렌더 후 포커스 복원
  requestAnimationFrame(() => restoreFocusInfo());
}

// ===== 행 삭제 함수 =====
function deleteRow(rowId) {
  // 자식이 있는 경우 확인
  const hasChildren = rows.some((r) => r.parentId === rowId);
  if (hasChildren) {
    if (!confirm("하위 행이 있습니다. 정말 삭제하시겠습니까?")) {
      return;
    }
  }
  
  // 해당 행과 모든 자식 행 삭제
  const toDelete = new Set([rowId]);
  let found = true;
  while (found) {
    found = false;
    rows.forEach((r) => {
      if (toDelete.has(r.parentId)) {
        toDelete.add(r.id);
        found = true;
      }
    });
  }
  
  rows = rows.filter((r) => !toDelete.has(r.id));
  // 행 삭제 시 필터 옵션 업데이트
  populateFilterOptions();
  renderAll();
}

// ===== 서브트리 끝 인덱스 계산 (하위 행 포함) =====
function getSubtreeEnd(targetIdx) {
  if (targetIdx < 0 || targetIdx >= rows.length) return targetIdx;
  const targetLevel = rows[targetIdx].level || 0;
  let i = targetIdx + 1;
  while (i < rows.length && (rows[i].level || 0) > targetLevel) {
    i++;
  }
  return i - 1;
}

// ===== 행 추가 함수 (무제한 깊이 지원) =====
function addRow(targetRowId, targetLevel, asChild = false) {
  const targetRow = rows.find((r) => r.id === targetRowId);
  if (!targetRow) {
    // 최상위 레벨에 행 추가
    rows.push({
      id: nextId++, type: "T", groupId: null,
      name: "", start: "", workDays: 0, progress: 0,
      dept: "", owner: "", parentId: null, level: 0, collapsed: false,
    });
    populateFilterOptions();
    renderAll();
    return;
  }

  const newRow = {
    id: nextId++,
    type: "T",
    groupId: targetRow.groupId,
    name: "",
    start: "",
    workDays: 0,
    progress: 0,
    dept: "",
    owner: "",
    parentId: asChild ? targetRowId : targetRow.parentId,
    level: asChild ? (targetLevel + 1) : targetLevel,
    collapsed: false,
  };

  const targetIdx = rows.findIndex((r) => r.id === targetRowId);
  // 서브트리 끝 다음에 삽입 (하위 행 전체를 건너뜀)
  const insertAfter = getSubtreeEnd(targetIdx);
  rows.splice(insertAfter + 1, 0, newRow);

  populateFilterOptions();
  renderAll();
}

// ===== 필터 드롭다운 옵션 채우기 =====
function populateFilterOptions() {
  const depts = new Set();
  const owners = new Set();
  rows.forEach((r) => {
    if (r.dept) depts.add(r.dept);
    if (r.owner) owners.add(r.owner);
  });

  deptFilterEl.innerHTML = `<option value="">전체</option>`;
  Array.from(depts).forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    deptFilterEl.appendChild(opt);
  });

  ownerFilterEl.innerHTML = `<option value="">전체</option>`;
  Array.from(owners).forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    ownerFilterEl.appendChild(opt);
  });
}

// ===== 날짜 헤더 & 오늘 라인 =====
function renderDateHeader() {
  dateHeaderEl.innerHTML = "";
  if (!chartStart) return;

  const today = new Date();
  let todayOffsetPx = null;

  if (viewMode === "day") {
    // 일별 보기: 날짜 하나씩 표시
    for (let i = 0; i < chartTotalDays; i++) {
      const d = addDays(chartStart, i);
      const cell = document.createElement("div");
      cell.className = "date-cell";
      const dow = getKoreanDow(d);

      if (dow === "월") cell.classList.add("week-start");
      if (formatDate(d) === formatDate(today)) {
        cell.classList.add("today");
        todayOffsetPx = i * COL_WIDTH;
      }

      const daySpan = document.createElement("span");
      daySpan.className = "day";
      daySpan.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      const dowSpan = document.createElement("span");
      dowSpan.className = "dow";
      dowSpan.textContent = dow;

      cell.append(daySpan, dowSpan);
      dateHeaderEl.appendChild(cell);
    }
  } else {
    // 주별 보기: 1셀 = 1주 = COL_WIDTH px
    const totalWeeks = Math.ceil(chartTotalDays / 7);
    for (let i = 0; i < totalWeeks; i++) {
      const weekStart = addDays(chartStart, i * 7);
      const weekEnd = addDays(weekStart, 6);

      const cell = document.createElement("div");
      cell.className = "date-cell week-cell";

      // 오늘이 이 주에 포함되는지 확인
      if (today >= weekStart && today <= weekEnd) {
        cell.classList.add("today");
        const dayOffset = diffDays(weekStart, today);
        todayOffsetPx = (i + dayOffset / 7) * COL_WIDTH;
      }

      const daySpan = document.createElement("span");
      daySpan.className = "day";
      daySpan.textContent = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;

      const dowSpan = document.createElement("span");
      dowSpan.className = "dow";
      dowSpan.textContent = `~${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

      cell.append(daySpan, dowSpan);
      dateHeaderEl.appendChild(cell);
    }
  }

  if (todayOffsetPx != null) {
    todayLineEl.style.left = `${todayOffsetPx}px`;
    todayLineEl.style.display = "block";
  } else {
    todayLineEl.style.display = "none";
  }
}

// ===== 간트 차트 렌더 =====
function renderGantt(derivedRowsFiltered) {
  ganttBodyEl.innerHTML = "";
  ganttNamesEl.innerHTML = "";

  if (!chartStart) return;

  const scale = viewMode === "day" ? 1 : 1 / 7;
  const totalWidthPx = chartTotalDays * COL_WIDTH * scale;
  // gantt-body 너비를 차트 전체 픽셀 너비로 명시 설정
  // (절대 위치 막대들이 올바르게 표시되도록)
  ganttBodyEl.style.width = `${totalWidthPx}px`;

  const visibleRows = getVisibleRows(derivedRowsFiltered);

  visibleRows.forEach((row) => {
    // ── 왼쪽 업무명 컬럼 ──
    const nameRow = document.createElement("div");
    nameRow.className = `gantt-names-row ${row.type === "G" ? "group" : "task"}`;
    nameRow.dataset.id = row.id;

    const indent = document.createElement("div");
    indent.style.width = `${(row.level || 0) * 14}px`;
    indent.style.flexShrink = "0";
    nameRow.appendChild(indent);

    const nameInput = document.createElement("input");
    nameInput.className = "gantt-name-input";
    nameInput.type = "text";
    nameInput.value = row.name || "";
    nameInput.placeholder = "업무명 입력";
    nameInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx].name = nameInput.value;
      const tableNameInput = tableBodyEl.querySelector(
        `.table-row[data-id="${row.id}"] .col-name input[type="text"]`
      );
      if (tableNameInput) tableNameInput.value = nameInput.value;
    });
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("focus", (e) => e.stopPropagation());
    nameInput.addEventListener("keydown", (e) => e.stopPropagation());
    nameRow.appendChild(nameInput);

    // + 버튼: 동일 순위 행 추가
    const addSiblingBtn = document.createElement("button");
    addSiblingBtn.className = "add-btn-icon";
    addSiblingBtn.title = "동일 순위 행 추가";
    addSiblingBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addRow(row.id, row.level || 0, false);
    });
    nameRow.appendChild(addSiblingBtn);

    // ⊕ 버튼: 하위 행 추가
    const addChildBtn = document.createElement("button");
    addChildBtn.className = "add-child-btn-icon";
    addChildBtn.title = "하위 행 추가";
    addChildBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addRow(row.id, row.level || 0, true);
    });
    nameRow.appendChild(addChildBtn);

    // − 버튼: 행 삭제
    const delBtn = document.createElement("button");
    delBtn.className = "del-btn-icon";
    delBtn.title = "행 삭제";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRow(row.id);
    });
    nameRow.appendChild(delBtn);

    ganttNamesEl.appendChild(nameRow);

    // ── 오른쪽 막대 영역 ──
    const rowEl = document.createElement("div");
    rowEl.className = "gantt-row";
    const barArea = document.createElement("div");
    barArea.className = "gantt-bar-area";
    barArea.style.minWidth = `${totalWidthPx}px`;
    rowEl.append(barArea);
    ganttBodyEl.appendChild(rowEl);

    // 날짜가 없으면 막대 렌더링 생략
    if (!row.startDate || row.workDays <= 0) return;

    const calculatedEndDate = row.endDate || addDays(row.startDate, row.workDays - 1);
    if (!calculatedEndDate) return;

    const rowWithEndDate = { ...row, endDate: calculatedEndDate };

    const offsetDays = diffDays(chartStart, rowWithEndDate.startDate);
    const actualDurationDays = diffDays(rowWithEndDate.startDate, rowWithEndDate.endDate) + 1;
    const startPx = offsetDays * COL_WIDTH * scale;
    const widthPx = actualDurationDays * COL_WIDTH * scale;

    const bar = document.createElement("div");
    bar.className = "gantt-bar";
    if (rowWithEndDate.type === "G") bar.classList.add("group");
    bar.style.left = `${Math.max(startPx, 0)}px`;
    bar.style.width = `${Math.max(widthPx, 6)}px`;

    const progressInner = document.createElement("div");
    progressInner.className = "progress-inner";
    progressInner.style.width = `${Math.max(0, Math.min(100, rowWithEndDate.progress))}%`;
    bar.appendChild(progressInner);

    barArea.appendChild(bar);

    // 실제종료일 완료 마커 (바 영역에 절대 위치로 표시)
    if (rowWithEndDate.actualEndDate) {
      const aeDate = rowWithEndDate.actualEndDate instanceof Date
        ? rowWithEndDate.actualEndDate
        : parseDate(formatDate(rowWithEndDate.actualEndDate));
      const endDateObj = rowWithEndDate.endDate instanceof Date
        ? rowWithEndDate.endDate
        : (rowWithEndDate.endDate ? parseDate(formatDate(rowWithEndDate.endDate)) : null);
      const isOnTime = aeDate && endDateObj && aeDate <= endDateObj;
      const aeOffsetDays = diffDays(chartStart, aeDate);
      const aePx = aeOffsetDays * COL_WIDTH * scale;
      const marker = document.createElement("div");
      marker.className = `actual-end-marker ${isOnTime ? "on-time" : "late"}`;
      marker.style.left = `${aePx + COL_WIDTH * scale - 1}px`;
      marker.title = `실제종료일: ${formatDate(aeDate)} (${isOnTime ? "정상/조기 완료" : "지연 완료"})`;
      barArea.appendChild(marker);
    }
  });
}

// ===== 전체 렌더 =====
function renderAll(resetFilters = true) {
  rows.forEach((row) => {
    if (!row.start) row.start = "";
    if (!row.workDays || row.workDays <= 0) {
      if (row.start) row.workDays = 1;
    }
  });

  // G타입 행의 start를 먼저 계산(mutation)한 뒤 차트 범위 계산
  const derived = computeDerivedData(rows);
  calcChartRange();

  if (resetFilters) {
    populateFilterOptions();
  }
  const filtered = applyFilters(derived);
  renderTable(filtered);
  renderDateHeader();
  renderGantt(filtered);

  setTimeout(() => {
    updateScrollbarThumb();
    updateTableScrollbarThumb();
  }, 0);
}

// ===== 초기 프로젝트 시작일 표시 =====
function initView() {
  const starts = rows.map((r) => parseDate(r.start)).filter(Boolean);
  const minStart = starts.length
    ? new Date(Math.min(...starts.map((d) => d.getTime())))
    : new Date();
  projectStartInput.value = formatDate(minStart);
  calcChartRange();
}

// 날짜 범위 네비게이션 버튼 제거됨

viewDayBtn.addEventListener("click", () => {
  viewMode = "day";
  viewDayBtn.classList.add("active");
  viewWeekBtn.classList.remove("active");
  renderAll(false);
});

viewWeekBtn.addEventListener("click", () => {
  viewMode = "week";
  viewWeekBtn.classList.add("active");
  viewDayBtn.classList.remove("active");
  renderAll(false);
});

deptFilterEl.addEventListener("change", () => renderAll(false));
ownerFilterEl.addEventListener("change", () => renderAll(false));

// ===== 간트 차트 업무명 클릭 시 행 선택 하이라이트 =====
ganttNamesEl.addEventListener("click", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
  const nameRow = e.target.closest(".gantt-names-row");
  if (nameRow && nameRow.dataset.id) {
    document.querySelectorAll(".gantt-names-row").forEach((r) => r.classList.remove("selected"));
    nameRow.classList.add("selected");
  }
});


// ===== 입력란 접기/펼치기 =====
const collapseTablePanelBtn = document.getElementById("collapse-table-panel");
const expandTablePanelBtn = document.getElementById("expand-table-panel");
const mainLayoutEl = document.querySelector(".main-layout");

function setTablePanelCollapsed(collapsed) {
  if (collapsed) {
    tablePanelEl.classList.add("collapsed");
    mainLayoutEl.classList.add("table-panel-collapsed");
    if (expandTablePanelBtn) expandTablePanelBtn.style.display = "flex";
  } else {
    tablePanelEl.classList.remove("collapsed");
    mainLayoutEl.classList.remove("table-panel-collapsed");
    if (expandTablePanelBtn) expandTablePanelBtn.style.display = "none";
  }
  try {
    localStorage.setItem("tablePanelCollapsed", collapsed ? "true" : "false");
  } catch (_) {}
}

if (collapseTablePanelBtn) {
  collapseTablePanelBtn.addEventListener("click", () => setTablePanelCollapsed(true));
}
if (expandTablePanelBtn) {
  expandTablePanelBtn.addEventListener("click", () => setTablePanelCollapsed(false));
}

// 초기 상태 복원
try {
  if (localStorage.getItem("tablePanelCollapsed") === "true") {
    setTablePanelCollapsed(true);
  }
} catch (_) {}

// ===== 초기 실행 =====
initView();
renderAll();

// ===== 스크롤 동기화 (업무명 컬럼 ↔ 간트 막대 영역) =====
let isSyncingScroll = false;

function syncScroll(source, target) {
  if (isSyncingScroll) return;
  isSyncingScroll = true;
  target.scrollTop = source.scrollTop;
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
}

// 간트 차트 내부 스크롤 동기화
ganttBodyEl.addEventListener("scroll", () => syncScroll(ganttBodyEl, ganttNamesEl));
ganttNamesEl.addEventListener("scroll", () => syncScroll(ganttNamesEl, ganttBodyEl));

// 좌측 테이블 ↔ 우측 간트 차트 세로 스크롤 동기화
const tableBodyScrollEl = tableBodyEl;
tableBodyScrollEl.addEventListener("scroll", () => syncScroll(tableBodyScrollEl, ganttBodyEl));
tableBodyScrollEl.addEventListener("scroll", () => syncScroll(tableBodyScrollEl, ganttNamesEl));
ganttBodyEl.addEventListener("scroll", () => syncScroll(ganttBodyEl, tableBodyScrollEl));

// ===== 가로 스크롤 동기화 (날짜 헤더 ↔ 간트 바디) =====
let isSyncingHScroll = false;

function syncHScroll(source, target) {
  if (isSyncingHScroll) return;
  isSyncingHScroll = true;
  target.scrollLeft = source.scrollLeft;
  requestAnimationFrame(() => {
    isSyncingHScroll = false;
    updateScrollbarThumb();
  });
}

if (ganttScrollWrapperEl) {
  const dateHeaderScrollEl = dateHeaderEl;
  const ganttBodyScrollEl = ganttBodyEl;

  ganttScrollWrapperEl.addEventListener("scroll", () => {
    syncHScroll(ganttScrollWrapperEl, dateHeaderScrollEl);
    syncHScroll(ganttScrollWrapperEl, ganttBodyScrollEl);
    updateScrollbarThumb();
  });
}

// ===== 스크롤바 thumb 위치 업데이트 =====
function updateScrollbarThumb() {
  if (!ganttScrollWrapperEl || !ganttScrollbarEl || !ganttScrollbarThumbEl) return;

  const scrollLeft = ganttScrollWrapperEl.scrollLeft;
  const scrollWidth = ganttScrollWrapperEl.scrollWidth;
  const clientWidth = ganttScrollWrapperEl.clientWidth;
  const scrollbarWidth = ganttScrollbarEl.clientWidth;

  if (scrollWidth <= clientWidth) {
    ganttScrollbarThumbEl.style.display = "none";
    return;
  }

  ganttScrollbarThumbEl.style.display = "block";

  const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * scrollbarWidth);
  const maxLeft = scrollbarWidth - thumbWidth;
  const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * maxLeft;

  ganttScrollbarThumbEl.style.width = `${thumbWidth}px`;
  ganttScrollbarThumbEl.style.left = `${thumbLeft}px`;
}

// ===== 스크롤바 thumb 드래그 =====
if (ganttScrollbarThumbEl) {
  let isDraggingThumb = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;

  ganttScrollbarThumbEl.addEventListener("pointerdown", (e) => {
    if (!ganttScrollWrapperEl) return;
    isDraggingThumb = true;
    dragStartX = e.clientX;
    dragStartScrollLeft = ganttScrollWrapperEl.scrollLeft;
    ganttScrollbarThumbEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDraggingThumb || !ganttScrollWrapperEl || !ganttScrollbarEl) return;

    const dx = e.clientX - dragStartX;
    const scrollbarWidth = ganttScrollbarEl.clientWidth;
    const scrollWidth = ganttScrollWrapperEl.scrollWidth;
    const clientWidth = ganttScrollWrapperEl.clientWidth;
    const thumbWidth = ganttScrollbarThumbEl.clientWidth;
    const maxThumbLeft = scrollbarWidth - thumbWidth;
    const scrollRatio = (scrollWidth - clientWidth) / maxThumbLeft;

    const newScrollLeft = dragStartScrollLeft + dx * scrollRatio;
    ganttScrollWrapperEl.scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, newScrollLeft));
  });

  window.addEventListener("pointerup", () => {
    if (isDraggingThumb) {
      isDraggingThumb = false;
      try {
        ganttScrollbarThumbEl.releasePointerCapture();
      } catch (_) {
        // ignore
      }
    }
  });
}

// ===== 스크롤바 클릭 시 해당 위치로 이동 =====
if (ganttScrollbarEl) {
  ganttScrollbarEl.addEventListener("click", (e) => {
    if (!ganttScrollWrapperEl || e.target === ganttScrollbarThumbEl) return;

    const rect = ganttScrollbarEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollbarWidth = ganttScrollbarEl.clientWidth;
    const scrollWidth = ganttScrollWrapperEl.scrollWidth;
    const clientWidth = ganttScrollWrapperEl.clientWidth;

    const ratio = clickX / scrollbarWidth;
    const newScrollLeft = ratio * (scrollWidth - clientWidth);
    ganttScrollWrapperEl.scrollLeft = newScrollLeft;
  });
}

// ===== 렌더 후 스크롤바 업데이트 =====
const originalRenderGantt = renderGantt;
renderGantt = function(...args) {
  originalRenderGantt.apply(this, args);
  setTimeout(() => {
    updateScrollbarThumb();
  }, 0);
};

// 초기 스크롤바 업데이트
setTimeout(() => {
  updateScrollbarThumb();
}, 100);

// 리사이즈 시 스크롤바 업데이트
window.addEventListener("resize", () => {
  updateScrollbarThumb();
  updateTableScrollbarThumb();
});

// ===== 좌측 테이블 스크롤바 thumb 위치 업데이트 =====
function updateTableScrollbarThumb() {
  if (!tableScrollWrapperEl || !tableScrollbarEl || !tableScrollbarThumbEl) return;

  const scrollLeft = tableScrollWrapperEl.scrollLeft;
  const scrollWidth = tableScrollWrapperEl.scrollWidth;
  const clientWidth = tableScrollWrapperEl.clientWidth;
  const scrollbarWidth = tableScrollbarEl.clientWidth;

  if (scrollWidth <= clientWidth) {
    tableScrollbarThumbEl.style.display = "none";
    return;
  }

  tableScrollbarThumbEl.style.display = "block";

  const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * scrollbarWidth);
  const maxLeft = scrollbarWidth - thumbWidth;
  const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * maxLeft;

  tableScrollbarThumbEl.style.width = `${thumbWidth}px`;
  tableScrollbarThumbEl.style.left = `${thumbLeft}px`;
}

// ===== 좌측 테이블 스크롤바 thumb 드래그 =====
if (tableScrollbarThumbEl) {
  let isDraggingTableThumb = false;
  let dragTableStartX = 0;
  let dragTableStartScrollLeft = 0;

  tableScrollbarThumbEl.addEventListener("pointerdown", (e) => {
    if (!tableScrollWrapperEl) return;
    isDraggingTableThumb = true;
    dragTableStartX = e.clientX;
    dragTableStartScrollLeft = tableScrollWrapperEl.scrollLeft;
    tableScrollbarThumbEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDraggingTableThumb || !tableScrollWrapperEl || !tableScrollbarEl) return;

    const dx = e.clientX - dragTableStartX;
    const scrollbarWidth = tableScrollbarEl.clientWidth;
    const scrollWidth = tableScrollWrapperEl.scrollWidth;
    const clientWidth = tableScrollWrapperEl.clientWidth;
    const thumbWidth = tableScrollbarThumbEl.clientWidth;
    const maxThumbLeft = scrollbarWidth - thumbWidth;
    const scrollRatio = (scrollWidth - clientWidth) / maxThumbLeft;

    const newScrollLeft = dragTableStartScrollLeft + dx * scrollRatio;
    tableScrollWrapperEl.scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, newScrollLeft));
  });

  window.addEventListener("pointerup", () => {
    if (isDraggingTableThumb) {
      isDraggingTableThumb = false;
      try {
        tableScrollbarThumbEl.releasePointerCapture();
      } catch (_) {
        // ignore
      }
    }
  });
}

// ===== 좌측 테이블 스크롤바 클릭 시 해당 위치로 이동 =====
if (tableScrollbarEl) {
  tableScrollbarEl.addEventListener("click", (e) => {
    if (!tableScrollWrapperEl || e.target === tableScrollbarThumbEl) return;

    const rect = tableScrollbarEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollbarWidth = tableScrollbarEl.clientWidth;
    const scrollWidth = tableScrollWrapperEl.scrollWidth;
    const clientWidth = tableScrollWrapperEl.clientWidth;

    const ratio = clickX / scrollbarWidth;
    const newScrollLeft = ratio * (scrollWidth - clientWidth);
    tableScrollWrapperEl.scrollLeft = newScrollLeft;
  });
}

// ===== 좌측 테이블 스크롤 동기화 (헤더 ↔ 바디) =====
if (tableScrollWrapperEl) {
  const tableHeaderEl = tableScrollWrapperEl.querySelector(".table-header");
  
  tableScrollWrapperEl.addEventListener("scroll", () => {
    if (tableHeaderEl) {
      tableHeaderEl.style.transform = `translateX(-${tableScrollWrapperEl.scrollLeft}px)`;
    }
    updateTableScrollbarThumb();
  });
}

// ===== 렌더 후 좌측 테이블 스크롤바 업데이트 =====
const originalRenderTable = renderTable;
renderTable = function(...args) {
  originalRenderTable.apply(this, args);
  setTimeout(() => {
    updateTableScrollbarThumb();
  }, 0);
};

// 초기 좌측 테이블 스크롤바 업데이트
setTimeout(() => {
  updateTableScrollbarThumb();
}, 100);

// ===== A/B/C 폭 드래그 조절 =====
const ganttGridEl = document.querySelector(".gantt-grid");
const splitters = document.querySelectorAll(".splitter");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getVarPx(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const px = Number(String(v).replace("px", ""));
  return Number.isFinite(px) ? px : fallback;
}

function setWidths({ wB }) {
  if (typeof wB === "number") ganttGridEl.style.setProperty("--w-b", `${wB}px`);
  try {
    localStorage.setItem("ganttWidths", JSON.stringify({ wB }));
  } catch (_) {
    // ignore
  }
}

function loadWidths() {
  try {
    const raw = localStorage.getItem("ganttWidths");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.wB) {
      setWidths({
        wB: typeof parsed.wB === "number" ? parsed.wB : undefined,
      });
    }
  } catch (_) {
    // ignore
  }
}

loadWidths();

splitters.forEach((splitter) => {
  splitter.addEventListener("pointerdown", (e) => {
    if (!ganttGridEl) return;
    splitter.setPointerCapture(e.pointerId);

    const splitType = splitter.dataset.split; // 'bc'
    const startX = e.clientX;
    const startWB = getVarPx(ganttGridEl, "--w-b", 320);

    function onMove(ev) {
      const dx = ev.clientX - startX;

      // B|C 경계: B 폭 변경
      if (splitType === "bc") {
        const nextB = clamp(startWB + dx, 180, 700);
        setWidths({ wB: nextB });
      }
    }

    function onUp(ev) {
      try {
        splitter.releasePointerCapture(ev.pointerId);
      } catch (_) {
        // ignore
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
});


