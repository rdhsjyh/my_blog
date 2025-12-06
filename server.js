const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1️⃣ 提供静态文件（index.html / style.css / script.js）
app.use(express.static(path.join(__dirname, "public")));

// 2️⃣ 根路径返回 index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ======== 简单 posts 数据（本地调试用） ========
let posts = [];

// 获取帖子
app.get("/api/posts", (req, res) => {
  res.json(posts);
});

// 创建帖子
app.post("/api/posts", (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim())
    return res.status(400).json({ error: "Content required" });

  const newPost = {
    id: Date.now().toString(),
    content,
    created_at: new Date().toISOString(),
  };

  posts.unshift(newPost);
  res.json(newPost);
});

// 更新帖子
app.put("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim())
    return res.status(400).json({ error: "Content required" });

  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ success: false });

  post.content = content;
  post.created_at = new Date().toISOString();

  res.json(post);
});

// 删除帖子
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const before = posts.length;
  posts = posts.filter((p) => p.id !== id);
  if (posts.length === before) return res.status(404).json({ success: false });

  res.json({ success: true });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
