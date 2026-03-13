(() => {
  const payload = JSON.parse(document.getElementById("payload").textContent);
  const video = document.getElementById("video");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");

  const pred = payload.pred || {};
  const predB = payload.pred_b || {};
  const predC = payload.pred_c || {};
  let gt = payload.gt || {};
  let draftGt = { ...gt };

  const editorEl = document.getElementById("editor");
  const tEl = document.getElementById("gt_time");
  const cxEl = document.getElementById("gt_cx");
  const cyEl = document.getElementById("gt_cy");
  const typeEl = document.getElementById("gt_type");
  const noteEl = document.getElementById("gt_note");
  const saveMsg = document.getElementById("save-msg");
  const saveState = document.getElementById("save-state");

  const predText = document.getElementById("pred-text");
  const gtText = document.getElementById("gt-text");
  const metaText = document.getElementById("meta-text");
  const cursorPos = document.getElementById("cursor-pos");
  const historyBody = document.getElementById("history-body");
  const showAEl = document.getElementById("show-a");
  const showBEl = document.getElementById("show-b");
  const showCEl = document.getElementById("show-c");
  const showGtEl = document.getElementById("show-gt");
  const gtPanelEl = document.getElementById("gt-panel");
  const gtPanelTitleEl = document.getElementById("gt-panel-title");
  const gtEditFieldsEl = document.getElementById("gt-edit-fields");
  const editModeEl = document.getElementById("edit-mode");
  const toggleEditModeBtn = document.getElementById("toggle-edit-mode");
  const editModeStatusEl = document.getElementById("edit-mode-status");
  const playbackTimeDisplayEl = document.getElementById("playback-time-display");
  const setTimeFromVideoBtn = document.getElementById("sync-time-from-video");
  const videoStatusEl = document.getElementById("video-status");
  const openVideoDirectEl = document.getElementById("open-video-direct");

  let isDraggingGt = false;
  let hoverPoint = null;
  let loadTimeoutId = null;
  const serverCanEdit = !saveMsg || !document.getElementById("save-gt")?.disabled;

  function num(v, fallback = null) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }

  function syncFormFromGt() {
    tEl.value = gt.accident_time ?? "";
    cxEl.value = gt.center_x ?? "";
    cyEl.value = gt.center_y ?? "";
    typeEl.value = gt.type ?? "";
    noteEl.value = gt.note ?? "";
    draftGt = { ...gt };
  }

  function getRenderGt() {
    return (editModeEl && editModeEl.checked) ? draftGt : gt;
  }

  function isEditEnabled() {
    return !!(serverCanEdit && editModeEl && editModeEl.checked);
  }

  function applyEditModeUI() {
    const enabled = isEditEnabled();
    if (editModeEl && editModeEl.checked && !serverCanEdit) {
      editModeEl.checked = false;
    }
    canvas.style.pointerEvents = enabled ? "auto" : "none";
    canvas.style.cursor = enabled ? "crosshair" : "default";
    if (enabled && showGtEl) {
      showGtEl.checked = true;
    }
    if (toggleEditModeBtn) {
      toggleEditModeBtn.textContent = enabled ? "편집 모드: ON" : "편집 모드: OFF";
      toggleEditModeBtn.disabled = !serverCanEdit;
    }
    if (editModeStatusEl) {
      if (!serverCanEdit) {
        editModeStatusEl.textContent = "이 소스는 읽기 전용입니다.";
      } else {
        editModeStatusEl.textContent = enabled ? "드래그 편집 활성화" : "재생/탐색 모드";
      }
    }
    if (gtPanelTitleEl) {
      if (!serverCanEdit) {
        gtPanelTitleEl.textContent = "Expected GT (읽기 전용)";
      } else {
        gtPanelTitleEl.textContent = enabled ? "Expected GT 편집" : "Expected GT (읽기 전용)";
      }
    }
    if (gtEditFieldsEl) {
      gtEditFieldsEl.disabled = !enabled;
    }
    if (gtPanelEl) {
      gtPanelEl.classList.toggle("panel-disabled", !enabled);
    }
    if (cursorPos) {
      cursorPos.textContent = enabled
        ? "편집 모드: 마우스를 움직이면 GT 마커가 따라오고, 드래그하면 위치를 반영합니다."
        : "오버레이 보기 모드";
    }
    if (saveState) {
      if (!enabled) {
        saveState.textContent = saveState.textContent || "읽기 전용 보기 모드";
      } else {
        saveState.textContent = "편집 중: 드래그 후 저장을 눌러 확정하세요.";
      }
    }
    hoverPoint = null;
  }

  function syncDraftFromForm() {
    draftGt = {
      ...draftGt,
      video_path: payload.video_path,
      accident_time: num(tEl.value),
      center_x: num(cxEl.value),
      center_y: num(cyEl.value),
      type: (typeEl.value || "").trim() || null,
      note: (noteEl.value || "").trim() || null,
      updated_by: gt.updated_by,
      updated_at: gt.updated_at,
    };
  }

  function drawMarker(xn, yn, color, label) {
    if (xn == null || yn == null) {
      return;
    }
    const w = canvas.width;
    const h = canvas.height;
    const x = Math.round(xn * w);
    const y = Math.round(yn * h);
    const r = Math.max(12, Math.round(Math.min(w, h) * 0.03));

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(Math.max(0, x - 38), Math.max(0, y - r - 30), 76, 20);
    ctx.fillStyle = color;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(label, Math.max(4, x - 32), Math.max(14, y - r - 15));
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function drawInfo() {
    const t = video.currentTime || 0;
    const renderGt = getRenderGt();
    const lines = [
      `t=${t.toFixed(2)}s`,
      `A: time=${(pred.accident_time ?? 0).toFixed ? pred.accident_time.toFixed(2) : pred.accident_time}, type=${pred.type ?? "-"}`,
      `B: time=${(predB.accident_time ?? 0).toFixed ? predB.accident_time.toFixed(2) : predB.accident_time}, type=${predB.type ?? "-"}`,
      `C: time=${(predC.accident_time ?? 0).toFixed ? predC.accident_time.toFixed(2) : predC.accident_time}, type=${predC.type ?? "-"}`,
      `GT: time=${(renderGt.accident_time ?? 0).toFixed ? renderGt.accident_time.toFixed(2) : renderGt.accident_time}, type=${renderGt.type ?? "-"}`,
    ];

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(6, 6, 460, 108);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "12px monospace";
    lines.forEach((line, i) => {
      ctx.fillText(line, 12, 24 + i * 18);
    });

    if (pred.accident_time != null && Math.abs(t - pred.accident_time) < 0.2) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    }
    if (renderGt.accident_time != null && Math.abs(t - renderGt.accident_time) < 0.2) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    }
  }

  function drawEditGuide() {
    if (!isEditEnabled()) {
      return;
    }
    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(10, canvas.height - 40, 220, 28);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "12px sans-serif";
    ctx.fillText("드래그하여 GT 위치 지정", 18, canvas.height - 22);
  }

  function renderHUDText() {
    const renderGt = getRenderGt();
    const lineA = `A: t=${pred.accident_time ?? "-"}, x=${pred.center_x ?? "-"}, y=${pred.center_y ?? "-"}, type=${pred.type ?? "-"}`;
    const lineB = `B: t=${predB.accident_time ?? "-"}, x=${predB.center_x ?? "-"}, y=${predB.center_y ?? "-"}, type=${predB.type ?? "-"}`;
    const lineC = `C: t=${predC.accident_time ?? "-"}, x=${predC.center_x ?? "-"}, y=${predC.center_y ?? "-"}, type=${predC.type ?? "-"}`;
    predText.textContent = `${lineA}\n${lineB}\n${lineC}`;
    gtText.textContent = `GT: t=${renderGt.accident_time ?? "-"}, x=${renderGt.center_x ?? "-"}, y=${renderGt.center_y ?? "-"}, type=${renderGt.type ?? "-"}, by=${gt.updated_by ?? "-"}`;
    const m = payload.meta || {};
    metaText.textContent = `duration=${m.duration ?? "-"}s, quality=${m.quality ?? "-"}, scene=${m.scene_layout ?? "-"}, weather=${m.weather ?? "-"}`;
  }

  function resizeCanvas() {
    const rect = video.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
  }

  function showVideoStatus(text) {
    if (videoStatusEl) {
      videoStatusEl.textContent = text || "";
      videoStatusEl.style.color = text ? "#9f1239" : "#5a6670";
    }
  }

  function showVideoSuccess(text) {
    if (videoStatusEl) {
      videoStatusEl.textContent = text || "";
      videoStatusEl.style.color = text ? "#15803d" : "#5a6670";
    }
  }

  function seekVideoToDraftTime() {
    if (!isEditEnabled()) {
      return;
    }
    const target = num(tEl.value);
    if (target == null || target < 0) {
      return;
    }
    const maxT = Number.isFinite(video.duration) ? video.duration : null;
    const clamped = maxT == null ? target : Math.min(target, Math.max(0, maxT));
    video.currentTime = clamped;
  }

  async function refreshHistory() {
    const res = await fetch(`/api/gt/history?source=${encodeURIComponent(payload.source || "test")}&video_path=${encodeURIComponent(payload.video_path)}`);
    const data = await res.json();
    const items = data.items || [];
    historyBody.innerHTML = "";
    items.forEach((h) => {
      const tr = document.createElement("tr");

      const tdTime = document.createElement("td");
      tdTime.style.verticalAlign = "top";
      tdTime.style.borderTop = "1px solid #ddd";
      tdTime.style.padding = "6px";
      tdTime.textContent = h.edited_at || "";

      const tdEditor = document.createElement("td");
      tdEditor.style.verticalAlign = "top";
      tdEditor.style.borderTop = "1px solid #ddd";
      tdEditor.style.padding = "6px";
      tdEditor.textContent = h.edited_by || "";

      const tdAfter = document.createElement("td");
      tdAfter.style.verticalAlign = "top";
      tdAfter.style.borderTop = "1px solid #ddd";
      tdAfter.style.padding = "6px";
      tdAfter.style.whiteSpace = "pre-wrap";
      tdAfter.textContent = h.after_json || "";

      tr.appendChild(tdTime);
      tr.appendChild(tdEditor);
      tr.appendChild(tdAfter);
      historyBody.appendChild(tr);
    });
  }

  function draw() {
    if (!video.videoWidth || !video.videoHeight) {
      requestAnimationFrame(draw);
      return;
    }
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (showAEl.checked) {
      drawMarker(pred.center_x, pred.center_y, "#ef4444", "A");
    }
    if (showBEl.checked) {
      drawMarker(predB.center_x, predB.center_y, "#3b82f6", "B");
    }
    if (showCEl.checked) {
      drawMarker(predC.center_x, predC.center_y, "#eab308", "C");
    }
    if (showGtEl.checked) {
      if (isEditEnabled() && hoverPoint && !isDraggingGt) {
        drawMarker(hoverPoint.x, hoverPoint.y, "#22c55e", "GT");
      } else {
        const renderGt = getRenderGt();
        drawMarker(renderGt.center_x, renderGt.center_y, "#22c55e", "GT");
      }
    }
    drawEditGuide();
    drawInfo();
    requestAnimationFrame(draw);
  }

  function updateDraftPointFromEvent(e) {
    const p = pointFromEvent(e);
    const x = p.x;
    const y = p.y;
    cxEl.value = x.toFixed(4);
    cyEl.value = y.toFixed(4);
    syncDraftFromForm();
    renderHUDText();
    cursorPos.textContent = `편집 좌표: x=${x.toFixed(4)}, y=${y.toFixed(4)}`;
    if (saveMsg) {
      saveMsg.textContent = "좌표를 이동했습니다. 저장 버튼을 누르면 반영됩니다.";
    }
    if (saveState) {
      saveState.textContent = "미저장 변경 있음";
    }
  }

  canvas.addEventListener("click", (e) => {
    if (!isEditEnabled()) {
      return;
    }
    if (isDraggingGt) {
      return;
    }
    updateDraftPointFromEvent(e);
  });

  canvas.addEventListener("mousedown", (e) => {
    if (!isEditEnabled()) {
      return;
    }
    if (!showGtEl.checked) {
      return;
    }
    isDraggingGt = true;
    hoverPoint = null;
    updateDraftPointFromEvent(e);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isEditEnabled()) {
      return;
    }
    if (isDraggingGt) {
      updateDraftPointFromEvent(e);
      return;
    }
    hoverPoint = pointFromEvent(e);
    if (cursorPos) {
      cursorPos.textContent = `미리보기 좌표: x=${hoverPoint.x.toFixed(4)}, y=${hoverPoint.y.toFixed(4)} (드래그하면 반영)`;
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingGt && saveMsg) {
      saveMsg.textContent = "드래그 완료. 저장 버튼을 누르면 서버에 반영됩니다.";
    }
    isDraggingGt = false;
  });

  canvas.addEventListener("mouseleave", () => {
    isDraggingGt = false;
    hoverPoint = null;
  });

  [tEl, cxEl, cyEl, typeEl, noteEl].forEach((el) => {
    el.addEventListener("input", () => {
      syncDraftFromForm();
      if (el === tEl) {
        seekVideoToDraftTime();
      }
      renderHUDText();
      if (saveState) {
        saveState.textContent = "미저장 변경 있음";
      }
    });
  });

  editModeEl?.addEventListener("change", () => {
    applyEditModeUI();
    renderHUDText();
  });

  toggleEditModeBtn?.addEventListener("click", () => {
    if (!editModeEl) {
      return;
    }
    editModeEl.checked = !editModeEl.checked;
    applyEditModeUI();
    renderHUDText();
  });

  setTimeFromVideoBtn?.addEventListener("click", () => {
    tEl.value = (video.currentTime || 0).toFixed(2);
    syncDraftFromForm();
    renderHUDText();
    if (saveMsg) {
      saveMsg.textContent = `현재 재생시간 ${tEl.value}s 를 accident_time에 적용했습니다. 저장 버튼을 누르면 확정됩니다.`;
    }
    if (saveState) {
      saveState.textContent = "미저장 변경 있음";
    }
  });

  video.addEventListener("timeupdate", () => {
    if (playbackTimeDisplayEl) {
      playbackTimeDisplayEl.textContent = `현재 재생시간: ${(video.currentTime || 0).toFixed(2)}s`;
    }
  });

  video.addEventListener("error", () => {
    const err = video.error;
    const code = err ? err.code : "unknown";
    showVideoStatus(`비디오 로드 실패(code=${code}). 직접 열기로 확인해 주세요.`);
  });

  video.addEventListener("loadeddata", () => {
    showVideoSuccess("비디오 로드 완료");
    if (loadTimeoutId) {
      clearTimeout(loadTimeoutId);
      loadTimeoutId = null;
    }
  });

  video.addEventListener("stalled", () => {
    showVideoStatus("네트워크 지연으로 재생이 멈췄습니다. 잠시 후 자동 복구되거나 직접 열기로 확인해 주세요.");
  });

  video.addEventListener("waiting", () => {
    showVideoStatus("버퍼링 중입니다...");
  });

  video.addEventListener("playing", () => {
    showVideoSuccess("재생 중");
  });

  document.getElementById("seek-pred").addEventListener("click", () => {
    if (pred.accident_time != null) {
      video.currentTime = Math.max(0, Number(pred.accident_time));
    }
  });

  document.getElementById("seek-gt").addEventListener("click", () => {
    const renderGt = getRenderGt();
    if (renderGt.accident_time != null) {
      video.currentTime = Math.max(0, Number(renderGt.accident_time));
    }
  });

  document.getElementById("seek-pred-b").addEventListener("click", () => {
    if (predB.accident_time != null) {
      video.currentTime = Math.max(0, Number(predB.accident_time));
    }
  });

  document.getElementById("seek-pred-c").addEventListener("click", () => {
    if (predC.accident_time != null) {
      video.currentTime = Math.max(0, Number(predC.accident_time));
    }
  });

  document.getElementById("copy-pred").addEventListener("click", () => {
    tEl.value = pred.accident_time ?? "";
    cxEl.value = pred.center_x ?? "";
    cyEl.value = pred.center_y ?? "";
    typeEl.value = pred.type ?? "";
    syncDraftFromForm();
    renderHUDText();
  });

  document.getElementById("save-gt").addEventListener("click", async () => {
    const editor = (editorEl.value || "").trim() || localStorage.getItem("gt_editor") || "anonymous";
    localStorage.setItem("gt_editor", editor);

    const body = {
      source: payload.source || "test",
      video_path: payload.video_path,
      editor,
      accident_time: draftGt.accident_time,
      center_x: draftGt.center_x,
      center_y: draftGt.center_y,
      type: draftGt.type || "",
      note: draftGt.note || "",
      base_updated_at: gt.updated_at || null,
    };

    saveMsg.textContent = "저장 중...";

    const res = await fetch("/api/gt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data.detail && data.detail.current) {
        const current = data.detail.current;
        gt = current;
        syncFormFromGt();
        renderHUDText();
        saveMsg.textContent = "저장 충돌: 최신 값으로 갱신했습니다. 확인 후 다시 저장하세요.";
        if (saveState) {
          saveState.textContent = "다른 편집자가 먼저 저장했습니다. 최신 값으로 동기화됨.";
        }
        return;
      }
      saveMsg.textContent = `저장 실패: ${data.detail || "unknown"}`;
      if (saveState) {
        saveState.textContent = "저장 실패";
      }
      return;
    }

    gt = data.record;
    draftGt = { ...gt };
    hoverPoint = null;
    isDraggingGt = false;
    if (editModeEl) {
      editModeEl.checked = false;
    }
    applyEditModeUI();
    syncFormFromGt();
    renderHUDText();
    refreshHistory();
    saveMsg.textContent = "저장 완료: GT 오버레이와 우측 값이 즉시 반영되었습니다.";
    if (saveState) {
      saveState.textContent = `마지막 저장: ${gt.updated_at} / 편집자: ${gt.updated_by} / 새로고침 불필요`;
    }
    showVideoSuccess("저장 완료: 최신 GT 반영됨");
  });

  if (openVideoDirectEl) {
    const directUrl = `/media?source=${encodeURIComponent(payload.source || "test")}&video_path=${encodeURIComponent(payload.video_path)}`;
    openVideoDirectEl.setAttribute("href", directUrl);
  }

  editorEl.value = localStorage.getItem("gt_editor") || "";
  if (!editorEl.value && payload.user) {
    editorEl.value = payload.user;
  }
  syncFormFromGt();
  syncDraftFromForm();
  if (editModeEl) {
    editModeEl.checked = false;
  }
  applyEditModeUI();
  renderHUDText();
  video.addEventListener("loadedmetadata", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);
  if (video.currentSrc || video.src) {
    video.setAttribute("data-base-src", video.currentSrc || video.src);
  }
  loadTimeoutId = window.setTimeout(() => {
    if (video.readyState < 2) {
      showVideoStatus("비디오 로드가 지연되고 있습니다. 잠시 기다리거나 직접 열기를 사용해 주세요.");
    }
  }, 8000);
  requestAnimationFrame(draw);
})();
