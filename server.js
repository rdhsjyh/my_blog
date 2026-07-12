const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONTENT_CHARS = 10000;

/* ================== 1. 解析 JSON / 表单 ================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================== 2. 数据目录（持久化区） ==================
   - 本地：默认使用 ./data
   - 线上（Render）：可以通过环境变量 DATA_DIR 改成 /var/data 之类的持久磁盘
============================================================ */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* 帖子数据文件：data/posts.json */
const POSTS_FILE = path.join(DATA_DIR, "posts.json");

/* ================== 3. 简易“数据库”：posts.json ==================
   结构：
   {
     id: string,
     content: string,
     created_at: string,
     images: [{ url: string, path: string }] // 旧数据兼容
     media: [{ url: string, path: string, type: "image" | "video" }]
   }
============================================================ */
let posts = [];

/** 启动时从文件加载帖子 */
function loadPosts() {
  try {
    if (!fs.existsSync(POSTS_FILE)) {
      posts = [];
      return;
    }
    const raw = fs.readFileSync(POSTS_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      posts = arr;
    } else {
      posts = [];
    }
    console.log(`Loaded ${posts.length} posts from posts.json`);
  } catch (err) {
    console.error("Failed to load posts.json:", err.message);
    posts = [];
  }
}

/** 每次改动后保存到文件 */
function savePosts() {
  fs.writeFile(
    POSTS_FILE,
    JSON.stringify(posts, null, 2),
    "utf8",
    (err) => {
      if (err) {
        console.error("Failed to save posts.json:", err.message);
      }
    }
  );
}

/* ================== 4. 上传目录 & multer 设置 ==================
   - 默认：data/uploads
   - 可通过环境变量 UPLOAD_DIR 改到别的持久路径
============================================================ */
const uploadDir =
  process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "");
    cb(null, unique + ext);
  },
});

const allowedVideoExts = new Set([".mp4", ".mov", ".m4v"]);
const allowedVideoMimes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
]);

function getMediaType(file) {
  const mime = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (allowedVideoExts.has(ext) || allowedVideoMimes.has(mime)) return "video";

  return null;
}

const upload = multer({
  storage,
  limits: { files: 9 },
  fileFilter: (req, file, cb) => {
    if (getMediaType(file)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image, mp4, mov, and iPhone video files are supported"));
  },
});

const uploadPostMedia = upload.fields([
  { name: "media", maxCount: 9 },
  { name: "images", maxCount: 9 },
]);

function normalizeContentFormat(value) {
  return value === "html" ? "html" : "text";
}

function stripHtml(value) {
  return (value || "")
    .toString()
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-5])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

function getCountableContent(content, format) {
  return normalizeContentFormat(format) === "html"
    ? stripHtml(content)
    : (content || "").toString();
}

function countChars(value) {
  return Array.from((value || "").toString()).length;
}

function getUploadedFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;

  return Object.values(files).flat();
}

function toStoredMedia(file) {
  const type = getMediaType(file);
  if (!type) return null;

  return {
    url: "/uploads/" + file.filename,
    path: path.join(uploadDir, file.filename),
    type,
  };
}

function normalizePostMedia(post) {
  const media = [];

  if (Array.isArray(post.media)) {
    post.media.forEach((item) => {
      if (!item || !item.url) return;
      media.push({
        url: item.url,
        path: item.path,
        type: item.type === "video" ? "video" : "image",
      });
    });
  }

  if (Array.isArray(post.images)) {
    post.images.forEach((img) => {
      if (!img || !img.url) return;
      const alreadyIncluded = media.some((item) => item.url === img.url);
      if (alreadyIncluded) return;
      media.push({
        url: img.url,
        path: img.path,
        type: "image",
      });
    });
  }

  return media;
}

function publicPost(post) {
  const media = normalizePostMedia(post);

  return {
    id: post.id,
    content: post.content,
    content_format: normalizeContentFormat(post.content_format),
    created_at: post.created_at,
    media: media.map((item) => ({
      url: item.url,
      type: item.type,
    })),
    images: media
      .filter((item) => item.type === "image")
      .map((item) => item.url),
    videos: media
      .filter((item) => item.type === "video")
      .map((item) => item.url),
  };
}

/* ================== 5. 静态文件 ================== */

// 前端静态资源：public 目录
app.use(express.static(path.join(__dirname, "public")));

// 附件静态访问：/uploads/xxx.png
app.use("/uploads", express.static(uploadDir));

// 根路径 → public/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================== 6. Posts API（带持久化） ================== */

// 获取帖子列表
app.get("/api/posts", (req, res) => {
  const safePosts = posts.map(publicPost);
  res.json(safePosts);
});

// 创建帖子（支持：纯文字 / 附件 / 图文视频混合）
app.post("/api/posts", (req, res) => {
  uploadPostMedia(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const body = req.body || {};
    const content = (body.content || body.text || "").toString();
    const contentFormat = normalizeContentFormat(body.content_format);
    const countableContent = getCountableContent(content, contentFormat);

    if (countChars(countableContent) > MAX_CONTENT_CHARS) {
      return res.status(400).json({ error: "Content too long" });
    }

    const hasContent = countableContent.trim().length > 0;
    const media = getUploadedFiles(req.files)
      .map(toStoredMedia)
      .filter(Boolean);
    const hasMedia = media.length > 0;

    // 文字和附件都没有才不让发
    if (!hasContent && !hasMedia) {
      return res.status(400).json({ error: "Content or media required" });
    }

    const newPost = {
      id: Date.now().toString(),
      content, // 允许是空字符串（只发附件的情况）
      content_format: contentFormat,
      created_at: new Date().toISOString(),
      media,
      images: media
        .filter((item) => item.type === "image")
        .map((item) => ({
          url: item.url,
          path: item.path,
        })),
    };

    // 最新的在最上面
    posts.unshift(newPost);
    savePosts();

    res.json(publicPost(newPost));
  });
});

// 更新帖子（只改文字，不动附件）
app.put("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const content = (body.content || "").toString();
  const contentFormat = normalizeContentFormat(body.content_format);
  const countableContent = getCountableContent(content, contentFormat);

  if (!countableContent.trim()) {
    return res.status(400).json({ error: "Content required" });
  }

  if (countChars(countableContent) > MAX_CONTENT_CHARS) {
    return res.status(400).json({ error: "Content too long" });
  }

  const post = posts.find((p) => p.id === id);
  if (!post) {
    return res.status(404).json({ success: false });
  }

  post.content = content;
  post.content_format = contentFormat;
  post.created_at = new Date().toISOString();
  savePosts();

  res.json(publicPost(post));
});

// 删除帖子（顺便把对应附件文件删掉）
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;

  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false });
  }

  const post = posts[index];

  normalizePostMedia(post).forEach((item) => {
    if (!item.path) return;
    fs.unlink(item.path, (err) => {
      if (err) {
        console.warn("删除附件失败（可以忽略）：", err.message);
      }
    });
  });

  posts.splice(index, 1);
  savePosts();

  res.json({ success: true });
});

/* ================== 7. 启动服务器 ================== */
loadPosts();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
