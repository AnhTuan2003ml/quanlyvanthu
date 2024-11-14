const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const randomstring = require('randomstring');
const multer = require('multer');
const fs = require('fs');
const { link } = require('joi');

const app = express();

// Middleware cấu hình body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
// Cung cấp các tệp tĩnh từ thư mục 'doc'
app.use('/doc', express.static(path.join(__dirname, 'doc')));


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
// Định nghĩa thư mục lưu trữ là 'doc'
const uploadDir = path.join(__dirname, 'doc');

// Cấu hình multer để lưu file vào thư mục 'doc' và luôn xóa file cũ
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const filePath = path.join(uploadDir, file.originalname);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // Remove the old file if it exists
        }
        cb(null, file.originalname); // Save the file with its original name
    }
});


const upload = multer({ storage: storage });



// API lấy dữ liệu vb_den
app.get('/api/vb_den', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId;
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
    const documentId = parseInt(req.params.id);
    const { tenvb, noidung, ngayden, so, han, nguoiphutrach } = req.body;
    const documentFile = req.file; // Tệp mới nếu có

    // Kiểm tra nếu không có tệp mới, sử dụng tệp cũ
    const filePath = documentFile ? `../../doc/${path.basename(documentFile.filename)}` : req.body.oldFilePath || null;

    // Cập nhật thông tin văn bản, sử dụng filePath mới hoặc cũ
    updateDocument(documentId, tenvb, noidung, ngayden, parseInt(so), han, parseInt(nguoiphutrach), filePath)
        .then(() => {
            // Lưu log vào bản
            const userId = parseInt(req.session.userId);
            saveLog(userId, documentId, filePath,0,"")
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


// API thêm thông tin văn bản đến
app.post('/api/vb_den', upload.single('documentFile'), (req, res) => {
    const { tenvb, noidung, ngayden, so, han, nguoiphutrach } = req.body;
    const documentFile = req.file;
    const filePath = documentFile ? `../../doc/${path.basename(documentFile.filename)}` : req.body.oldFilePath || null;

    // Thêm thông tin văn bản
    addDocument(tenvb, noidung, ngayden, so, han, nguoiphutrach,filePath)
        .then((documentId) => {
            // Lưu log vào bảng log
            const userId = req.session.userId;
            // console.log('Dữ liệu sẽ được insert:', [userId,tenvb, noidung, ngayden, so, han, nguoiphutrach, documentId,filePath]);
            saveLog(userId,documentId,filePath,0,"")
                .then(() => {
                    res.json({ success: true, message: 'Văn bản đã được thêm thành công.' });
                })
                .catch(err => {
                    res.status(500).json({ success: false, message: 'Lỗi khi lưu log.' });
                });
        })
        .catch(err => {
            res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi thêm văn bản.' });
        });
});

// Cập nhật thông tin văn bản vào bảng vb_den
function updateDocument(id, tenvb, noidung, ngayden, so, han, nguoiphutrach, link) {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE vb_den SET tenvb = ?, noidung = ?, ngayden = ?, so = ?, han = ?, nguoiphutrach = ?, link = ? WHERE id = ?`;
        db.run(sql, [tenvb, noidung, ngayden, so, han, nguoiphutrach, link, id], function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}



// Thêm thông tin văn bản vào bảng vb_den
function addDocument(tenvb, noidung, ngayden, so, han, nguoiphutrach, link) {
    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO vb_den (tenvb, noidung, ngayden, so, han, nguoiphutrach, link) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, [tenvb, noidung, ngayden, so, han, nguoiphutrach, link], function (err) {
            if (err) {
                return reject(err);
            }
            // Lấy ID của văn bản vừa chèn vào
            resolve(this.lastID);
        });
    });
}


// Lưu log vào bảng log
function saveLog(userId, id_vb_den, link_vb_den, id_vb_di, link_vb_di) {
    return new Promise((resolve, reject) => {
        const currentTime = new Date().toISOString();

        // Đảm bảo id_vb_den và id_vb_di là kiểu số nguyên
        const documentIdDen = parseInt(id_vb_den);
        const documentIdDi = parseInt(id_vb_di);
        // Sử dụng path.basename để đảm bảo chỉ lấy phần đuôi của link
        const cleanedLinkVbDen = link_vb_den ? `doc/${path.basename(link_vb_den)}` : null;
        const cleanedLinkVbDi = link_vb_di ? `doc/${path.basename(link_vb_di)}` : null;

        console.log('Dữ liệu sẽ được insert:', [userId, cleanedLinkVbDen, currentTime, documentIdDen, cleanedLinkVbDi, documentIdDi]);
        const sql = `INSERT INTO log (id_user, link_vb_den, thoi_gian, id_vb_den, link_vb_di, id_vb_di) VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(sql, [userId, cleanedLinkVbDen, currentTime, documentIdDen, cleanedLinkVbDi, documentIdDi], function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}


// API xóa văn bản
app.delete('/api/vb_den/:id', ensureAuthenticated, (req, res) => {
    const documentId = req.params.id;

    // Kiểm tra xem văn bản có tồn tại hay không
    const sql = `SELECT * FROM vb_den WHERE id = ?`;
    db.get(sql, [documentId], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Lỗi khi kiểm tra văn bản.' });
        }

        if (!row) {
            return res.status(404).json({ success: false, message: 'Văn bản không tồn tại.' });
        }

        // Tiến hành xóa văn bản
        const deleteSql = `DELETE FROM vb_den WHERE id = ?`;
        db.run(deleteSql, [documentId], function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Lỗi khi xóa văn bản.' });
            }

            // Lưu log nếu cần
            const userId = req.session.userId;
            saveLog(userId, documentId, null, null, null)
                .then(() => {
                    res.json({ success: true, message: 'Văn bản đã được xóa thành công.' });
                })
                .catch(err => {
                    res.status(500).json({ success: false, message: 'Lỗi khi lưu log.' });
                });
        });
    });
});


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

app.put('/api/users/:id', (req, res) => {
    const { name, phone, address, email, position, isAdmin } = req.body;
    const userId = parseInt(req.params.id);

    // Kiểm tra xem email mới có tồn tại trong cơ sở dữ liệu hay không
    db.get('SELECT * FROM users WHERE email = ? AND id != ?', [email, userId], (err, row) => {
        if (err) return res.status(500).send('Lỗi khi kiểm tra email.');

        // Nếu email đã tồn tại và không phải là email của người dùng hiện tại, trả về lỗi
        if (row) {
            return res.status(400).json({ error: 'Email này đã tồn tại. Vui lòng chọn email khác.' });
        }

        // Cập nhật thông tin người dùng, bỏ qua mật khẩu
        let sql = `UPDATE users SET ten = ?, sdt = ?, diachi = ?, email = ?, chucvu = ?, is_admin = ? WHERE id = ?`;
        let updateValues = [name, phone, address, email, position, isAdmin, userId];

        // Thực hiện cập nhật vào cơ sở dữ liệu
        db.run(sql, updateValues, function (err) {
            if (err) return res.status(500).send('Đã xảy ra lỗi khi cập nhật người dùng.');

            if (this.changes === 0) {
                return res.status(404).json({ success: false, message: 'Người dùng không tìm thấy.' });
            }

            res.json({ success: true, message: 'Cập nhật thông tin người dùng thành công.' });
        });
    });
});



const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Khởi động server
module.exports = app;