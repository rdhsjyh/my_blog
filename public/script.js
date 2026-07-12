document.addEventListener("DOMContentLoaded", () => {
  /* ====== 基本 DOM 引用 ====== */
  const navLinks = document.querySelectorAll(".nav-link");
  const mainEl = document.querySelector(".main");
  const postsSection = document.getElementById("posts");
  const editorCard = document.querySelector(".card.editor");

  const input = document.getElementById("post-input");
  const submitBtn = document.getElementById("post-submit");
  const postsList = document.getElementById("posts-list");

  const MAX_CONTENT_CHARS = 10000;

  // 图片 / 视频上传相关（最多 9 个附件）
  const imageInput = document.getElementById("post-images");
  const videoInput = document.getElementById("post-videos");
  const previewGrid = document.getElementById("image-preview-grid");
  const MAX_MEDIA = 9;

  // currentMedia: [{ file: File, url: string, type: "image" | "video" }]
  let currentMedia = [];

  // ⭐ 新增：刚刚从主页切到文章的标记
  let justSwitchedToPosts = false;

  function countChars(value) {
    return Array.from((value || "").toString()).length;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function getMediaTypeFromFile(file) {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();

    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (/\.(mp4|mov|m4v)$/.test(name)) return "video";

    return "";
  }

  function getMediaTypeFromUrl(url) {
    const cleanUrl = (url || "").split("?")[0].toLowerCase();
    if (/\.(mp4|mov|m4v)$/.test(cleanUrl)) return "video";
    return "image";
  }

  function getEditorText(editor) {
    if (!editor) return "";
    return (editor.innerText || editor.textContent || "").replace(/\u200B/g, "");
  }

  function getEditorHtml(editor) {
    if (!editor) return "";
    return sanitizeRichContent(editor.innerHTML || "");
  }

  function clearEditor(editor) {
    if (!editor) return;
    editor.innerHTML = "";
  }

  function plainTextToEditableHtml(text) {
    const lines = (text || "").toString().split(/\r?\n/);
    if (!lines.length) return "";

    return lines
      .map((line) => `<div>${line ? escapeHtml(line) : "<br>"}</div>`)
      .join("");
  }

  function sanitizeRichContent(html) {
    const source = document.createElement("div");
    const output = document.createElement("div");
    const allowedTags = new Set(["DIV", "P", "BR", "H1", "H2", "H3", "H4", "H5"]);
    const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT"]);

    source.innerHTML = html || "";

    function walk(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent || ""));
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toUpperCase();
      if (blockedTags.has(tag)) return;

      if (allowedTags.has(tag)) {
        const cleanEl = document.createElement(tag.toLowerCase());

        if (tag !== "BR") {
          Array.from(node.childNodes).forEach((child) => walk(child, cleanEl));
          if (!cleanEl.childNodes.length) {
            cleanEl.appendChild(document.createElement("br"));
          }
        }

        parent.appendChild(cleanEl);
        return;
      }

      Array.from(node.childNodes).forEach((child) => walk(child, parent));
    }

    Array.from(source.childNodes).forEach((child) => walk(child, output));
    return output.innerHTML;
  }

  function renderPostContent(target, post) {
    if (!target) return;

    target.innerHTML = "";
    if (post.content_format === "html") {
      target.innerHTML = sanitizeRichContent(post.content || "");
    } else {
      target.textContent = post.content || "";
    }
  }

  function getPostMediaItems(post) {
    if (Array.isArray(post.media)) {
      return post.media
        .filter((item) => item && item.url)
        .map((item) => ({
          url: item.url,
          type: item.type === "video" ? "video" : "image",
        }));
    }

    const media = [];
    if (Array.isArray(post.images)) {
      post.images.forEach((url) => {
        if (url) media.push({ url, type: "image" });
      });
    }
    if (Array.isArray(post.videos)) {
      post.videos.forEach((url) => {
        if (url) media.push({ url, type: "video" });
      });
    }

    return media;
  }

  function applyTitleSize(editor, tagName) {
    if (!editor || !tagName) return;

    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;

    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    document.execCommand("formatBlock", false, tagName);
  }

  function bindTitleToolbar(toolbar, editor) {
    if (!toolbar || !editor) return;

    toolbar.querySelectorAll("[data-title-size]").forEach((button) => {
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyTitleSize(editor, button.dataset.titleSize);
      });
    });
  }

  function createTitleToolbar(editor) {
    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar post-edit-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-title-size="h1">T1</button>
      <button type="button" data-title-size="h2">T2</button>
      <button type="button" data-title-size="h3">T3</button>
      <button type="button" data-title-size="h4">T4</button>
      <button type="button" data-title-size="h5">T5</button>
    `;
    bindTitleToolbar(toolbar, editor);
    return toolbar;
  }

  bindTitleToolbar(document.querySelector(".editor-toolbar"), input);

  /* ====== 预览九宫格渲染 ====== */
  function renderMediaPreviews() {
  if (!previewGrid) return;
  previewGrid.innerHTML = "";

  currentMedia.forEach((item, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "image-thumb";
    wrapper.dataset.index = index.toString();

    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      wrapper.appendChild(video);

      const badge = document.createElement("span");
      badge.className = "video-badge";
      badge.textContent = "视频";
      wrapper.appendChild(badge);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `预览图片 ${index + 1}`;
      wrapper.appendChild(img);
    }

    const del = document.createElement("button");
    del.className = "image-thumb-delete";
    del.innerHTML = "✕";
    del.type = "button";

    // 点击 ❌ 删除
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      removeImageByIndex(index);
    });

    // 🌟🌟🌟【关键新增】点击预览图 → 放大预览
    wrapper.addEventListener("click", () => {
      // 如果处于删除模式，不放大
      if (previewGrid.classList.contains("delete-mode")) return;
      openLightbox(item.url, item.type);
    });

    // 📱 手机长按进入 delete-mode
    let longPressTimer = null;
    wrapper.addEventListener("touchstart", () => {
      longPressTimer = setTimeout(() => {
        previewGrid.classList.add("delete-mode");
      }, 500);
    });
    wrapper.addEventListener("touchend", () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    });
    wrapper.addEventListener("touchmove", () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    });

    wrapper.appendChild(del);
    previewGrid.appendChild(wrapper);
  });

  if (currentMedia.length === 0) {
    previewGrid.classList.remove("delete-mode");
  }
}


  function removeImageByIndex(idx) {
    const item = currentMedia[idx];
    if (item && item.url) {
      URL.revokeObjectURL(item.url);
    }
    currentMedia.splice(idx, 1);
    renderMediaPreviews();
  }

  function clearAllMedia() {
    currentMedia.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    currentMedia = [];
    renderMediaPreviews();
    if (imageInput) imageInput.value = "";
    if (videoInput) videoInput.value = "";
  }

  function addMediaFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const remaining = MAX_MEDIA - currentMedia.length;
    const accepted = files
      .map((file) => ({
        file,
        type: getMediaTypeFromFile(file),
      }))
      .filter((item) => item.type);
    const toAdd = accepted.slice(0, remaining);

    toAdd.forEach((item) => {
      const url = URL.createObjectURL(item.file);
      currentMedia.push({
        file: item.file,
        url,
        type: item.type,
      });
    });

    if (accepted.length < files.length) {
      alert("有些文件格式暂时不支持，只保留了图片、mp4、mov 或 m4v 视频。");
    }

    if (files.length > remaining) {
      alert(`最多只能选 ${MAX_MEDIA} 个附件，多余的我自动忽略了～`);
    }

    renderMediaPreviews();
  }

  if (imageInput) {
    imageInput.addEventListener("change", () => {
      addMediaFiles(imageInput.files);
    });
  }

  if (videoInput) {
    videoInput.addEventListener("change", () => {
      addMediaFiles(videoInput.files);
    });
  }

  /* ====== 后端 API 封装 ====== */
  const API_BASE = "/api";

  async function fetchPostsFromServer() {
    const res = await fetch(`${API_BASE}/posts`);
    if (!res.ok) throw new Error("Failed to fetch posts");
    return await res.json(); // [{id, content, created_at, images: []}, ...]
  }

  // 支持附件：有图片/视频时用 FormData，没有时用 JSON
  async function createPostOnServer(content, mediaArray, contentFormat = "html") {
    let res;
    if (mediaArray && mediaArray.length > 0) {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("content_format", contentFormat);
      mediaArray.forEach((item) => {
        formData.append("media", item.file);
      });

      res = await fetch(`${API_BASE}/posts`, {
        method: "POST",
        body: formData,
      });
    } else {
      res = await fetch(`${API_BASE}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, content_format: contentFormat }),
      });
    }

    if (!res.ok) throw new Error("Failed to create post");
    return await res.json(); // {id, content, created_at, media: []}
  }

  async function deletePostOnServer(id) {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete post");
    const data = await res.json();
    return data.success;
  }

  async function updatePostOnServer(id, content, contentFormat = "html") {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, content_format: contentFormat }),
    });
    if (!res.ok) throw new Error("Failed to update post");
    return await res.json();
  }

  /* ========= 时间格式：今天/昨天/日期+时间 ========= */
  function pad2(num) {
    return num.toString().padStart(2, "0");
  }

  function formatTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";

    const now = new Date();

    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());

    const dOnly = new Date(y, d.getMonth(), day).getTime();
    const nowOnly = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const diffDays = Math.round((nowOnly - dOnly) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `今天 ${hh}:${mm}`;
    } else if (diffDays === 1) {
      return `昨天 ${hh}:${mm}`;
    } else {
      return `${y}-${pad2(m)}-${pad2(day)} ${hh}:${mm}`;
    }
  }

  /* ========= 根据帖子数量控制 posts 页面整体位置 ========= */
  function updateHasPostsClass(count) {
    if (!postsSection) return;
    if (count > 0) {
      postsSection.classList.add("has-posts");
    } else {
      postsSection.classList.remove("has-posts");
    }
  }

    /* ========= 页面切换：只用淡入淡出，不做滑动 ========= */
  /* ========= 页面切换：左右滑动 + 透明度，绝对不动 Y ========= */
