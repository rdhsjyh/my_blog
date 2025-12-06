// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 获取所有帖子（最新在前）
app.get('/api/posts', (req, res) => {
  const sql = `
    SELECT id, content, created_at
    FROM posts
    ORDER BY datetime(created_at) DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching posts:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// 新建帖子
app.post('/api/posts', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const sql = `INSERT INTO posts (content) VALUES (?)`;
  db.run(sql, [content.trim()], function (err) {
    if (err) {
      console.error('Error inserting post:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    const newId = this.lastID;
    db.get(
      `SELECT id, content, created_at FROM posts WHERE id = ?`,
      [newId],
      (err, row) => {
        if (err) {
          console.error('Error fetching new post:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json(row);
      }
    );
  });
});

// 更新帖子内容（编辑）
app.put('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const sql = `UPDATE posts SET content = ? WHERE id = ?`;
  db.run(sql, [content.trim(), id], function (err) {
    if (err) {
      console.error('Error updating post:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    db.get(
      `SELECT id, content, created_at FROM posts WHERE id = ?`,
      [id],
      (err, row) => {
        if (err) {
          console.error('Error fetching updated post:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(row);
      }
    );
  });
});

// 删除帖子
app.delete('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM posts WHERE id = ?`;

  db.run(sql, [id], function (err) {
    if (err) {
      console.error('Error deleting post:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
