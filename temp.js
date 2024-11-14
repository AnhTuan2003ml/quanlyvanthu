const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const randomstring = require('randomstring');
import multer from 'multer';

const app = express();
const port = 3000;

// Middleware cấu hình body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Cấu hình session
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));

// Kết nối đến cơ sở dữ liệu SQLite
const db = new sqlite3.Database('./data/db.db', (err) => {
    if (err) {
        console.error('Lỗi khi kết nối cơ sở dữ liệu:', err.message);
    } else {
        console.log('Kết nối đến cơ sở dữ liệu thành công');
    }
});

// API đăng nhập
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
            return res.status(500).send('Đã xảy ra lỗi.');
        }

        if (row && password === row.pw) {
            req.session.userId = row.id;
            req.session.userRole = row.is_admin === 1 ? 'admin' : 'user';
            res.json({ success: true, role: req.session.userRole });
        } else {
            res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
        }
    });
});

// Đăng xuất
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Đã xảy ra lỗi khi đăng xuất.');
        }
        res.redirect('/');
    });
});

// Middleware kiểm tra đăng nhập
function ensureAuthenticated(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập trước' });
    }
    next();
}

// Cấu hình multer để lưu file vào thư mục 'doc'
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'doc/'); // Đặt thư mục lưu trữ là 'doc'
    },
    filename: (req, file, cb) => {
        // Đặt tên file là tên gốc kết hợp với thời gian hiện tại để tránh trùng lặp
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
const userId = req.session.userId;
// API lấy dữ liệu vb_den
app.get('/api/vb_den', ensureAuthenticated, (req, res) => {
    const userRole = req.session.userRole;

    let sql = `
        SELECT
            vb_den.*,
            users.id AS nguoiphutrach_id,
            users.ten AS nguoiphutrach
        FROM
            vb_den
        JOIN
            users
        ON
            vb_den.nguoiphutrach = users.id;
    `;

    if (userRole === 'user') {
        sql += ` WHERE vb_den.nguoiphutrach = ?`;
        db.all(sql, [userId], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Lỗi khi truy vấn dữ liệu.' });
            }
            res.json(rows);
        });
    } else {
        db.all(sql, [], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Lỗi khi truy vấn dữ liệu.' });
            }
            res.json(rows);
        });
    }
});

// API cập nhật thông tin văn bản đến
app.put('/api/vb_den/:id', upload.single('documentFile'), (req, res) => {
    const documentId = req.params.id;
    const { tenvb, noidung, ngayden, so, han, nguoiphutrach } = req.body;
    const documentFile = req.file;

    const filePath = documentFile ? `doc/${documentFile.filename}` : null;

    // Cập nhật thông tin văn bản
    updateDocument(documentId, tenvb, noidung, ngayden, so, han, nguoiphutrach, filePath)
        .then(() => {
            // Lưu log vào bảng log
            saveLog(userId,documentId,filePath,null,null)
                .then(() => {
                    res.json({ success: true, message: 'Văn bản đã được cập nhật thành công.' });
                })
                .catch(err => {
                    res.status(500).json({ success: false, message: 'Lỗi khi lưu log.' });
                });
        })
        .catch(err => {
            res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi cập nhật văn bản.' });
        });
});

// API theem thông tin văn bản đến
app.pos('/api/vb_den/:id', upload.single('documentFile'), (req, res) => {
    const documentId = req.params.id;
    const { tenvb, noidung, ngayden, so, han, nguoiphutrach } = req.body;
    const documentFile = req.file;

    const filePath = documentFile ? `doc/${documentFile.filename}` : null;

    // Cập nhật thông tin văn bản
    addDocument(tenvb, noidung, ngayden, so, han, nguoiphutrach, filePath)
        .then(() => {
            // Lưu log vào bảng log
            saveLog(userId,documentId,filePath,null,null)
                .then(() => {
                    res.json({ success: true, message: 'Văn bản đã được cập nhật thành công.' });
                })
                .catch(err => {
                    res.status(500).json({ success: false, message: 'Lỗi khi lưu log.' });
                });
        })
        .catch(err => {
            res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi cập nhật văn bản.' });
        });
});

// Theem thông tin văn bản vào bảng vb_den
function addDocument(tenvb, noidung, ngayden, so, han, nguoiphutrach) {
    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO vb_den ( tenvb , noidung , ngayden , so , han , nguoiphutrach ) = (?,?,?,?,?,?)`;
        db.run(sql, [tenvb, noidung, ngayden, so, han, nguoiphutrach], function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}
// Cập nhật thông tin văn bản vào bảng vb_den
function updateDocument(id, tenvb, noidung, ngayden, so, han, nguoiphutrach) {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE vb_den SET tenvb = ?, noidung = ?, ngayden = ?, so = ?, han = ?, nguoiphutrach = ? WHERE id = ?`;
        db.run(sql, [tenvb, noidung, ngayden, so, han, nguoiphutrach,  id], function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

// Lưu log vào bảng log
function saveLog(userId, id_vb_den, link_vb_den, id_vb_di, link_vb_di) {
    return new Promise((resolve, reject) => {
        const currentTime = new Date().toISOString();
        const sql = `INSERT INTO log (id_user, link_vb_den, thoi_gian, id_vb_den, link_vb_di) VALUES (?, ?, ?, ?, ?)`;
        db.run(sql, [userId, link_vb_den, currentTime, id_vb_den, id_vb_di,link_vb_di], function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

// API lấy danh sách người dùng
app.get('/api/users', (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.json(rows);
    });
});

// API thêm người dùng
app.post('/api/users', (req, res) => {
    const { name, phone, address, email, position, isAdmin } = req.body;
    const randomPassword = randomstring.generate({ length: 12, charset: 'alphanumeric' });
    const hashedPassword = crypto.createHash('sha256').update(randomPassword).digest('hex');

    if (!name || !phone || !address || !email || !position || isAdmin === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = `INSERT INTO users (ten, sdt, diachi, email, pw, chucvu, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, phone, address, email, hashedPassword, position, isAdmin], function (err) {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.status(201).json({ id: this.lastID, name, phone, address, email, randomPassword, position, isAdmin });
    });
});

// Route xóa người dùng
app.delete('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    db.run(`DELETE FROM users WHERE id = ?`, userId, function (err) {
        if (err) {
            return res.status(500).json({ message: 'Lỗi khi xóa người dùng.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Người dùng không tồn tại.' });
        }
        res.status(200).json({ message: 'Người dùng đã được xóa thành công.' });
    });
});

// API cập nhật người dùng
app.put('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id); // Lấy id người dùng từ URL
    const { name, phone, address, email, position, isAdmin } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!name || !phone || !address || !email || !position || isAdmin === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Tạo câu lệnh SQL để cập nhật thông tin người dùng
    const sql = `UPDATE users SET ten = ?, sdt = ?, diachi = ?, email = ?, chucvu = ?, is_admin = ? WHERE id = ?`;

    // Thực thi câu lệnh SQL
    db.run(sql, [name, phone, address, email, position, isAdmin, userId], function (err) {
        if (err) {
            return res.status(500).json({ message: 'Lỗi khi cập nhật người dùng.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Người dùng không tồn tại.' });
        }
        res.status(200).json({ message: 'Người dùng đã được cập nhật thành công.' });
    });
});

// Lắng nghe cổng
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