// 所有 slide 动画相关的 class
const SLIDE_CLASSES = [
  "slide-in-left",
  "slide-in-right",
  "slide-out-left",
  "slide-out-right",
];

/* ========= 页面切换：左右滑动 + 透明度，绝对不动 Y ========= */
function switchSection(targetId, direction) {
  const current = document.querySelector(".section.section-active");
  const next = document.getElementById(targetId);
  if (!next || current === next) return;

  let outClass, inClass;
  if (direction === "to-posts") {
    outClass = "slide-out-left";
    inClass = "slide-in-right";
  } else {
    outClass = "slide-out-right";
    inClass = "slide-in-left";
  }

  // 1️⃣ 先把旧的动画 class 全部清理掉，避免叠加
  [current, next].forEach((el) => {
    if (!el) return;
    el.classList.remove(...SLIDE_CLASSES);
  });

  // 2️⃣ 新页面：激活 + 加“滑入”动画
  next.classList.add("section-active", inClass);

  // 3️⃣ 旧页面：加“滑出”动画，动画结束后隐藏
  if (current) {
    current.classList.add(outClass);

    current.addEventListener(
      "animationend",
      () => {
        current.classList.remove("section-active", outClass);
      },
      { once: true }
    );
  }

  // ⚠️ 注意：不再在动画结束时删掉 next 的 inClass
  // 保留 slide-in-right / slide-in-left，动画结束后会停在 transform: translateX(0)
  // 这样就不会在最后一帧从“有 transform”跳回“无 transform”，避免那一下抖动
}



    const body = document.body;

    navLinks.forEach((btn) => {
  const targetId = btn.getAttribute("data-section");
  if (!targetId) return;

  btn.addEventListener("click", () => {
    navLinks.forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    const direction = targetId === "posts" ? "to-posts" : "to-home";

    switchSection(targetId, direction);

    // 切换到文章页时，只保证编辑器是非 compact 状态（不会改变纵向位置）
    if (targetId === "posts") {
      body.classList.add("posts-bg");
      handleScrollForEditor();   // 仍然保持编辑器非 compact
    } else {
      body.classList.remove("posts-bg");
    }
  });
});



  /* ========= 自定义删除确认弹窗 ========= */
  const modal = document.getElementById("confirm-modal");
  const modalBackdrop = modal.querySelector(".modal-backdrop");
  const modalCancel = document.getElementById("modal-cancel");
  const modalConfirm = document.getElementById("modal-confirm");

  let pendingDeleteId = null;
  let pendingDeleteEl = null;

  function showModal(id, el) {
    pendingDeleteId = id;
    pendingDeleteEl = el;
    modal.classList.add("show");
  }

  function hideModal() {
    modal.classList.remove("show");
  }

  function resetPending() {
    pendingDeleteId = null;
    pendingDeleteEl = null;
  }

  modalCancel.addEventListener("click", () => {
    hideModal();
    resetPending();
  });

  modalBackdrop.addEventListener("click", () => {
    hideModal();
    resetPending();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideModal();
      resetPending();
    }
  });

  modalConfirm.addEventListener("click", () => {
    if (!pendingDeleteId || !pendingDeleteEl) {
      hideModal();
      resetPending();
      return;
    }

    const idToDelete = pendingDeleteId;
    const elToDelete = pendingDeleteEl;

    hideModal();

    setTimeout(() => {
      elToDelete.classList.add("leaving");

      setTimeout(() => {
        performDeletePost(idToDelete);
        resetPending();
      }, 200);
    }, 50);
  });

  /* ========= Posts 渲染 + 编辑 ========= */

  function createPostElement(post) {
    const div = document.createElement("div");
    div.className = "post-card enter";
    div.dataset.id = post.id;
    div._postContent = post.content || "";
    div._postContentFormat = post.content_format || "text";

    const mediaItems = getPostMediaItems(post);
    const hasMedia = mediaItems.length > 0;

    const mediaHtml = hasMedia
      ? `<div class="post-image-grid">
          ${mediaItems
            .map(
              (item, idx) => {
                const src = escapeAttr(item.url);
                const type = item.type || getMediaTypeFromUrl(item.url);

                if (type === "video") {
                  return `
            <button type="button" class="post-image-thumb video-thumb" data-full="${src}" data-type="video">
              <video src="${src}" muted playsinline preload="metadata"></video>
              <span class="video-badge">视频</span>
            </button>`;
                }

                return `
            <button type="button" class="post-image-thumb" data-full="${src}" data-type="image">
              <img src="${src}" alt="Post image ${idx + 1}" loading="lazy" />
            </button>`;
              }
            )
            .join("")}
         </div>`
      : "";

    div.innerHTML = `
      <div class="post-header">
        <div class="post-title">Yoyo's Note</div>
        <div class="post-actions">
          <button class="edit-btn" data-id="${post.id}">✎</button>
          <button class="delete-btn" data-id="${post.id}">✖</button>
        </div>
      </div>
      <div class="post-content"></div>
      ${mediaHtml}
      <div class="post-meta">
        ${formatTime(post.created_at)}
      </div>
    `;

    renderPostContent(div.querySelector(".post-content"), post);

    requestAnimationFrame(() => {
      div.classList.remove("enter");
    });

    return div;
  }

  function bindCardActions() {
    postsList.querySelectorAll(".post-card").forEach((cardEl) => {
      const id = cardEl.dataset.id;
      if (!id) return;

      const deleteBtn = cardEl.querySelector(".delete-btn");
      const editBtn = cardEl.querySelector(".edit-btn");

      if (deleteBtn) {
        deleteBtn.onclick = () => {
          requirePin(() => {
            showModal(id, cardEl);
          });
        };
      }

      if (editBtn) {
        editBtn.onclick = () => {
          requirePin(() => {
            startEditingCard(cardEl);
          });
        };
      }

      // 图片点击放大
      const thumbs = cardEl.querySelectorAll(".post-image-thumb");
      thumbs.forEach((btn) => {
        btn.addEventListener("click", () => {
          const src = btn.getAttribute("data-full");
          const type = btn.getAttribute("data-type") || getMediaTypeFromUrl(src);
          if (src) openLightbox(src, type);
        });
      });
    });
  }

  function renderPosts(posts) {
    postsList.innerHTML = "";

    updateHasPostsClass(posts.length);

    posts.forEach((post) => {
      const el = createPostElement(post);
      postsList.appendChild(el);
    });

    bindCardActions();
    handleScrollForEditor();
  }

  async function refreshPosts() {
    try {
      const posts = await fetchPostsFromServer();
      renderPosts(posts);
    } catch (err) {
      console.error("refreshPosts error:", err);
      alert("加载文章列表失败了，可以稍后再试试～");
    }
  }

  /* ========= 编辑逻辑 ========= */

  function startEditingCard(cardEl) {
    if (cardEl.classList.contains("editing")) return;

    const contentDiv = cardEl.querySelector(".post-content");
    const metaDiv = cardEl.querySelector(".post-meta");
    if (!contentDiv || !metaDiv) return;

    const originalContent = cardEl._postContent || contentDiv.textContent || "";
    const originalFormat = cardEl._postContentFormat || "text";
    cardEl._originalPostContent = originalContent;
    cardEl._originalPostContentFormat = originalFormat;

    const editWrap = document.createElement("div");
    editWrap.className = "post-edit-wrap";

    const editor = document.createElement("div");
    editor.className = "post-edit-textarea";
    editor.contentEditable = "true";
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.innerHTML =
      originalFormat === "html"
        ? sanitizeRichContent(originalContent)
        : plainTextToEditableHtml(originalContent);

    editWrap.appendChild(createTitleToolbar(editor));
    editWrap.appendChild(editor);

    contentDiv.replaceWith(editWrap);

    const actions = document.createElement("div");
    actions.className = "post-edit-actions";
    actions.innerHTML = `
      <button type="button" class="btn-edit-cancel">取消</button>
      <button type="button" class="btn-edit-save">保存</button>
    `;
    metaDiv.before(actions);

    cardEl.classList.add("editing");
    editor.focus();

    const cancelBtn = actions.querySelector(".btn-edit-cancel");
    const saveBtn = actions.querySelector(".btn-edit-save");

    cancelBtn.addEventListener("click", () => {
      cancelEditingCard(cardEl);
    });

    saveBtn.addEventListener("click", () => {
      saveEditingCard(cardEl, editor);
    });
  }

  function cancelEditingCard(cardEl) {
    const originalContent = cardEl._originalPostContent || "";
    const originalFormat = cardEl._originalPostContentFormat || "text";
    const editWrap = cardEl.querySelector(".post-edit-wrap");
    const actions = cardEl.querySelector(".post-edit-actions");
    const metaDiv = cardEl.querySelector(".post-meta");

    if (editWrap) {
      const contentDiv = document.createElement("div");
      contentDiv.className = "post-content";
      renderPostContent(contentDiv, {
        content: originalContent,
        content_format: originalFormat,
      });
      editWrap.replaceWith(contentDiv);
    }

    if (actions) actions.remove();

    if (metaDiv) {
      metaDiv.style.opacity = "";
    }

    cardEl.classList.remove("editing");
    delete cardEl._originalPostContent;
    delete cardEl._originalPostContentFormat;
  }

  async function saveEditingCard(cardEl, editor) {
    const id = cardEl.dataset.id;
    if (!id || !editor) return;

    const raw = getEditorHtml(editor);
    const plainText = getEditorText(editor);
    if (!plainText.trim()) {
      alert("内容不能为空哦～");
      return;
    }

    if (countChars(plainText) > MAX_CONTENT_CHARS) {
      alert(`内容有点长（>${MAX_CONTENT_CHARS}字），可以分两条发哦～`);
      return;
    }

    const saveBtn = cardEl.querySelector(".btn-edit-save");
    if (!saveBtn) return;

    const originalBtnText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中.";

    try {
      const updated = await updatePostOnServer(id, raw, "html");
      if (!updated) throw new Error("Update returned empty");

      const contentDiv = document.createElement("div");
      contentDiv.className = "post-content";
      renderPostContent(contentDiv, updated);

      const editWrap = cardEl.querySelector(".post-edit-wrap");
      if (editWrap) editWrap.replaceWith(contentDiv);

      const metaDiv = cardEl.querySelector(".post-meta");
      if (metaDiv) {
        metaDiv.textContent = formatTime(updated.created_at);
        metaDiv.style.opacity = "";
      }

      const actions = cardEl.querySelector(".post-edit-actions");
      if (actions) actions.remove();

      cardEl.classList.remove("editing");
      cardEl._postContent = updated.content || "";
      cardEl._postContentFormat = updated.content_format || "text";
      delete cardEl._originalPostContent;
      delete cardEl._originalPostContentFormat;
    } catch (err) {
      console.error("saveEditingCard error:", err);
      alert("保存失败了，可以稍后再试试，内容还在编辑框里～");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalBtnText;
    }
  }

  /* ========= 发布 / 删除 ========= */

  async function publishPost(options = {}) {
  if (!input || !submitBtn) return;

  const raw = getEditorHtml(input);
  const plainText = getEditorText(input);
  const hasText = plainText.trim().length > 0;
  const hasMedia = currentMedia.length > 0;

  // 文字和附件都没有，就不发
  if (!hasText && !hasMedia) {
    alert("写点文字或者选一个附件再发吧～");
    return;
  }

  // 只在有文字的时候才检查长度
  if (hasText && countChars(plainText) > MAX_CONTENT_CHARS) {
    alert(`内容有点长（>${MAX_CONTENT_CHARS}字），可以分两条发哦～`);
    return;
  }

  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "发送中.";

  try {
    const newPost = await createPostOnServer(raw, currentMedia, "html");
    if (!newPost) throw new Error("Empty new post");

    clearEditor(input);
    clearAllMedia();

    const el = createPostElement(newPost);
    postsList.prepend(el);
    bindCardActions();
    updateHasPostsClass(postsList.children.length);

    if (options.scrollToTop && mainEl) {
      mainEl.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  } catch (err) {
    console.error("publishPost error:", err);
    alert("发帖失败了，等一下再试试～ 内容我帮你保留在输入框里。");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}


  async function performDeletePost(id) {
    try {
      const ok = await deletePostOnServer(id);
      if (!ok) throw new Error("Delete failed");
      await refreshPosts();
    } catch (err) {
      console.error("performDeletePost error:", err);
      alert("删除失败了，可以稍后再试试～");
    }
  }

  /* ========= New Post 吸顶 / 收起逻辑 ========= */

      /* ========= New Post 吸顶 / 收起逻辑（暂时关闭 compact） ========= */

  function handleScrollForEditor() {
    if (!mainEl || !editorCard) return;

    // 不管在什么状态，永远保持非 compact、按钮文字为“发布”
    editorCard.classList.remove("compact");
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.textContent = "发布";
    }
  }



  if (mainEl) {
    mainEl.addEventListener("scroll", handleScrollForEditor);
  }

  /* ========= 绑定发布按钮 / 快捷键 ========= */

    if (submitBtn && input) {
    submitBtn.addEventListener("click", () => {
      requirePin(() => {
        // 不再根据 compact 决定是否滚回顶部，有需要之后再单独设计
        publishPost({
          scrollToTop: false,
        });
      });
    });


    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        requirePin(() => {
          publishPost();
        });
      }
    });
  }

  /* ========= PIN 验证逻辑 ========= */

  const pinOverlay = document.getElementById("pin-overlay");
  const pinBoxes = pinOverlay
    ? pinOverlay.querySelectorAll(".pin-box")
    : null;
  const pinBoxesWrapper = pinOverlay
    ? pinOverlay.querySelector(".pin-boxes")
    : null;
  const pinErrorText = pinOverlay
    ? pinOverlay.querySelector(".pin-error")
    : null;
  const pinHiddenInput = document.getElementById("pin-hidden-input");
  const pinCancelBtn = document.getElementById("pin-cancel");
  const PIN_CODE = "1018520";

  let pinVerified = false;
  let pinCallback = null;

  function updatePinBoxes(value) {
    if (!pinBoxes) return;

    pinBoxes.forEach((box, index) => {
      if (index < value.length) {
        box.classList.add("filled");
        box.textContent = "•";
      } else {
        box.classList.remove("filled");
        box.textContent = "";
      }
    });

    let activeIndex = value.length;
    if (activeIndex > pinBoxes.length - 1) {
      activeIndex = -1;
    }

    pinBoxes.forEach((box, index) => {
      box.classList.toggle("active", index === activeIndex);
    });
  }

  function requirePin(action) {
    if (pinVerified || !pinOverlay || !pinHiddenInput) {
      action();
      return;
    }

    pinCallback = action;

    document.body.classList.add("pin-active");
    pinOverlay.classList.remove("pin-error-state");
    if (pinErrorText) {
      pinErrorText.textContent = "PIN错误";
    }

    pinHiddenInput.value = "";
    updatePinBoxes("");

    setTimeout(() => {
      pinHiddenInput.focus();
    }, 30);
  }

  function closePinOverlay() {
    document.body.classList.remove("pin-active");
    pinCallback = null;
  }

  if (pinHiddenInput) {
    pinHiddenInput.addEventListener("input", () => {
      let v = pinHiddenInput.value.replace(/\D/g, "");
      if (v.length > 7) v = v.slice(0, 7);
      pinHiddenInput.value = v;
      updatePinBoxes(v);

      if (v.length === 7) {
        if (v === PIN_CODE) {
          pinVerified = true;
          const cb = pinCallback;

          setTimeout(() => {
            closePinOverlay();
            if (typeof cb === "function") cb();
          }, 500);
        } else {
          if (pinOverlay) {
            pinOverlay.classList.add("pin-error-state");
          }
          if (pinBoxesWrapper) {
            pinBoxesWrapper.classList.add("shake");
            setTimeout(() => {
              pinBoxesWrapper.classList.remove("shake");
            }, 280);
          }

          setTimeout(() => {
            if (pinOverlay) {
              pinOverlay.classList.remove("pin-error-state");
            }
            pinHiddenInput.value = "";
            updatePinBoxes("");
          }, 450);
        }
      }
    });

    pinHiddenInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePinOverlay();
      }
    });
  }

  if (pinCancelBtn) {
    pinCancelBtn.addEventListener("click", () => {
      closePinOverlay();
    });
  }

  if (pinOverlay) {
    const pinBackdrop = pinOverlay.querySelector(".pin-backdrop");
    if (pinBackdrop) {
      pinBackdrop.addEventListener("click", () => {
        closePinOverlay();
      });
    }
  }

  if (pinBoxesWrapper && pinHiddenInput) {
    pinBoxesWrapper.addEventListener("click", () => {
      pinHiddenInput.focus();
    });
  }

  if (pinBoxes && pinHiddenInput) {
    pinBoxes.forEach((box) => {
      box.addEventListener("click", () => {
        pinHiddenInput.focus();
      });
    });
  }

  /* ========= 图片 Lightbox ========= */
  const lightbox = document.getElementById("image-lightbox");
  const lightboxImg = lightbox
  ? lightbox.querySelector(".image-lightbox-img")
  : null;
  const lightboxVideo = lightbox
  ? lightbox.querySelector(".image-lightbox-video")
  : null;
  const lightboxBackdrop = lightbox
  ? lightbox.querySelector(".image-lightbox-backdrop")
  : null;
  const lightboxClose = lightbox
  ? lightbox.querySelector(".image-lightbox-close")
  : null;   // 新增

  function openLightbox(src, type = "image") {
    if (!lightbox || !lightboxImg || !lightboxVideo) return;

    if (type === "video") {
      lightboxImg.removeAttribute("src");
      lightboxImg.style.display = "none";
      lightboxVideo.src = src;
      lightboxVideo.style.display = "block";
    } else {
      lightboxVideo.pause();
      lightboxVideo.removeAttribute("src");
      lightboxVideo.style.display = "none";
      lightboxImg.src = src;
      lightboxImg.style.display = "block";
    }

    lightbox.classList.add("show");
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg || !lightboxVideo) return;
    lightbox.classList.remove("show");
    lightboxImg.src = "";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
  }

  if (lightboxBackdrop) {
  lightboxBackdrop.addEventListener("click", closeLightbox);
}
if (lightboxClose) {
  lightboxClose.addEventListener("click", closeLightbox);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

  /* ========= 初始化 ========= */
  (async () => {
    await refreshPosts();
    handleScrollForEditor();
  })();
});
