const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

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
     images: [{ url: string, path: string }]
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

// 一次最多 9 张图，字段名：images
const upload = multer({ storage });

/* ================== 5. 静态文件 ================== */

// 前端静态资源：public 目录
app.use(express.static(path.join(__dirname, "public")));

// 图片静态访问：/uploads/xxx.png
app.use("/uploads", express.static(uploadDir));

// 根路径 → public/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================== 6. Posts API（带持久化） ================== */

// 获取帖子列表
app.get("/api/posts", (req, res) => {
  const safePosts = posts.map((p) => ({
    id: p.id,
    content: p.content,
    created_at: p.created_at,
    images: (p.images || []).map((img) => img.url),
  }));
  res.json(safePosts);
});

// 创建帖子（支持：纯文字 / 纯图片 / 图文混合）
app.post("/api/posts", upload.array("images", 9), (req, res) => {
  const body = req.body || {};
  const content = (body.content || body.text || "").toString();

  const hasContent = content.trim().length > 0;

  const images = [];
  if (Array.isArray(req.files)) {
    req.files.forEach((file) => {
      images.push({
        url: "/uploads/" + file.filename,
        path: path.join(uploadDir, file.filename),
      });
    });
  }
  const hasImages = images.length > 0;

  // 文字和图片都没有才不让发
  if (!hasContent && !hasImages) {
    return res.status(400).json({ error: "Content or image required" });
  }

  const newPost = {
    id: Date.now().toString(),
    content, // 允许是空字符串（只发图片的情况）
    created_at: new Date().toISOString(),
    images,
  };

  // 最新的在最上面
  posts.unshift(newPost);
  savePosts();

  res.json({
    id: newPost.id,
    content: newPost.content,
    created_at: newPost.created_at,
    images: newPost.images.map((img) => img.url),
  });
});

// 更新帖子（只改文字，不动图片）
app.put("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const content = (body.content || "").toString();

  if (!content.trim()) {
    return res.status(400).json({ error: "Content required" });
  }

  const post = posts.find((p) => p.id === id);
  if (!post) {
    return res.status(404).json({ success: false });
  }

  post.content = content;
  post.created_at = new Date().toISOString();
  savePosts();

  res.json({
    id: post.id,
    content: post.content,
    created_at: post.created_at,
    images: (post.images || []).map((img) => img.url),
  });
});

// 删除帖子（顺便把对应图片文件删掉）
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;

  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false });
  }

  const post = posts[index];

  if (Array.isArray(post.images)) {
    post.images.forEach((img) => {
      if (!img.path) return;
      fs.unlink(img.path, (err) => {
        if (err) {
          console.warn("删除图片失败（可以忽略）：", err.message);
        }
      });
    });
  }

  posts.splice(index, 1);
  savePosts();

  res.json({ success: true });
});

/* ================== 7. 启动服务器 ================== */
loadPosts();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
