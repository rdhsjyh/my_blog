document.addEventListener("DOMContentLoaded", () => {
  /* ====== 基本 DOM 引用 ====== */
  const navLinks = document.querySelectorAll(".nav-link");
  const mainEl = document.querySelector(".main");
  const postsSection = document.getElementById("posts");
  const editorCard = document.querySelector(".card.editor");

  const input = document.getElementById("post-input");
  const submitBtn = document.getElementById("post-submit");
  const postsList = document.getElementById("posts-list");

  /* ====== 后端 API 封装 ====== */
  const API_BASE = "/api";

  async function fetchPostsFromServer() {
    const res = await fetch(`${API_BASE}/posts`);
    if (!res.ok) throw new Error("Failed to fetch posts");
    return await res.json(); // [{id, content, created_at}, ...]
  }

  async function createPostOnServer(content) {
    const res = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error("Failed to create post");
    return await res.json(); // {id, content, created_at}
  }

  async function deletePostOnServer(id) {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete post");
    const data = await res.json();
    return data.success;
  }

  async function updatePostOnServer(id, content) {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error("Failed to update post");
    return await res.json(); // 更新后的 post
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

  /* ========= 页面切换动画 ========= */
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

    next.classList.add("section-active", inClass);
    current.classList.add(outClass);

    current.addEventListener(
      "animationend",
      () => {
        current.classList.remove("section-active", outClass);
      },
      { once: true }
    );

    next.addEventListener(
      "animationend",
      () => {
        next.classList.remove(inClass);
      },
      { once: true }
    );
  }

  navLinks.forEach((btn) => {
    const targetId = btn.getAttribute("data-section");
    if (!targetId) return;

    btn.addEventListener("click", () => {
      navLinks.forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");

      const direction = targetId === "posts" ? "to-posts" : "to-home";
      switchSection(targetId, direction);

      if (targetId === "posts" && mainEl) {
        mainEl.scrollTo({ top: 0, behavior: "auto" });
        requestAnimationFrame(handleScrollForEditor);
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

    div.innerHTML = `
      <div class="post-header">
        <div class="post-title">Yoyo's Note</div>
        <div class="post-actions">
          <button class="edit-btn" data-id="${post.id}">✎</button>
          <button class="delete-btn" data-id="${post.id}">✖</button>
        </div>
      </div>
      <div class="post-content">${post.content}</div>
      <div class="post-meta">
        ${formatTime(post.created_at)}
      </div>
    `;

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
          showModal(id, cardEl);
        };
      }

      if (editBtn) {
        editBtn.onclick = () => {
          startEditingCard(cardEl);
        };
      }
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

    const id = cardEl.dataset.id;
    const contentDiv = cardEl.querySelector(".post-content");
    const metaDiv = cardEl.querySelector(".post-meta");
    if (!contentDiv || !metaDiv) return;

    const originalText = contentDiv.textContent;
    cardEl.dataset.originalContent = originalText;

    const textarea = document.createElement("textarea");
    textarea.className = "post-edit-textarea";
    textarea.value = originalText.trim();

    contentDiv.replaceWith(textarea);

    const actions = document.createElement("div");
    actions.className = "post-edit-actions";
    actions.innerHTML = `
      <button type="button" class="btn-edit-cancel">取消</button>
      <button type="button" class="btn-edit-save">保存</button>
    `;
    metaDiv.before(actions);

    cardEl.classList.add("editing");
    textarea.focus();

    const cancelBtn = actions.querySelector(".btn-edit-cancel");
    const saveBtn = actions.querySelector(".btn-edit-save");

    cancelBtn.addEventListener("click", () => {
      cancelEditingCard(cardEl);
    });

    saveBtn.addEventListener("click", () => {
      saveEditingCard(cardEl, textarea);
    });
  }

  function cancelEditingCard(cardEl) {
    const originalText = cardEl.dataset.originalContent || "";
    const textarea = cardEl.querySelector(".post-edit-textarea");
    const actions = cardEl.querySelector(".post-edit-actions");
    const metaDiv = cardEl.querySelector(".post-meta");

    if (textarea) {
      const contentDiv = document.createElement("div");
      contentDiv.className = "post-content";
      contentDiv.textContent = originalText;
      textarea.replaceWith(contentDiv);
    }

    if (actions) actions.remove();

    if (metaDiv) {
      metaDiv.style.opacity = "";
    }

    cardEl.classList.remove("editing");
    delete cardEl.dataset.originalContent;
  }

  async function saveEditingCard(cardEl, textarea) {
    const id = cardEl.dataset.id;
    if (!id || !textarea) return;

    const newText = textarea.value.trim();
    if (!newText) {
      alert("内容不能为空哦～");
      return;
    }

    const saveBtn = cardEl.querySelector(".btn-edit-save");
    if (!saveBtn) return;

    const originalBtnText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";

    try {
      const updated = await updatePostOnServer(id, newText);
      if (!updated) {
        throw new Error("Update returned empty");
      }

      const contentDiv = document.createElement("div");
      contentDiv.className = "post-content";
      contentDiv.textContent = updated.content;
      textarea.replaceWith(contentDiv);

      const metaDiv = cardEl.querySelector(".post-meta");
      if (metaDiv) {
        metaDiv.textContent = formatTime(updated.created_at);
        metaDiv.style.opacity = "";
      }

      const actions = cardEl.querySelector(".post-edit-actions");
      if (actions) actions.remove();

      cardEl.classList.remove("editing");
      delete cardEl.dataset.originalContent;
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

    const text = input.value.trim();
    if (!text) return;

    // 简单长度限制，避免误贴超大文本
    if (text.length > 2000) {
      alert("内容有点长（>2000字），可以分两条发哦～");
      return;
    }

    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "发送中...";

    try {
      const newPost = await createPostOnServer(text);
      if (!newPost) {
        throw new Error("Empty new post");
      }

      input.value = "";

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

  function handleScrollForEditor() {
    if (!mainEl || !editorCard) return;

    if (!postsSection.classList.contains("section-active")) {
      editorCard.classList.remove("compact");
      if (submitBtn) submitBtn.textContent = "发布";
      return;
    }

    const mainRect = mainEl.getBoundingClientRect();
    const editorRect = editorCard.getBoundingClientRect();

    const threshold = mainRect.top + 16;
    const shouldCompact = editorRect.top <= threshold;

    if (shouldCompact && !editorCard.classList.contains("compact")) {
      editorCard.classList.add("compact");
      if (submitBtn && !submitBtn.disabled) submitBtn.textContent = "✈";
    } else if (!shouldCompact && editorCard.classList.contains("compact")) {
      editorCard.classList.remove("compact");
      if (submitBtn && !submitBtn.disabled) submitBtn.textContent = "发布";
    }
  }

  if (mainEl) {
    mainEl.addEventListener("scroll", handleScrollForEditor);
  }

  /* ========= 绑定发布按钮 / 快捷键 ========= */

  if (submitBtn && input) {
    submitBtn.addEventListener("click", () => {
      const isCompact =
        editorCard && editorCard.classList.contains("compact");

      publishPost({
        scrollToTop: isCompact,
      });
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        publishPost();
      }
    });
  }

  /* ========= 初始化 ========= */
  (async () => {
    await refreshPosts();
    handleScrollForEditor();
  })();
});
